import test from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {releaseCatalog,selectArtwork,loadArtwork,compositeArtwork} from "../server/name-artwork.mjs";

test("Ehud selects the new exact inscription, not the previous Ohad alias",async()=>{
 const c=await releaseCatalog();
 const update=JSON.parse(await readFile("data/name-artwork/updates/2026-11-14-ehud.json","utf8"));
 const active=selectArtwork(c,"אהוד נחום");
 assert.equal(active.name,"אהוד נחום");assert.equal(active.sha256,update.updated.sha256);
 assert.equal(Object.hasOwn(c.aliases,"אהוד נחום"),false);assert.equal(c.entries.length,347);
 const publicList=JSON.parse(await readFile("public/name-artwork/catalog.json","utf8"));
 assert.ok(publicList.names.includes("אהוד נחום"));assert.ok(!publicList.names.includes("אוהד נחום"));
 const old=await loadArtwork({entries:[update.original]},update.original.name);
 assert.equal(createHash("sha256").update(old.bytes).digest("hex"),update.original.sha256);
 const {bytes}=await loadArtwork(c,"אהוד נחום"),meta=await sharp(bytes).metadata();
 const alpha=await sharp(bytes).extractChannel(3).raw().toBuffer();
 assert.ok(meta.hasAlpha);assert.ok(alpha.some(v=>v===0));assert.ok(alpha.some(v=>v>250));
 await mkdir(".netlify",{recursive:true});
 for(const [label,background] of [["light","#ffffff"],["dark","#123f69"]]){
  const base=await sharp({create:{width:1080,height:1080,channels:3,background}}).png().toBuffer();
  const rendered=await compositeArtwork(base,bytes);const m=await sharp(rendered).metadata();
  assert.equal(m.width,1080);assert.equal(m.height,1080);
  await writeFile(`.netlify/ehud-review-${label}.png`,rendered);
 }
});
