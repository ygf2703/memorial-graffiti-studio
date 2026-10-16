import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { sourceNames, artworkId } from "./name-artwork-inventory.mjs";
import { validateReleaseCatalog, selectArtwork, loadArtwork, releaseCatalog } from "../server/name-artwork.mjs";

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

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { names } = await sourceNames();
  if (process.argv.includes("--verify-published")) {
    const catalog = await releaseCatalog();
    if (!catalog) console.log("Prebuilt name artwork is not enabled; legacy production behavior is unchanged.");
    else {
      for (const item of catalog.entries) await loadArtwork(catalog, item.name);
      const publicCatalog = JSON.parse(await readFile(resolve("public/name-artwork/catalog.json"), "utf8"));
      if (JSON.stringify(publicCatalog.names) !== JSON.stringify(catalog.entries.map((item) => item.name))) throw new Error("Public availability list differs from release");
      console.log(`Verified ${catalog.entries.length}/${names.length} published assets and checksums.`);
    }
  } else {
    const report = JSON.parse(await readFile(resolve(".netlify/name-library-review/report.json"), "utf8"));
    const reviews = JSON.parse(await readFile(resolve("data/name-artwork/reviews.json"), "utf8"));
    const catalog = reviewedCatalog(report, reviews, names, { partial: process.argv.includes("--partial") });
    if (!process.argv.includes("--publish")) console.log(`Ready: ${catalog.entries.length} assets. No publication performed.`);
    else {
      const root = resolve("public/name-artwork"); await mkdir(root, { recursive: true });
      for (const item of catalog.entries) {
        const check = report.checks.find((row) => row.name === item.name && row.sha256 === item.sha256);
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
      await writeFile(resolve(root, "catalog.json"), JSON.stringify({ sourceCount: names.length, names: catalog.entries.map((item) => item.name) }, null, 2) + "\n", { flag: "wx" });
      // Release manifest is written last and never replaces an existing release.
      await writeFile(resolve("data/name-artwork/release.json"), JSON.stringify(catalog, null, 2) + "\n", { flag: "wx" });
      console.log(`Published ${catalog.entries.length} immutable artwork files locally. Git/deployment still required.`);
    }
  }
}
