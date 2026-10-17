import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { loadNameRoster, validateNameRoster } from "../server/name-roster.mjs";

export const artworkId = (name) => createHash("sha256").update(name, "utf8").digest("hex").slice(0, 20);
export async function sourceNames() {
  const roster = await loadNameRoster();
  if (roster) { const { names } = validateNameRoster(roster); return { rows: [...names], names }; }
  const rows = (await readFile(resolve("data/name-artwork/names-2026-10-16.txt"), "utf8")).trim().split(/\r?\n/u);
  return { rows, names: [...new Set(rows)] };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { rows, names } = await sourceNames();
  const drafts = await readdir(resolve(".netlify/name-library-drafts")).catch(() => []);
  console.log(JSON.stringify({ rows: rows.length, unique: names.length, names: names.map((name, i) => ({ name, id: artworkId(name), style: i % 10 + 1, generated: drafts.includes(`${artworkId(name)}.png`) })) }, null, 2));
}
