// Local typography preview. Optional --live <portrait.jpg>: exactly one paid generation,
// cached on disk; subsequent runs only recompose. No OCR/API retries.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { parseEnv } from "node:util";
import sharp from "sharp";
import { exactNameLayer, compositeExactName } from "../server/exact-name.mjs";
import { compositeCaption } from "../server/composite.mjs";
import { generateImage } from "../server/core.mjs";
const dir = ".netlify/name-evaluation";
await mkdir(dir, { recursive: true });
const layers = [];
for (let variant = 1; variant <= 5; variant++) layers.push({ input: await exactNameLayer("יהונתן אליהו", "preview", variant), left: 0, top: (variant - 1) * 250 });
await sharp({ create: { width: 1080, height: 1250, channels: 3, background: "#d8cfbb" } }).composite(layers).png().toFile(`${dir}/five-name-styles.png`);
if (process.argv[2] === "--live") {
  const path = `${dir}/literal-base.jpg`;
  if (!await access(path).then(() => true).catch(() => false)) {
    Object.assign(process.env, parseEnv(await readFile(".env", "utf8")));
    const portrait = { type: "image/jpeg", bytes: await readFile(process.argv[3]) };
    console.log("One paid background generation; no model-written name");
    await writeFile(path, Buffer.from(await generateImage(portrait, "יהונתן אליהו", fetch, "literal-preview", false, null, true), "base64"));
  }
  const base = await readFile(path);
  const final = await compositeCaption(await compositeExactName(base, "יהונתן אליהו", "literal-preview", 1), 3);
  await writeFile(`${dir}/literal-final.png`, final);
}
console.log("Preview files saved under .netlify/name-evaluation");
