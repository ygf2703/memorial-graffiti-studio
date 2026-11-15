import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {releaseCatalog,selectArtwork,loadArtwork,compositeArtwork} from "../server/name-artwork.mjs";
import {resolveArtworkName} from "../public/batch.js";
const read=async file=>JSON.parse(await readFile(file,"utf8"));
const hash=value=>createHash("sha256").update(value).digest("hex");

test("Mordechai is available with corrected letters and Yehonatan has the approved clearer asset",async()=>{
 const catalog=await releaseCatalog(),update=await read("data/name-artwork/updates/2026-11-15-two-names.json");
 const publicList=await read("public/name-artwork/catalog.json"),roster=await read("data/name-artwork/roster-2026-10-17.json");
 assert.equal(catalog.entries.length,347);assert.equal(publicList.names.length,347);
 assert.ok(publicList.names.includes("מרדכי חיים אמויאל"));assert.ok(!publicList.names.includes("מדרכי חיים אמויאל"));
 assert.equal(resolveArtworkName("מדרכי חיים אמויאל",publicList.aliases,publicList.names),"מרדכי חיים אמויאל");
 assert.equal(selectArtwork(catalog,"מדרכי חיים אמויאל").name,"מרדכי חיים אמויאל");
 assert.equal(selectArtwork(catalog,"יהונתן יעקב דויטש").name,"יהונתן דויטש");
 for(const typo of ["מרדגי חיים אמויאל","יהונתן דוויטש"])assert.throws(()=>selectArtwork(catalog,typo));
 const changed=new Set(update.replacements.map(item=>item.updated.name));
 // Reconstruct this historical snapshot across the later explicit Amit update.
 const amit=await read("data/name-artwork/updates/2026-11-15-amit.json");
 const snapshot=catalog.entries.map(entry=>{
  if(entry.name!==amit.updated.name)return entry;
  assert.equal(entry.sha256,amit.updated.sha256);
  return amit.original;
 });
 const unchanged=snapshot.filter(entry=>!changed.has(entry.name));
 assert.equal(unchanged.length,345);assert.equal(hash(JSON.stringify(unchanged.map(({name,file,sha256})=>({name,file,sha256})))),update.unchangedFingerprint);
 assert.equal(hash(JSON.stringify(roster.records.map(({row,name})=>({row,name})))),update.rosterSourceFingerprint);
 assert.equal(roster.records.find(row=>row.name==="מדרכי חיים אמויאל").artworkName,"מרדכי חיים אמויאל");
 for(const replacement of update.replacements){
  const current=selectArtwork(catalog,replacement.updated.name);
  assert.equal(current.sha256,replacement.updated.sha256);
  assert.notEqual(current.sha256,replacement.original.sha256);
  assert.equal(current.ocr.text,current.name);assert.equal(current.ocr.sha256,current.sha256);
  const historical=await loadArtwork({entries:[replacement.original]},replacement.original.name);
  assert.equal(hash(historical.bytes),replacement.original.sha256);
  const {bytes}=await loadArtwork(catalog,current.name);
  const meta=await sharp(bytes).metadata(),alpha=await sharp(bytes).extractChannel(3).raw().toBuffer();
  assert.ok(meta.hasAlpha&&alpha.some(value=>value===0)&&alpha.some(value=>value===255));
  for(const background of ["#ffffff","#123f69"]){
   const base=await sharp({create:{width:1080,height:1080,channels:3,background}}).png().toBuffer();
   const rendered=await compositeArtwork(base,bytes),info=await sharp(rendered).metadata();
   assert.equal(info.width,1080);assert.equal(info.height,1080);
  }
 }
});
