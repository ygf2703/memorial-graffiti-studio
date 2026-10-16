import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { selectArtwork, validateCompleteCatalog, validateReleaseCatalog, artworkLayer, compositeArtwork, fetchArtwork } from "../server/name-artwork.mjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { validName } from "../public/batch.js";
import { reviewedCatalog, extendCatalog } from "../scripts/publish-name-artwork.mjs";
import { artworkId } from "../scripts/name-artwork-inventory.mjs";

const entry = (name, sha256 = "b".repeat(64)) => ({ name, file: "a".repeat(20) + ".png", sha256, status: "verified", spellingChecked: true, visualChecked: true, renderChecked: true, ocr: { status: "matched", text: name, uncertain: false, sha256 } });
test("artwork lookup preserves exact spelling, punctuation and niqqud", () => {
  const name = "יוֹבֵל (יובל) מוריוסף", catalog = { entries: [entry(name)] };
  assert.equal(selectArtwork(catalog, name).name, name);
  assert.throws(() => selectArtwork(catalog, "יובל (יובל) מוריוסף"));
  assert.throws(() => selectArtwork(catalog, name + " "));
});
test("unreviewed, missing or unsafe artwork is never selected", () => {
  for (const patch of [{ status: "generated-unreviewed" }, { spellingChecked: false }, { visualChecked: false }, { renderChecked: false }, { file: "../secret.png" }, { sha256: "bad" }]) {
    assert.throws(() => selectArtwork({ entries: [{ ...entry("שם"), ...patch }] }, "שם"));
  }
  assert.throws(() => selectArtwork({ entries: [] }, "חסר"));
});
test("all supplied names, including parentheses, comma and niqqud, pass literal input validation", async () => {
  const names = (await readFile(new URL("../data/name-artwork/names-2026-10-16.txt", import.meta.url), "utf8")).trim().split(/\r?\n/u);
  assert.equal(names.length, 347); assert.equal(new Set(names).size, 344);
  for (const name of names) assert.equal(validName(name), true, name);
  assert.ok(names.includes("עומר בלווה")); assert.ok(!names.includes("עומר בלוה"));
  for (const name of ["<script>שם</script>", "שם/אחר", "שם\\אחר", "שם\nאחר", "שם123"]) assert.equal(validName(name), false);
});
test("downloaded assets are pinned by checksum; HTML, redirects, altered bytes and oversized assets fail closed", async () => {
  const png = await sharp({ create: { width: 100, height: 100, channels: 4, background: "#207ba680" } }).png().toBuffer();
  const pinned = entry("שם", createHash("sha256").update(png).digest("hex"));
  const result = await fetchArtwork(pinned, async (url, options) => {
    assert.equal(url.href, `https://studio.example/name-artwork/${pinned.file}`);
    assert.equal(options.redirect, "error");
    return new Response(png, { headers: { "content-type": "image/png" } });
  }, "https://studio.example/");
  assert.deepEqual(result, png);
  for (const response of [new Response("html", { headers: { "content-type": "text/html" } }), new Response("bad", { headers: { "content-type": "image/png" } }), new Response(png, { headers: { "content-type": "image/png", "content-length": "999999999" } }), new Response(null, { status: 404 })]) {
    await assert.rejects(fetchArtwork(pinned, async () => response, "https://studio.example/"));
  }
  await assert.rejects(fetchArtwork(pinned, async () => { throw new Error("network"); }, "https://studio.example/"));
});
test("release requires full unique coverage; source duplicates are retained without duplicate assets", () => {
  const catalog = { version: 1, entries: [entry("שם אחד"), entry("שם שני")] };
  assert.equal(validateCompleteCatalog(catalog, ["שם אחד", "שם שני", "שם אחד"]), true);
  assert.throws(() => validateCompleteCatalog(catalog, ["שם אחד", "שם שני", "שם חסר"]));
  assert.throws(() => validateCompleteCatalog({ version: 1, entries: [entry("שם אחד"), entry("שם אחד")] }, ["שם אחד", "שם שני"]));
});
test("publishing requires a visual review bound to the actual generated file", () => {
  const name = "שם אחד", sha256 = "a".repeat(64);
  const report = { checks: [{ name, id: artworkId(name), sha256, technicalPass: true, renderChecked: true }] };
  const review = { name, sha256, spellingChecked: true, visualChecked: true, renderChecked: true, ocr: { status: "matched", text: name, uncertain: false, sha256 } };
  assert.equal(reviewedCatalog(report, [review], [name]).entries[0].file, "a".repeat(20) + ".png");
  for (const patch of [{ sha256: "b".repeat(64) }, { spellingChecked: false }, { visualChecked: false }, { renderChecked: false }]) assert.throws(() => reviewedCatalog(report, [{ ...review, ...patch }], [name]));
  assert.throws(() => reviewedCatalog(report, [review], [name, "שם חסר"]));
  assert.throws(() => reviewedCatalog({ checks: [{ ...report.checks[0], technicalPass: false }] }, [review], [name]));
  assert.throws(() => reviewedCatalog(report, [{ ...review, ocr: undefined }], [name]));
  assert.throws(() => reviewedCatalog(report, [{ ...review, ocr: { ...review.ocr, text: "שם שגוי" } }], [name]));
  assert.throws(() => reviewedCatalog(report, [{ ...review, ocr: { ...review.ocr, sha256: "b".repeat(64) } }], [name]));
});
test("partial releases allow only reviewed source names and still block unavailable names", () => {
  const names = ["שם אחד", "שם שני"], catalog = { version: 1, mode: "partial", sourceCount: 2, entries: [entry(names[0])] };
  assert.equal(validateReleaseCatalog(catalog, names), true);
  assert.throws(() => selectArtwork(catalog, names[1]));
  for (const entries of [[], [entry("לא ברשימה")], [entry(names[0]), entry(names[0])], [{ ...entry(names[0]), spellingChecked: false }]]) assert.throws(() => validateReleaseCatalog({ ...catalog, entries }, names));
  assert.throws(() => validateReleaseCatalog({ ...catalog, sourceCount: 3 }, names));
  assert.throws(() => validateReleaseCatalog({ ...catalog, mode: undefined }, names));
});
test("partial publisher excludes stale, unchecked and OCR-disagreed artwork without weakening review", () => {
  const names = ["שם אחד", "שם שני", "שם שלישי"], sha256 = "a".repeat(64);
  const checks = names.map((name) => ({ name, id: artworkId(name), sha256, technicalPass: true, renderChecked: true }));
  const reviews = names.map((name) => ({ ...entry(name, sha256), name }));
  reviews[1].sha256 = "b".repeat(64);
  reviews[2].ocr.text = "איות שגוי";
  const catalog = reviewedCatalog({ checks }, reviews, names, { partial: true });
  assert.deepEqual(catalog.entries.map((item) => item.name), [names[0]]);
  assert.equal(catalog.sourceCount, 3);
  assert.throws(() => reviewedCatalog({ checks }, reviews.slice(1), names, { partial: true }));
});
test("catalog expansion retains every published asset and rejects replacement or unknown names", () => {
  const names = ["שם אחד", "שם שני", "שם שלישי"];
  const previous = { version: 1, mode: "partial", sourceCount: 3, entries: [entry(names[0])] };
  const candidate = { ...previous, entries: [entry(names[1])] };
  const expanded = extendCatalog(previous, candidate, names);
  assert.deepEqual(expanded.entries.map((item) => item.name), names.slice(0, 2));
  assert.equal(expanded.entries[0], previous.entries[0]);
  assert.throws(() => extendCatalog(previous, { ...candidate, entries: [entry(names[0], "c".repeat(64))] }, names));
  assert.throws(() => extendCatalog(previous, { ...candidate, entries: [entry("שם זר")] }, names));
  assert.throws(() => extendCatalog(previous, { ...candidate, entries: [{ ...entry(names[1]), visualChecked: false }] }, names));
});
test("OCR disagreement requires an explicit visual override bound to the reviewed asset", () => {
  const candidate = entry("שם");
  candidate.ocr = { ...candidate.ocr, status: "needs_review", text: "שס" };
  assert.throws(() => selectArtwork({ entries: [candidate] }, "שם"));
  candidate.ocr.overrideReason = "נבדקה במקור אות ם סופית סגורה, ולא אות ס כפי שתומללה.";
  assert.equal(selectArtwork({ entries: [candidate] }, "שם"), candidate);
});
test("wide and two-line transparent assets render safely on light and dark 1080px walls", async () => {
  for (const [width, height] of [[2000, 650], [1700, 1000]]) {
    const asset = await sharp({ create: { width, height, channels: 4, background: "#207ba680" } }).png().toBuffer();
    const layer = await artworkLayer(asset);
    const meta = await sharp(layer).metadata();
    assert.equal(meta.width, 1080); assert.equal(meta.height, 250); assert.equal(meta.hasAlpha, true);
    const rgba = await sharp(layer).raw().toBuffer();
    assert.equal(rgba[3], 0);
    for (const background of ["#efe4ce", "#15263a"]) {
      const wall = await sharp({ create: { width: 1080, height: 1080, channels: 3, background } }).png().toBuffer();
      const result = await compositeArtwork(wall, asset), metadata = await sharp(result).metadata();
      assert.equal(metadata.width, 1080); assert.equal(metadata.height, 1080); assert.equal(metadata.format, "png");
      assert.notDeepEqual(result, wall);
    }
  }
});
