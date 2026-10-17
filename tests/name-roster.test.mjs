import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveArtworkName } from "../public/batch.js";
import { selectArtwork, validateReleaseCatalog } from "../server/name-artwork.mjs";
import { validateNameRoster, validateRosterCoverage } from "../server/name-roster.mjs";
import { reconcileRoster } from "../scripts/publish-name-artwork.mjs";

const entry = (name, hash = "a".repeat(64)) => ({ name, sha256: hash, file: hash.slice(0,20)+".png", status:"verified", spellingChecked:true, visualChecked:true, renderChecked:true, ocr:{sha256:hash,status:"matched",text:name,uncertain:false} });
const roster = {version:1,sourceCount:2,retiredNames:["שם ישן"],records:[{name:"שם מהקובץ",artworkName:"שם קיים"},{name:"שם חדש",artworkName:"שם חדש"}]};

test("workbook roster covers exactly 347 distinct sources and distinct designs", async () => {
  const actual = JSON.parse(await readFile(new URL("../data/name-artwork/roster-2026-10-17.json",import.meta.url),"utf8"));
  const result = validateNameRoster(actual);
  assert.equal(actual.records.length,347); assert.equal(result.names.length,347); assert.equal(Object.keys(result.aliases).length,18);
  assert.deepEqual(actual.retiredNames,["אורי משה בורנשטיין","סיון שדה","אלון פרנקס","מעוז מורל"]);
  assert.ok(result.names.includes("אלון פרקס")); assert.ok(!result.names.includes("אלון פרנקס"));
  for(const name of ["אריאל בן-שאנן","לידור מועלם","נתנאל בוכריס","גיא לאו","יוסף חיים אשרף","עמית אריה רגב","עינבר אברהם קב"]) assert.ok(result.names.includes(name));
});

test("explicit aliases preserve approved artwork spelling and cannot fuzzy-match", () => {
  const catalog={version:1,entries:[entry("שם קיים")],aliases:{"שם מהקובץ":"שם קיים"}};
  assert.equal(validateReleaseCatalog(catalog,["שם קיים"]),true);
  assert.equal(selectArtwork(catalog,"שם מהקובץ"),catalog.entries[0]);
  assert.equal(selectArtwork(catalog,"שם קיים"),catalog.entries[0]);
  assert.equal(resolveArtworkName("שם מהקובץ",catalog.aliases),"שם קיים");
  assert.throws(()=>selectArtwork(catalog,"שם דומה"));
  for(const aliases of [{"שם מהקובץ":"לא קיים"},{"שם מהקובץ":"שם אחר","שם אחר":"שם קיים"},{"שם קיים":"שם קיים"},[]]) assert.throws(()=>validateReleaseCatalog({...catalog,aliases},["שם קיים"]));
});

test("published roster resolves all 347 workbook records to 347 unique immutable designs", async () => {
  const actual = JSON.parse(await readFile(new URL("../data/name-artwork/roster-2026-10-17.json",import.meta.url),"utf8"));
  const catalog = JSON.parse(await readFile(new URL("../data/name-artwork/release.json",import.meta.url),"utf8"));
  const reviews = JSON.parse(await readFile(new URL("../data/name-artwork/reviews.json",import.meta.url),"utf8"));
  assert.equal(validateRosterCoverage(catalog,actual),true);
  const selected = actual.records.map(row=>selectArtwork(catalog,row.name));
  assert.equal(new Set(selected.map(row=>row.file)).size,347);
  for(const row of actual.records) assert.equal(selectArtwork(catalog,row.name).name,row.artworkName);
  for(const name of actual.retiredNames){
    assert.throws(()=>selectArtwork(catalog,name));
    const review=reviews.find(row=>row.name===name);
    // Retirement must not delete the immutable asset used by durable historical jobs.
    const bytes=await readFile(new URL("../public/name-artwork/"+review.sha256.slice(0,20)+".png",import.meta.url));
    assert.ok(bytes.length>0);
  }
});

test("roster rejects duplicate sources, shared designs, alias collisions and retired active names", () => {
  for(const patch of [
    {sourceCount:3},
    {records:[roster.records[0],roster.records[0]]},
    {records:[roster.records[0],{name:"שם נוסף",artworkName:"שם קיים"}]},
    {records:[roster.records[0],{name:"שם קיים",artworkName:"שם אחר"}]},
    {retiredNames:["שם חדש"]}
  ]) assert.throws(()=>validateNameRoster({...roster,...patch}));
});

test("explicit reconciliation retires only authorized names and pins historical artwork", () => {
  const previous={version:1,entries:[entry("שם קיים"),entry("שם ישן")]};
  const candidate={version:1,mode:"partial",sourceCount:2,entries:[entry("שם קיים"),entry("שם חדש")]};
  const result=reconcileRoster(previous,candidate,["שם קיים","שם ישן"],roster);
  assert.equal(result.entries[0],previous.entries[0]);
  assert.equal(validateRosterCoverage(result,roster),true);
  assert.throws(()=>selectArtwork(result,"שם ישן"));
  // Durable jobs may still validate their pinned old asset, independently of availability.
  assert.equal(selectArtwork({entries:[previous.entries[1]]},"שם ישן"),previous.entries[1]);
  assert.throws(()=>reconcileRoster(previous,candidate,["שם קיים","שם ישן"],{...roster,retiredNames:[]}));
  assert.throws(()=>reconcileRoster(previous,{...candidate,entries:[entry("שם קיים","b".repeat(64)),entry("שם חדש")]},["שם קיים","שם ישן"],roster));
  assert.throws(()=>reconcileRoster(previous,{...candidate,entries:[entry("שם קיים")]},["שם קיים","שם ישן"],roster));
  assert.throws(()=>validateRosterCoverage({...result,aliases:{}},roster));
});
