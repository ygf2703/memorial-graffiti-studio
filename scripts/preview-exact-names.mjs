// Local typography preview. Optional --live <portrait.jpg>: exactly one paid generation,
// cached on disk; subsequent runs only recompose. No OCR/API retries.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { parseEnv } from "node:util";
import sharp from "sharp";
import { NAME_STYLE_COUNT } from "../public/design.js";
import { compositeCaption } from "../server/composite.mjs";
import { generateImage } from "../server/core.mjs";
import { compositeGraffitiName } from "../server/graffiti-name.mjs";
const dir = ".netlify/name-evaluation";
await mkdir(dir, { recursive: true });
const layers = [];
const wall = await sharp(Buffer.from(`<svg width="1080" height="250" xmlns="http://www.w3.org/2000/svg"><defs><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".15" numOctaves="3" seed="11"/><feColorMatrix type="saturate" values="0"/></filter></defs><rect width="1080" height="250" fill="#d8cfbb"/><rect width="1080" height="250" filter="url(#grain)" opacity=".24"/><path d="M70 0l9 30 -13 20 18 31 -6 29 18 25M1024 250l-7 -30 11 -19 -19 -25 10 -28 -15 -19" fill="none" stroke="#8c8476" stroke-width="1.3" opacity=".6"/></svg>`)).png().toBuffer();
for (let variant = 1; variant <= NAME_STYLE_COUNT; variant++) {
  console.log(`Rendering graffiti style ${variant}/${NAME_STYLE_COUNT}`);
  const left = (variant - 1) % 2 * 1080, top = Math.floor((variant - 1) / 2) * 280;
  layers.push({ input: await compositeGraffitiName(wall, "יהונתן אליהו", `preview-${variant}`, variant).then((bytes) => sharp(bytes).extract({ left: 0, top: 0, width: 1080, height: 250 }).png().toBuffer()), left, top: top + 25 });
  layers.push({ input: Buffer.from(`<svg width="100" height="40"><text x="20" y="30" font-size="25" fill="#082e49">${String(variant).padStart(2, "0")}</text></svg>`), left, top });
}
await sharp({ create: { width: 2160, height: 1400, channels: 3, background: "#d8cfbb" } }).composite(layers).png().toFile(`${dir}/ten-name-styles.png`);
if (process.argv[2] === "--live") {
  const path = `${dir}/literal-base.jpg`;
  if (!await access(path).then(() => true).catch(() => false)) {
    Object.assign(process.env, parseEnv(await readFile(".env", "utf8")));
    const portrait = { type: "image/jpeg", bytes: await readFile(process.argv[3]) };
    console.log("One paid background generation; no model-written name");
    await writeFile(path, Buffer.from(await generateImage(portrait, "יהונתן אליהו", fetch, "literal-preview", false, null, true), "base64"));
  }
  const base = await readFile(path);
  const final = await compositeCaption(await compositeGraffitiName(base, "יהונתן אליהו", "literal-preview", 1), 3);
  await writeFile(`${dir}/literal-final.png`, final);
}
console.log("Preview files saved under .netlify/name-evaluation");
