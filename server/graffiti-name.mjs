import sharp from "sharp";
import { literalGlyph, compositeNameLayer } from "./exact-name.mjs";
import { seededRandom, NAME_STYLE_COUNT } from "../public/design.js";

export const NAME_STYLE_VERSION = 2;
const navy = "#082e49", blue = "#207ba6", yellow = "#e6c62e", white = "#f5f1da";
// The order follows the user's 01–10 reference board. Letter geometry remains literal.
export const graffitiStyles = [
  { label: "בועות כחולות", font: "Varela Round", file: "VarelaRound-Regular.ttf", fill: blue, rim: yellow, expand: 3, outline: 9, skew: -5, shine: true, shadow: 5, cloud: yellow, runs: 20 },
  { label: "בלוקים זוויתיים", font: "Suez One", file: "SuezOne-Regular.ttf", fill: white, rim: yellow, outline: 5, skew: -13, shadow: 14, cloud: blue, arrows: true, runs: 15 },
  { label: "סטנסיל צהוב נוזל", font: "Karantina Bold", file: "Karantina-Bold.ttf", fill: yellow, rim: navy, outline: 4, skew: 0, shadow: 2, cloud: navy, runs: 44, worn: 1.6, stencil: true },
  { label: "כתב יד כחול", font: "Gveret Levin", file: "GveretLevin-Regular.ttf", fill: blue, rim: white, expand: 1.5, outline: 2, skew: -14, shadow: 3, cloud: blue, runs: 14, underline: true, stretch: 1.4 },
  { label: "סטנסיל לבן שחוק", font: "Secular One", file: "SecularOne-Regular.ttf", fill: white, rim: blue, outline: 3, skew: 0, shadow: 3, cloud: yellow, runs: 30, worn: 1.8, stencil: true },
  { label: "בלוק כחול תלת־ממדי", font: "Rubik Heavy", file: "Rubik-Variable.ttf", fill: blue, rim: yellow, outline: 6, skew: -10, shadow: 18, cloud: blue, runs: 24, shine: true, arrows: true },
  { label: "חתימת ספריי צהובה", font: "Gveret Levin", file: "GveretLevin-Regular.ttf", fill: yellow, rim: navy, expand: 2, outline: 3, skew: -8, shadow: 4, cloud: navy, runs: 24, underline: true, stretch: 1.6 },
  { label: "בלוק לבן־כחול", font: "Suez One", file: "SuezOne-Regular.ttf", fill: white, lower: blue, rim: yellow, outline: 5, skew: -8, shadow: 12, cloud: blue, runs: 24, arrows: true },
  { label: "בועות נייבי שחוקות", font: "Varela Round", file: "VarelaRound-Regular.ttf", fill: navy, rim: yellow, contour: white, expand: 3, outline: 5, skew: 0, shadow: 6, cloud: blue, runs: 30, worn: 1.5, shine: true },
  { label: "בלוק כחול מואר", font: "Secular One", file: "SecularOne-Regular.ttf", fill: blue, lower: navy, rim: white, outline: 5, skew: -14, shadow: 15, cloud: yellow, runs: 22, shine: true, arrows: true },
];
if (graffitiStyles.length !== NAME_STYLE_COUNT) throw new Error("Graffiti style catalog mismatch");
export async function graffitiGlyph(name, variant) {
  const style = graffitiStyles[variant - 1];
  if (!style) throw new Error("Invalid graffiti style");
  return literalGlyph(name, { ...style, height: 132 });
}

export async function graffitiNameLayer(name, seed, variant) {
  const style = graffitiStyles[variant - 1], glyph = await graffitiGlyph(name, variant);
  const random = seededRandom(`aerosol-v2:${seed}:${variant}`), pick = (list) => list[Math.floor(random() * list.length)];
  const x = (1080 - glyph.info.width) / 2, y = 37 + (132 - glyph.info.height) / 2;
  const source = `<image x="${x}" y="${y}" width="${glyph.info.width}" height="${glyph.info.height}" href="data:image/png;base64,${glyph.data.toString("base64")}"/>`;
  const skew = Math.tan(style.skew * Math.PI / 180), transform = `translate(${-skew * 125} 0) skewX(${style.skew})`;
  const expand = style.expand || 0, outline = style.outline;
  const halo = [], dust = [], wear = [], runs = [], flashes = [];
  // Irregular overspray behind the word, with no rectangular panel or banner.
  for (let i = 0; i < 24; i++) {
    const cx = x + random() * glyph.info.width, cy = y + 15 + random() * (glyph.info.height - 10);
    halo.push(`<ellipse cx="${cx}" cy="${cy}" rx="${12 + random() * 37}" ry="${12 + random() * 35}" fill="${i % 4 ? style.cloud : blue}" opacity="${.06 + random() * .22}"/>`);
  }
  for (let i = 0; i < 1600; i++) {
    const cx = x - 25 + random() * (glyph.info.width + 50), cy = 18 + random() * 204;
    dust.push(`<circle cx="${cx}" cy="${cy}" r="${.25 + random() * (i % 15 ? 1.4 : 4)}" fill="${pick([style.cloud, blue, yellow, navy])}" opacity="${.07 + random() * .48}"/>`);
  }
  // Small pinholes and partial scuffs show wall through paint without removing whole strokes.
  for (let i = 0; i < 1900 * (style.worn || 1); i++) {
    wear.push(`<circle cx="${x + random() * glyph.info.width}" cy="${y + random() * glyph.info.height}" r="${.3 + random() * 1.5}" fill="black" opacity="${.2 + random() * .65}"/>`);
  }
  const alpha = await sharp(glyph.data).extractChannel(3).raw().toBuffer();
  for (let i = 0; i < style.runs; i++) {
    const column = Math.floor(random() * glyph.info.width);
    let row = glyph.info.height - 1;
    while (row >= 0 && alpha[row * glyph.info.width + column] < 200) row--;
    if (row < glyph.info.height * .25) continue;
    const py = y + row - 2, px = x + column + skew * (py - 125);
    const bottom = Math.min(235, py + 12 + random() * 62), width = 1 + random() * (i % 6 ? 2.3 : 4.5);
    const ink = i % 4 ? (style.lower || style.fill) : style.rim;
    runs.push(`<path d="M${px} ${py}C${px + .7} ${py + 12} ${px - .6} ${bottom - 4} ${px} ${bottom}" stroke="${ink}" stroke-width="${width}" fill="none" stroke-linecap="round" opacity="${.55 + random() * .4}"/><ellipse cx="${px}" cy="${bottom}" rx="${width * .62}" ry="${width * 1.1}" fill="${ink}" opacity=".85"/>`);
  }
  if (style.arrows) {
    flashes.push(`<path d="M${x - 22} 90l-20 -15 8 25M${x + glyph.info.width + 20} 130l25 -18 -9 28" stroke="${yellow}" stroke-width="5" fill="none" opacity=".85"/>`);
  }
  const under = style.underline ? `<path d="M${x + 10} 213Q540 173 ${1080 - x} 190Q590 203 ${x + 45} 225" stroke="${style.fill}" stroke-width="5" stroke-linecap="round" fill="none" opacity=".82"/>` : "";
  const shadow = Array.from({ length: Math.ceil(style.shadow / 3) }, (_, i) => `<g transform="translate(${(i + 1) * 2} ${(i + 1) * 3})"><use href="#shape" filter="url(#outline)"/></g>`).reverse().join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="250"><defs>
    <clipPath id="safe"><rect x="35" y="5" width="1010" height="238"/></clipPath>
    <g id="shape" transform="${transform}">${expand ? `<g filter="url(#grow)">${source}</g>` : source}</g>
    <filter id="grow" x="-15%" y="-40%" width="130%" height="180%"><feMorphology operator="dilate" radius="${expand}"/></filter>
    <mask id="letters"><use href="#shape"/></mask>
    <mask id="wear"><rect width="1080" height="250" fill="white"/>${wear.join("")}</mask>
    <filter id="rim" x="-20%" y="-70%" width="140%" height="240%"><feMorphology in="SourceAlpha" operator="dilate" radius="${outline + 4}"/><feColorMatrix type="matrix" values="0 0 0 0 ${parseInt(style.rim.slice(1,3),16)/255} 0 0 0 0 ${parseInt(style.rim.slice(3,5),16)/255} 0 0 0 0 ${parseInt(style.rim.slice(5,7),16)/255} 0 0 0 1 0"/></filter>
    <filter id="outline" x="-20%" y="-70%" width="140%" height="240%"><feMorphology in="SourceAlpha" operator="dilate" radius="${outline}" result="ink"/><feFlood flood-color="${style.contour || navy}"/><feComposite in2="ink" operator="in"/></filter>
    <filter id="haze" x="-25%" y="-60%" width="150%" height="220%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="shine" x="-10%" y="-30%" width="120%" height="160%"><feOffset in="SourceAlpha" dx="3" dy="4" result="shift"/><feComposite in="SourceAlpha" in2="shift" operator="out" result="edge"/><feFlood flood-color="${white}"/><feComposite in2="edge" operator="in"/></filter></defs>
    <g clip-path="url(#safe)"><g filter="url(#haze)">${halo.join("")}</g>${dust.join("")}${flashes.join("")}
    <g mask="url(#wear)" opacity=".95">${shadow}<use href="#shape" filter="url(#rim)"/><use href="#shape" filter="url(#outline)"/>
    <g mask="url(#letters)"><rect width="1080" height="250" fill="${style.fill}"/>${style.lower ? `<path d="M0 113L1080 143V250H0Z" fill="${style.lower}"/>` : ""}${style.stencil ? `<path d="M0 91L1080 97M0 145L1080 139" stroke="${navy}" opacity=".2" stroke-width="2"/>` : ""}</g>
    ${style.shine ? '<use href="#shape" filter="url(#shine)" opacity=".85"/>' : ""}</g>${runs.join("")}${under}</g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function compositeGraffitiName(bytes, name, seed, variant) {
  return compositeNameLayer(bytes, await graffitiNameLayer(name, seed, variant));
}
