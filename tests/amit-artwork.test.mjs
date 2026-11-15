import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {beforeUpdates} from "./catalog-history.mjs";
import {releaseCatalog,selectArtwork,loadArtwork,compositeArtwork} from "../server/name-artwork.mjs";
const hash=value=>createHash("sha256").update(value).digest("hex");

test("Amit uses distinct reviewed bubble graffiti while the old file and all 346 other assets stay pinned",async()=>{
 const catalog=await releaseCatalog();
 const update=JSON.parse(await readFile("data/name-artwork/updates/2026-11-15-amit.json","utf8"));
 const current=selectArtwork(catalog,"עמית בן יגאל");
 assert.equal(current.name,update.original.name);assert.equal(current.sha256,update.updated.sha256);
 assert.notEqual(current.sha256,update.original.sha256);assert.equal(current.style,1);assert.equal(update.original.style,8);
 assert.equal(current.ocr.sha256,current.sha256);assert.equal(current.ocr.text,current.name);assert.equal(current.ocr.uncertain,false);
 assert.equal(catalog.entries.length,347);assert.equal(Object.keys(catalog.aliases).length,19);
 assert.equal(update.original.sha256,"fc923599d934d110d7c940ff59f02e79fbf85b781572ab5b3863ed4008f27c82");
 const old=await loadArtwork({entries:[update.original]},current.name);assert.equal(hash(old.bytes),update.original.sha256);
 const unchanged=(await beforeUpdates(catalog.entries,["2026-11-15-ron.json"])).filter(entry=>entry.name!==current.name);
 assert.equal(unchanged.length,346);
 assert.equal(hash(JSON.stringify(unchanged.map(({name,file,sha256})=>({name,file,sha256})))),update.unchangedFingerprint);
 const {bytes}=await loadArtwork(catalog,current.name),meta=await sharp(bytes).metadata();
 const alpha=await sharp(bytes).extractChannel(3).raw().toBuffer();assert.ok(meta.hasAlpha&&alpha.some(v=>v===0)&&alpha.some(v=>v===255));
 for(const i of [0,meta.width-1,(meta.height-1)*meta.width,meta.width*meta.height-1])assert.equal(alpha[i],0);
 for(const background of ["#ffffff","#123f69"]){
  const base=await sharp({create:{width:1080,height:1080,channels:3,background}}).png().toBuffer();
  const result=await compositeArtwork(base,bytes),info=await sharp(result).metadata();
  assert.equal(info.width,1080);assert.equal(info.height,1080);
 }
});
