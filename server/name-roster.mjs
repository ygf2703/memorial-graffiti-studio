import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validName } from "../public/batch.js";

// Explicit user-approved mappings, never fuzzy matching or spelling correction.
export function validateNameRoster(roster) {
  if (roster?.version !== 1 || !Array.isArray(roster.records) || !roster.records.length || roster.sourceCount !== roster.records.length || !Array.isArray(roster.retiredNames)) throw new Error("Invalid name roster");
  const source = new Set(), artwork = new Set();
  for (const row of roster.records) {
    if (!validName(row.name) || !validName(row.artworkName) || source.has(row.name) || artwork.has(row.artworkName)) throw new Error("Duplicate or invalid roster name");
    source.add(row.name); artwork.add(row.artworkName);
  }
  if (new Set(roster.retiredNames).size !== roster.retiredNames.length || roster.retiredNames.some((name) => !validName(name) || source.has(name) || artwork.has(name))) throw new Error("Invalid retired names");
  const aliases = Object.fromEntries(roster.records.filter((row) => row.name !== row.artworkName).map((row) => [row.name, row.artworkName]));
  if (Object.keys(aliases).some((name) => artwork.has(name))) throw new Error("Ambiguous roster alias");
  return { names: roster.records.map((row) => row.artworkName), aliases };
}

export async function loadNameRoster() {
  let roster;
  try { roster = JSON.parse(await readFile(resolve("data/name-artwork/roster-2026-10-17.json"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  validateNameRoster(roster);
  return roster;
}

export function validateRosterCoverage(catalog, roster) {
  const { names, aliases } = validateNameRoster(roster);
  if (catalog.entries.length !== names.length || new Set(catalog.entries.map((row) => row.name)).size !== names.length || names.some((name) => !catalog.entries.some((row) => row.name === name))) throw new Error("Roster coverage is incomplete");
  if (JSON.stringify(Object.entries(catalog.aliases || {}).sort()) !== JSON.stringify(Object.entries(aliases).sort())) throw new Error("Roster aliases differ");
  return true;
}
