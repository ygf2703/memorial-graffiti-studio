import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { artworkLayer, compositeArtwork } from "../server/name-artwork.mjs";
import { sourceNames, artworkId } from "./name-artwork-inventory.mjs";

const root = resolve(".netlify/name-library-drafts"), out = resolve(".netlify/name-library-review");
await mkdir(out, { recursive: true });
const { rows, names } = await sourceNames();
const available = await readdir(root), checks = [];
for (const name of names) {
  const id = artworkId(name);
  const provenance = await readFile(resolve(root, `${id}.json`), "utf8").then(JSON.parse).catch(() => null);
  const file = provenance?.file || `${id}.png`;
  if (!new RegExp(`^${id}(?:-v[0-9]+)?\\.png$`, "u").test(file)) throw new Error("Invalid candidate path");
  if (!available.includes(file)) continue;
  const bytes = await readFile(resolve(root, file)), meta = await sharp(bytes).metadata();
  const alpha = await sharp(bytes).ensureAlpha().extractChannel(3).raw().toBuffer();
  const transparentPixels = alpha.reduce((sum, value) => sum + (value === 0 ? 1 : 0), 0);
  const corners = [0, meta.width - 1, (meta.height - 1) * meta.width, alpha.length - 1].map((i) => alpha[i]);
  // Alpha 1–2/255 is subvisual encoding residue, not an opaque backdrop. The
  // runtime layer adds empty safe margins independently; source pixels stay intact.
  const provenanceMatches = provenance?.name === name && provenance.id === id && Number.isInteger(provenance.style) && provenance.style >= 1 && provenance.style <= 10;
  const technicalPass = provenanceMatches && meta.format === "png" && meta.hasAlpha && transparentPixels > alpha.length * .05 && corners.every((a) => a <= 2);
  const layer = await artworkLayer(bytes);
  await writeFile(resolve(out, `${id}-layer.png`), layer);
  // Native application rendering, not a redraw or change to the source name asset.
  for (const [label, background] of [["light", "#d9cbb3"], ["dark", "#263744"]]) {
    const wall = await sharp({ create: { width: 1080, height: 1080, channels: 3, background } }).png().toBuffer();
    await writeFile(resolve(out, `${id}-${label}.png`), await compositeArtwork(wall, bytes));
  }
  checks.push({ name, id, file, style: provenance?.style || null, width: meta.width, height: meta.height, sha256: createHash("sha256").update(bytes).digest("hex"), transparentPixels, corners, provenanceMatches, technicalPass, renderChecked: true, status: "pending-spelling-and-visual-review" });
}
const report = { sourceRows: rows.length, uniqueNames: names.length, generated: checks.length, missing: names.filter((name) => !checks.some((c) => c.name === name)), technicalFailures: checks.filter((c) => !c.technicalPass).map((c) => c.name), checks };
await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
// Escape displayed text even though the input list is local and trusted.
const escape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const cards = checks.map((c) => `<article><h2>${escape(c.name)}</h2><p>${c.technicalPass ? "בדיקה טכנית עברה" : "נדרשת בדיקה טכנית"} — האיות טרם אושר</p><img src="${basename(root)}/${c.file}" alt="${escape(c.name)}"><div><img src="name-library-review/${c.id}-light.png"><img src="name-library-review/${c.id}-dark.png"></div></article>`).join("\n");
await writeFile(resolve(".netlify/name-library-review.html"), `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>בדיקת מאגר גרפיטי</title><style>body{background:#102234;color:#fff;font:18px Arial;margin:30px}article{border:1px solid #567;margin-bottom:30px;padding:16px}img{max-width:100%;display:block}div{display:flex}div img{width:45%}p{color:#efcb32}</style><h1>בדיקת מאגר: ${checks.length}/${names.length}</h1><p>תצוגה מקומית בלבד. תוצר גנרטיבי אינו מאושר אוטומטית.</p>${cards}</html>`);
console.log(JSON.stringify({ generated: checks.length, total: names.length, technicalFailures: report.technicalFailures, report: resolve(out, "report.json") }));
