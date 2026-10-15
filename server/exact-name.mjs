import sharp from "sharp";
import { resolve } from "node:path";
import { access } from "node:fs/promises";
import { validName } from "../public/batch.js";
import { seededRandom, NAME_STYLE_COUNT } from "../public/design.js";

export const nameStyles = [
  { font: "Karantina Bold", file: "Karantina-Bold.ttf", fill: "#207ba6", lower: "#f5f1da", border: "#e6c62e", slant: -9, opacity: .96 },
  { font: "Karantina Bold", file: "Karantina-Bold.ttf", fill: "#f5f1da", lower: "#f5f1da", border: "#207ba6", slant: 0, opacity: .92 },
  { font: "Karantina Bold", file: "Karantina-Bold.ttf", fill: "#e6c62e", lower: "#e6c62e", border: "#207ba6", slant: -5, opacity: .95 },
  { font: "Karantina Bold", file: "Karantina-Bold.ttf", fill: "#207ba6", lower: "#e6c62e", border: "#f5f1da", slant: 4, opacity: .93 },
  { font: "Karantina Bold", file: "Karantina-Bold.ttf", fill: "#f5f1da", lower: "#207ba6", border: "#e6c62e", slant: -3, opacity: .9 },
  { font: "Rubik Heavy", file: "Rubik-Variable.ttf", fill: "#207ba6", lower: "#207ba6", border: "#e6c62e", slant: -7, opacity: .94, height: 118, outline: 9, rim: 15, depth: 10, runs: 25, runLength: 32, wear: 1800 },
  { font: "Solitreo", file: "Solitreo-Regular.ttf", fill: "#e6c62e", lower: "#f5f1da", border: "#207ba6", slant: 7, opacity: .88, height: 140, stretch: 1.65, outline: 3, rim: 6, depth: 2, runs: 30, runLength: 36, wear: 1900, split: 100 },
  { font: "Suez One", file: "SuezOne-Regular.ttf", fill: "#f5f1da", lower: "#e6c62e", border: "#207ba6", slant: 0, opacity: .93, height: 128, outline: 5, rim: 10, depth: 3, runs: 10, runLength: 20, wear: 2100, split: 128 },
  { font: "Secular One", file: "SecularOne-Regular.ttf", fill: "#082e49", lower: "#082e49", border: "#e6c62e", slant: 5, opacity: .92, height: 116, outline: 4, rim: 11, depth: 6, runs: 20, runLength: 28, wear: 1800, contour: "#f5f1da" },
  { font: "Amatic SC Bold", file: "AmaticSC-Bold.ttf", fill: "#207ba6", lower: "#082e49", border: "#f5f1da", slant: -12, opacity: .9, height: 144, outline: 3, rim: 6, depth: 7, runs: 26, runLength: 30, wear: 1500, split: 145, accent: true },
];
if (nameStyles.length !== NAME_STYLE_COUNT) throw new Error("Name style catalog mismatch");
export const nameVariant = (seed) => 1 + Math.floor(seededRandom(`name:${seed}`)() * NAME_STYLE_COUNT);

// Literal Pango/HarfBuzz glyphs: never reverse, abbreviate or redraw the user's name.
export async function nameGlyph(name, variant = 1) {
  const style = nameStyles[variant - 1];
  if (!style) throw new Error("Invalid name variant");
  return literalGlyph(name, style);
}

export async function literalGlyph(name, style) {
  if (!validName(name)) throw new Error("Invalid name");
  const fontfile = resolve(`public/fonts/${style.file}`);
  await access(fontfile); // Fail closed instead of silently using a machine-specific fallback.
  const escaped = name.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  let glyph = await sharp({ text: { text: `<span foreground="#ffffff">${escaped}</span>`, font: `${style.font} 200`, fontfile, rgba: true } })
    .resize({ width: 880, height: style.height || 144, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
  if (style.stretch) glyph = await sharp(glyph.data).resize({ width: Math.min(880, Math.round(glyph.info.width * style.stretch)), height: glyph.info.height, fit: "fill" }).png().toBuffer({ resolveWithObject: true });
  if (glyph.info.height < 48) throw new Error("השם ארוך מדי לכיתוב קריא בשורה אחת.");
  return glyph;
}

export async function exactNameLayer(name, seed = "name", variant = nameVariant(seed)) {
  const glyph = await nameGlyph(name, variant), style = nameStyles[variant - 1];
  const png = glyph.data.toString("base64"), x = (1080 - glyph.info.width) / 2, y = (230 - glyph.info.height) / 2;
  const random = seededRandom(`paint:${seed}`);
  const alpha = await sharp(glyph.data).extractChannel(3).raw().toBuffer();
  // Runs start on painted strokes, never in the gaps that distinguish letters.
  const drips = [];
  for (let i = 0; i < (style.runs || 18); i++) {
    const column = Math.floor(random() * glyph.info.width);
    let row = glyph.info.height - 1;
    while (row >= 0 && alpha[row * glyph.info.width + column] < 220) row--;
    if (row < glyph.info.height * .35) continue;
    const px = x + column, py = y + row - 2, length = 8 + random() * (style.runLength || 24), width = 1.2 + random() * 2;
    drips.push(`<path d="M${px} ${py}v${length}" stroke="${style.lower}" stroke-width="${width}" stroke-linecap="round" opacity=".72"/>`);
  }
  const spray = Array.from({ length: 180 }, () => `<circle cx="${x - 15 + random() * (glyph.info.width + 30)}" cy="${y - 12 + random() * (glyph.info.height + 36)}" r="${.3 + random() * 1.3}" fill="#207ba6" opacity="${.08 + random() * .24}"/>`).join("");
  // Bounded pinholes: no full-stroke erasures, preserving reading geometry.
  const wear = Array.from({ length: style.wear || 1300 }, () => `<circle cx="${x + random() * glyph.info.width}" cy="${y + random() * glyph.info.height}" r="${.3 + random() * 1.05}" fill="black" opacity="${.15 + random() * .4}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="250"><defs>
    <mask id="letters"><image x="${x}" y="${y}" width="${glyph.info.width}" height="${glyph.info.height}" xlink:href="data:image/png;base64,${png}"/></mask>
    <mask id="wear"><rect width="1080" height="250" fill="white"/>${wear}</mask>
    <filter id="border" x="-10%" y="-30%" width="120%" height="180%"><feMorphology in="SourceAlpha" operator="dilate" radius="${style.rim || 11}" result="expanded"/><feFlood flood-color="${style.border}"/><feComposite in2="expanded" operator="in"/></filter>
    <filter id="navy" x="-10%" y="-30%" width="120%" height="180%"><feMorphology in="SourceAlpha" operator="dilate" radius="${style.outline || 6}" result="expanded"/><feFlood flood-color="${style.contour || "#082e49"}"/><feComposite in2="expanded" operator="in"/></filter></defs>
    ${spray}<g transform="translate(${-Math.tan(style.slant * Math.PI / 180) * 125} 0) skewX(${style.slant})" opacity="${style.opacity}" mask="url(#wear)">
    <image x="${x}" y="${y + (style.depth || 7)}" width="${glyph.info.width}" height="${glyph.info.height}" filter="url(#border)" xlink:href="data:image/png;base64,${png}"/>
    <image x="${x}" y="${y + 3}" width="${glyph.info.width}" height="${glyph.info.height}" filter="url(#navy)" xlink:href="data:image/png;base64,${png}"/>
    ${drips.join("")}<g mask="url(#letters)"><rect width="1080" height="250" fill="${style.fill}"/><rect y="${style.split || 135}" width="1080" height="150" fill="${style.lower}"/>${style.accent ? '<path d="M60 96L1020 106" stroke="#e6c62e" stroke-width="5" opacity=".9"/>' : ""}</g></g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function compositeExactName(bytes, name, seed, variant = nameVariant(seed)) {
  const layer = await exactNameLayer(name, seed, variant);
  return compositeNameLayer(bytes, layer);
}

export async function compositeNameLayer(bytes, layer) {
  const base = await sharp(bytes).resize(1080, 1080).png().toBuffer();
  // Actual wall grain/cracks show through the paint, not a separate flat panel.
  const wall = await sharp(base).extract({ left: 0, top: 0, width: 1080, height: 250 }).removeAlpha().greyscale().raw().toBuffer();
  const { data, info } = await sharp(layer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < wall.length; i++) data[i * 4 + 3] = Math.round(data[i * 4 + 3] * (.83 + .17 * wall[i] / 255));
  return sharp(base).composite([{ input: data, raw: { width: info.width, height: info.height, channels: 4 }, left: 0, top: 0 }]).png().toBuffer();
}
