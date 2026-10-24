import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import sharp from "sharp";
import { compositeNameLayer } from "./exact-name.mjs";
import { validName, resolveArtworkName } from "../public/batch.js";
import { loadNameRoster, validateNameRoster, validateRosterCoverage } from "./name-roster.mjs";

// Generated pixels are immutable after review; never regenerate letters at runtime.
export function selectArtwork(catalog, name) {
  name = resolveArtworkName(name, catalog.aliases);
  const entry = catalog.entries.find((item) => item.name === name);
  if (!entry || entry.status !== "verified" || !entry.visualChecked || !entry.spellingChecked || !entry.renderChecked) {
    throw new Error("השם עדיין לא מוכן במאגר הגרפיטי. לא נשלחה בקשת יצירה.");
  }
  if (!/^[a-f0-9]{20}\.png$/u.test(entry.file) || !/^[a-f0-9]{64}$/u.test(entry.sha256)) throw new Error("Invalid artwork manifest");
  if (entry.composition !== undefined && (entry.composition !== "side-two-line-v1" || entry.layoutReview?.sha256 !== entry.sha256 || !Array.isArray(entry.layoutReview?.lines) || entry.layoutReview.lines.length !== 2 || entry.layoutReview.lines.some(line=>typeof line!=="string"||!line.trim()) || entry.layoutReview.lines.join(" ") !== name)) throw new Error("Invalid artwork composition review");
  const reading = entry.ocr;
  const matched = reading?.status === "matched" && reading.uncertain === false && typeof reading.text === "string" && reading.text.normalize("NFC") === name.normalize("NFC");
  const override = ["needs_review", "unavailable"].includes(reading?.status) && typeof reading.overrideReason === "string" && reading.overrideReason.trim().length >= 20;
  if (reading?.sha256 !== entry.sha256 || (!matched && !override)) throw new Error("Artwork reading review is incomplete");
  if (entry.wrapped) {
    if (entry.wrapped.name !== entry.name || entry.wrapped.wrapped || entry.wrapped.sha256 === entry.sha256) throw new Error("Invalid wrapped artwork");
    selectArtwork({entries:[entry.wrapped]},entry.name);
  }
  return entry;
}

export async function loadArtwork(catalog, name, root = resolve("public/name-artwork")) {
  const entry = selectArtwork(catalog, name);
  const bytes = await readFile(resolve(root, entry.file));
  if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error("Artwork checksum mismatch");
  const metadata = await sharp(bytes).metadata();
  if (metadata.format !== "png" || !metadata.hasAlpha) throw new Error("Artwork must be transparent PNG");
  if (entry.wrapped) await loadArtwork({entries:[entry.wrapped]},entry.name,root);
  return { entry, bytes };
}

export async function releaseCatalog() {
  let catalog;
  try { catalog = JSON.parse(await readFile(resolve("data/name-artwork/release.json"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  const roster = await loadNameRoster();
  const names = roster ? validateNameRoster(roster).names : (await readFile(resolve("data/name-artwork/names-2026-10-16.txt"), "utf8")).trim().split(/\r?\n/u);
  validateReleaseCatalog(catalog, names);
  if (roster) validateRosterCoverage(catalog, roster);
  return catalog;
}

export async function fetchArtwork(entry, fetcher = fetch, site = process.env.STUDIO_SITE_URL) {
  // Revalidate durable job metadata; do not accept a path or URL from the browser.
  selectArtwork({ entries: [entry] }, entry.name);
  const base = new URL(site);
  if (base.protocol !== "https:" && !(process.env.NETLIFY_DEV === "true" && ["localhost", "127.0.0.1"].includes(base.hostname))) throw new Error("Invalid artwork site");
  const response = await fetcher(new URL(`/name-artwork/${entry.file}`, base), { redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.headers.get("content-type")?.includes("image/png")) throw new Error("Artwork is unavailable");
  if (Number(response.headers.get("content-length")) > 12 * 1024 * 1024) throw new Error("Artwork exceeds limit");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 12 * 1024 * 1024 || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error("Artwork checksum mismatch");
  const metadata = await sharp(bytes).metadata();
  if (metadata.format !== "png" || !metadata.hasAlpha) throw new Error("Artwork must be transparent PNG");
  return bytes;
}

export async function artworkLayer(bytes) {
  // Remove empty padding only; preserve painted glyphs, overspray and paint runs.
  const trimmed = await sharp(bytes).trim({ background: "#00000000", threshold: 0 }).png().toBuffer();
  const asset = await sharp(trimmed).resize({ width: 990, height: 310, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
  return sharp({ create: { width: 1080, height: 340, channels: 4, background: "#00000000" } })
    .composite([{ input: asset.data, left: Math.round((1080 - asset.info.width) / 2), top: Math.round((340 - asset.info.height) / 2) }]).png().toBuffer();
}

export async function compositeArtwork(bytes, artwork) {
  return compositeNameLayer(bytes, await artworkLayer(artwork));
}

export function validateCompleteCatalog(catalog, names) {
  const unique = [...new Set(names)];
  if (!catalog || catalog.version !== 1 || !Array.isArray(catalog.entries)) throw new Error("Invalid catalog");
  if (catalog.entries.length !== unique.length || new Set(catalog.entries.map((item) => item.name)).size !== unique.length) throw new Error("Incomplete or duplicate catalog");
  for (const name of unique) selectArtwork(catalog, name);
  return true;
}

export function validateReleaseCatalog(catalog, names) {
  if (catalog?.aliases !== undefined) {
    if (!catalog.aliases || typeof catalog.aliases !== "object" || Array.isArray(catalog.aliases)) throw new Error("Invalid artwork aliases");
    for (const [alias, target] of Object.entries(catalog.aliases)) {
      if (!validName(alias) || !validName(target) || Object.hasOwn(catalog.aliases, target) || catalog.entries.some((row) => row.name === alias) || !catalog.entries.some((row) => row.name === target)) throw new Error("Invalid artwork alias target");
    }
  }
  if (catalog?.mode !== "partial") return validateCompleteCatalog(catalog, names);
  const allowed = new Set(names);
  if (catalog.version !== 1 || !Array.isArray(catalog.entries) || !catalog.entries.length || catalog.sourceCount !== allowed.size) throw new Error("Invalid partial catalog");
  const published = new Set();
  for (const item of catalog.entries) {
    if (!allowed.has(item.name) || published.has(item.name)) throw new Error("Unknown or duplicate catalog name");
    published.add(item.name);
    selectArtwork(catalog, item.name);
  }
  return true;
}
