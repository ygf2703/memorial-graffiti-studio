import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {releaseCatalog,selectArtwork,loadArtwork} from "../server/name-artwork.mjs";
test("Eyal's requested unhyphenated name is active and historical pixels remain pinned",async()=>{
 const catalog=await releaseCatalog();
 assert.equal(catalog.entries.length,347);
 const entry=selectArtwork(catalog,"אייל מבורך טויטו");
 assert.equal(selectArtwork(catalog,"אייל מבורך-טויטו"),entry);
 assert.equal(entry.ocr.text,"אייל מבורך טויטו");
 await loadArtwork(catalog,entry.name);
 const old=JSON.parse(await readFile("data/name-artwork/updates/2026-10-23-eyal.json","utf8")).previous;
 assert.equal(selectArtwork({entries:[old]},old.name),old);
 const bytes=await readFile("public/name-artwork/"+old.file);
 assert.equal(createHash("sha256").update(bytes).digest("hex"),old.sha256);
});
