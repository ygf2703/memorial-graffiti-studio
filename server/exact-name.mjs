import sharp from "sharp";
import { resolve } from "node:path";
import { validName } from "../public/batch.js";
import { seededRandom } from "../public/design.js";

// Prototype: literal Pango/HarfBuzz text geometry; colour/texture never rewrites letters.
export async function exactNameLayer(name, seed = "name") {
  if (!validName(name)) throw new Error("Invalid name");
  const escaped = name.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const glyph = await sharp({ text: { text: `<span foreground="#ffffff">${escaped}</span>`, font: "Karantina Bold 200", fontfile: resolve("public/fonts/Karantina-Bold.ttf"), rgba: true } })
    .resize({ width: 900, height: 150, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
  if (glyph.info.height < 48) throw new Error("השם ארוך מדי לכיתוב קריא בשורה אחת.");
  const png = glyph.data.toString("base64"), x = (1080 - glyph.info.width) / 2, y = (250 - glyph.info.height) / 2;
  const random = seededRandom(seed);
  const spray = Array.from({ length: 80 }, () => `<circle cx="${80 + random() * 920}" cy="${35 + random() * 180}" r="${.5 + random() * 1.5}" fill="#207ba6" opacity=".3"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="250">
    <defs>
    <mask id="letters"><image x="${x}" y="${y}" width="${glyph.info.width}" height="${glyph.info.height}" xlink:href="data:image/png;base64,${png}"/></mask>
    <filter id="border" x="-10%" y="-30%" width="120%" height="180%"><feMorphology in="SourceAlpha" operator="dilate" radius="13" result="expanded"/><feFlood flood-color="#e6c62e"/><feComposite in2="expanded" operator="in"/></filter>
    <filter id="navy" x="-10%" y="-30%" width="120%" height="180%"><feMorphology in="SourceAlpha" operator="dilate" radius="8" result="expanded"/><feFlood flood-color="#082e49"/><feComposite in2="expanded" operator="in"/></filter></defs>
    ${spray}<g transform="translate(24 0) skewX(-10)">
    <image x="${x}" y="${y + 8}" width="${glyph.info.width}" height="${glyph.info.height}" filter="url(#border)" xlink:href="data:image/png;base64,${png}"/>
    <image x="${x}" y="${y + 5}" width="${glyph.info.width}" height="${glyph.info.height}" filter="url(#navy)" xlink:href="data:image/png;base64,${png}"/>
    <g mask="url(#letters)"><rect width="1080" height="250" fill="#f5f1da"/><rect y="130" width="1080" height="120" fill="#207ba6"/>
    ${Array.from({ length: 1000 }, () => `<circle cx="${50 + random() * 980}" cy="${20 + random() * 210}" r="${.4 + random() * .9}" fill="#082e49" opacity=".18"/>`).join("")}</g></g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
