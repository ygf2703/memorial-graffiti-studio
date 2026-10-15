// Explicit, bounded paid experiment. Never runs in CI or production.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { parseEnv } from "node:util";
import { generateImage } from "../server/core.mjs";
import { reviewImage } from "../server/review.mjs";
import { nameGuide, verifyName } from "../server/name-verification.mjs";
const mode = process.argv[2];
if (!["read-existing", "generate", "newer"].includes(mode)) throw new Error("Use read-existing, generate or newer <portrait-path>");
Object.assign(process.env, parseEnv(await readFile(".env", "utf8")));
const directory = ".netlify/name-evaluation";
await mkdir(directory, { recursive: true });
const name = "יהונתן אליהו";
if (mode === "read-existing") {
  for (const [file, expected] of [[".netlify/smoke/יהונתן אליהו.jpg", name], [".netlify/smoke/or-avni-fixed.png", "אור אבני"]]) {
    const bytes = await readFile(file);
    const result = { file, expected, legacy: await reviewImage(bytes.toString("base64"), expected, fetch, false), dual: await verifyName(bytes, expected) };
    await writeFile(`${directory}/${expected}-readings.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  }
} else {
  const portrait = { type: "image/jpeg", bytes: await readFile(process.argv[3]) };
  const guide = await nameGuide(name); await writeFile(`${directory}/name-guide.png`, guide);
  for (const variant of mode === "newer" ? ["gpt-image-2"] : ["baseline", "guided"]) {
    const path = `${directory}/${variant}.jpg`;
    if (await access(path).then(() => true).catch(() => false)) { console.log(`${variant}: retained existing result; no regeneration`); continue; }
    const fetcher = variant === "baseline" ? fetch : async (url, options) => {
      if (variant === "gpt-image-2") {
        options.body.set("model", "gpt-image-2"); options.body.delete("input_fidelity");
        return fetch(url, options);
      }
      options.body.append("image[]", new Blob([guide], { type: "image/png" }), "exact-name-guide.png");
      options.body.set("prompt", options.body.get("prompt") + "\nImage 5 is an EXACT SPELLING GUIDE, not a style reference. Copy its letter shapes and order precisely into the top graffiti name. Keep each letter distinguishable with small clear gaps. Apply spray colour, outline and texture without joining, deleting, duplicating or changing letters. Do not paint a rectangular white label; make the lettering part of the wall.");
      return fetch(url, options);
    };
    console.log(`Starting ${variant}: one paid image call`);
    const started = Date.now();
    const bytes = Buffer.from(await generateImage(portrait, name, fetcher, "name-eval-same-design", true), "base64");
    await writeFile(path, bytes);
    const result = { variant, expected: name, seconds: Math.round((Date.now() - started) / 1000), dual: await verifyName(bytes, name) };
    await writeFile(`${directory}/${variant}.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  }
}
