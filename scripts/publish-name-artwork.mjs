import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { sourceNames, artworkId } from "./name-artwork-inventory.mjs";
import { validateReleaseCatalog, selectArtwork, loadArtwork, releaseCatalog } from "../server/name-artwork.mjs";
import { loadNameRoster, validateNameRoster, validateRosterCoverage } from "../server/name-roster.mjs";

export function reviewedCatalog(report, reviews, names, { partial = false } = {}) {
  const entries = names.flatMap((name) => {
    const check = report.checks.find((item) => item.name === name && item.id === artworkId(name));
    const review = check && reviews.find((item) => item.name === name && item.sha256 === check.sha256);
    if (!check?.technicalPass || !check.renderChecked || !review?.spellingChecked || !review.visualChecked || !review.renderChecked) {
      if (partial) return [];
      throw new Error(`Not verified: ${name}`);
    }
    const entry = { name, file: `${check.sha256.slice(0, 20)}.png`, sha256: check.sha256, status: "verified", spellingChecked: true, visualChecked: true, renderChecked: true, style: check.style || review.style || null, ocr: review.ocr };
    try { selectArtwork({ entries: [entry] }, name); }
    catch (error) { if (partial) return []; throw error; }
    return [entry];
  });
  const catalog = { version: 1, ...(partial ? { mode: "partial", sourceCount: new Set(names).size } : {}), entries };
  validateReleaseCatalog(catalog, names);
  return catalog;
}

// An expansion cannot remove a published name or silently replace its pixels.
export function extendCatalog(previous, candidate, names) {
  validateReleaseCatalog(previous, names);
  validateReleaseCatalog(candidate, names);
  const entries = new Map(previous.entries.map((item) => [item.name, item]));
  for (const item of candidate.entries) {
    const existing = entries.get(item.name);
    if (existing && (existing.sha256 !== item.sha256 || existing.file !== item.file)) throw new Error(`Published artwork replacement requires a separate review: ${item.name}`);
    if (!existing) entries.set(item.name, item);
  }
  const catalog = { version: 1, mode: "partial", sourceCount: new Set(names).size, entries: [...new Set(names)].filter((name) => entries.has(name)).map((name) => entries.get(name)), ...(candidate.aliases ? { aliases: candidate.aliases } : {}) };
  validateReleaseCatalog(catalog, names);
  return catalog;
}

// Only this explicit reconciliation permits retirement; immutable PNGs stay on disk.
export function reconcileRoster(previous, candidate, previousNames, roster) {
  validateReleaseCatalog(previous, previousNames);
  const { names, aliases } = validateNameRoster(roster);
  validateReleaseCatalog(candidate, names);
  const retired = new Set(roster.retiredNames);
  const removed = previous.entries.filter((row) => !names.includes(row.name));
  if (removed.length !== retired.size || removed.some((row) => !retired.has(row.name))) throw new Error("Retirements differ from approved roster");
  const entries = candidate.entries.map((row) => {
    const old = previous.entries.find((item) => item.name === row.name);
    if (old && (old.sha256 !== row.sha256 || old.file !== row.file)) throw new Error("Cannot replace existing artwork during reconciliation");
    return old || row;
  });
  const catalog = { ...candidate, entries, aliases };
  validateRosterCoverage(catalog, roster);
  return catalog;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { names } = await sourceNames();
  const roster = await loadNameRoster();
  if (process.argv.includes("--verify-published")) {
    const catalog = await releaseCatalog();
    if (!catalog) console.log("Prebuilt name artwork is not enabled; legacy production behavior is unchanged.");
    else {
      for (const item of catalog.entries) await loadArtwork(catalog, item.name);
      const publicCatalog = JSON.parse(await readFile(resolve("public/name-artwork/catalog.json"), "utf8"));
      if (JSON.stringify(publicCatalog.names) !== JSON.stringify(catalog.entries.map((item) => item.name))) throw new Error("Public availability list differs from release");
      if (JSON.stringify(publicCatalog.aliases || {}) !== JSON.stringify(catalog.aliases || {})) throw new Error("Public aliases differ from release");
      if (roster) validateRosterCoverage(catalog, roster);
      console.log(`Verified ${catalog.entries.length}/${names.length} published assets and checksums.`);
    }
  } else {
    const report = JSON.parse(await readFile(resolve(".netlify/name-library-review/report.json"), "utf8"));
    const reviews = JSON.parse(await readFile(resolve("data/name-artwork/reviews.json"), "utf8"));
    let catalog = reviewedCatalog(report, reviews, names, { partial: process.argv.includes("--partial") });
    const reconcile = process.argv.includes("--reconcile-roster");
    const previous = reconcile ? JSON.parse(await readFile(resolve("data/name-artwork/release.json"), "utf8")) : await releaseCatalog();
    const update = process.argv.includes("--update");
    if (roster) catalog.aliases = validateNameRoster(roster).aliases;
    if (update && !previous) throw new Error("No published release to expand");
    if (reconcile) {
      if (!roster || !previous || !update) throw new Error("Roster reconciliation requires an existing release and --update");
      const previousNames = (await readFile(resolve("data/name-artwork/names-2026-10-16.txt"), "utf8")).trim().split(/\r?\n/u);
      catalog = reconcileRoster(previous, catalog, previousNames, roster);
    } else if (previous && update) catalog = extendCatalog(previous, catalog, names);
    if (roster) validateRosterCoverage(catalog, roster);
    if (!process.argv.includes("--publish")) console.log(`Ready: ${catalog.entries.length} assets. No publication performed.`);
    else {
      if (previous && !update) throw new Error("Release already exists; use --update for an additive expansion");
      if (previous) for (const item of previous.entries) await loadArtwork(previous, item.name);
      const root = resolve("public/name-artwork"); await mkdir(root, { recursive: true });
      for (const item of catalog.entries) {
        const check = report.checks.find((row) => row.name === item.name && row.sha256 === item.sha256);
        if (previous?.entries.some((row) => row.name === item.name && row.sha256 === item.sha256)) continue;
        if (!new RegExp(`^${artworkId(item.name)}(?:-v[0-9]+)?\\.png$`, "u").test(check.file)) throw new Error("Invalid candidate path");
        const source = resolve(".netlify/name-library-drafts", check.file);
        if (createHash("sha256").update(await readFile(source)).digest("hex") !== item.sha256) throw new Error(`Changed after review: ${item.name}`);
        try { await copyFile(source, resolve(root, item.file), constants.COPYFILE_EXCL); }
        catch (error) {
          if (error.code !== "EEXIST") throw error;
          if (createHash("sha256").update(await readFile(resolve(root, item.file))).digest("hex") !== item.sha256) throw new Error("Existing immutable asset differs");
        }
        await loadArtwork(catalog, item.name, root);
      }
      // These are local Git working-tree manifests, not a live storage mutation.
      // Publish both together in one commit; source PNGs remain immutable.
      const flag = update ? "w" : "wx";
      await writeFile(resolve(root, "catalog.json"), JSON.stringify({ sourceCount: names.length, names: catalog.entries.map((item) => item.name), ...(catalog.aliases ? { aliases: catalog.aliases } : {}) }, null, 2) + "\n", { flag });
      await writeFile(resolve("data/name-artwork/release.json"), JSON.stringify(catalog, null, 2) + "\n", { flag });
      console.log(`Published ${catalog.entries.length} immutable artwork files locally. Git/deployment still required.`);
    }
  }
}
