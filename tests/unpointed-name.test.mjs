import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolveArtworkName} from "../public/batch.js";
import {selectArtwork} from "../server/name-artwork.mjs";

test("unpointed Yuval selects the existing verified pointed artwork in client and server",async()=>{
 const catalog=JSON.parse(await readFile(new URL("../data/name-artwork/release.json",import.meta.url),"utf8"));
 const names=catalog.entries.map(entry=>entry.name);
 assert.equal(resolveArtworkName("יובל מוריוסף",catalog.aliases,names),"יוֹבֵל מוריוסף");
 assert.deepEqual(selectArtwork(catalog,"יובל מוריוסף"),selectArtwork(catalog,"יוֹבֵל מוריוסף"));
 assert.throws(()=>selectArtwork(catalog,"יובל מור יוסף"));
 assert.throws(()=>selectArtwork(catalog,"יובל מוריוספ"));
});

test("vowel normalization preserves letters and punctuation and refuses ambiguous matches",()=>{
 assert.equal(resolveArtworkName("יובל",{},["יוּבל","יוֹבל"]),"יובל");
 assert.equal(resolveArtworkName("יוּבל",{},["יוּבל","יוֹבל"]),"יוּבל");
 assert.equal(resolveArtworkName("בן עזרא",{},["בן-עזרא"]),"בן עזרא");
 assert.equal(resolveArtworkName("שם מקור",{"שם מקור":"שם מאושר"},["שם מאושר"]),"שם מאושר");
});
