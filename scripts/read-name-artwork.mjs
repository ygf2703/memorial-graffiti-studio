import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readArtworkName, compareArtworkReading, ARTWORK_READER_MODEL, ARTWORK_READER_VERSION } from "../server/read-name-artwork.mjs";

if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is required locally; never put it in a tracked file.");
const max = Number(process.argv[2] || 10);
if (!Number.isInteger(max) || max < 1 || max > 344) throw new Error("Limit must be 1–344");
const report = JSON.parse(await readFile(resolve(".netlify/name-library-review/report.json"), "utf8"));
const root = resolve(".netlify/name-library-readings"); await mkdir(root, { recursive: true });
const queue = [];
for (const item of report.checks) {
  const file = resolve(root, `${ARTWORK_READER_VERSION}-${item.sha256}.json`);
  const cached = await readFile(file, "utf8").then(JSON.parse).catch(() => null);
  if (cached?.sha256 === item.sha256 && cached.version === ARTWORK_READER_VERSION) continue;
  queue.push({ ...item, cacheFile: file });
}
let index = 0;
const selected = queue.slice(0, max);
await Promise.all(Array.from({ length: 3 }, async () => {
  while (index < selected.length) {
    const item = selected[index++];
    const bytes = await readFile(resolve(".netlify/name-library-drafts", item.file));
    if (createHash("sha256").update(bytes).digest("hex") !== item.sha256) throw new Error("Artifact changed after report; render it again first.");
    const reading = await readArtworkName(bytes);
    const status = compareArtworkReading(reading, item.name);
    await writeFile(item.cacheFile, JSON.stringify({ name: item.name, sha256: item.sha256, model: ARTWORK_READER_MODEL, version: ARTWORK_READER_VERSION, status, reading, checkedAt: new Date().toISOString() }, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ name: item.name, status, reading: reading.text || null, ...(reading.httpStatus ? { httpStatus: reading.httpStatus } : {}) }));
  }
}));
console.log(JSON.stringify({ processed: selected.length, stillUncachedFromReport: queue.length - selected.length, note: "OCR is not proof of spelling; visual review remains mandatory." }));
