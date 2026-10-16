import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const report = JSON.parse(await readFile(resolve(".netlify/name-library-review/report.json"), "utf8"));
const offset = Number(process.argv[2] || 0), count = Number(process.argv[3] || 8);
if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(count) || count < 1 || count > 12) throw new Error("Invalid range");
const selected = report.checks.slice(offset, offset + count), cellWidth = 1040, cellHeight = 350;
if (!selected.length) throw new Error("Empty review page");
const tiles = [];
for (const [i, item] of selected.entries()) {
  const image = await sharp(resolve(".netlify/name-library-review", `${item.id}-layer.png`)).resize({ width: 1000, height: 270, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
  const escaped = item.name.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const text = await sharp({ text: { text: `<span foreground="#082e49">${offset + i + 1}. ${escaped}</span>`, font: "Arial 25", rgba: true } }).png().toBuffer();
  const tile = await sharp({ create: { width: cellWidth, height: cellHeight, channels: 4, background: i % 2 ? "#a9b4bc" : "#e4d9c4" } })
    .composite([{ input: text, top: 8, left: 25 }, { input: image.data, top: 55, left: Math.round((cellWidth - image.info.width) / 2) }]).png().toBuffer();
  tiles.push({ input: tile, left: i % 2 * cellWidth, top: Math.floor(i / 2) * cellHeight });
}
const dir = resolve(".netlify/name-library-review"); await mkdir(dir, { recursive: true });
const path = resolve(dir, `sheet-${offset}.png`);
await sharp({ create: { width: cellWidth * 2, height: Math.ceil(selected.length / 2) * cellHeight, channels: 4, background: "#ffffff" } }).composite(tiles).png().toFile(path);
console.log(JSON.stringify({ path, names: selected.map((item) => ({ name: item.name, id: item.id })) }));
