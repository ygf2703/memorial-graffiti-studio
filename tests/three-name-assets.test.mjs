import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {releaseCatalog,selectArtwork,loadArtwork} from "../server/name-artwork.mjs";
import {composePlacedArtwork,intersects} from "../server/name-placement.mjs";
const update=JSON.parse(await readFile(new URL("../data/name-artwork/updates/2026-11-14-three-names.json",import.meta.url),"utf8"));

test("three reviewed replacements are active and every historical asset remains intact",async()=>{
 const c=await releaseCatalog();
 for(const row of update.entries){
  const active=selectArtwork(c,row.updated.name);assert.equal(active.sha256,row.updated.sha256);
  const old=await loadArtwork({entries:[row.original]},row.original.name);
  assert.equal(createHash("sha256").update(old.bytes).digest("hex"),row.original.sha256);
  assert.notEqual(active.sha256,row.original.sha256);
 }
 assert.equal(selectArtwork(c,"אמנון נסים").name,"אמנון ניסים");
 assert.equal(selectArtwork(c,"אמנון ניסים").name,"אמנון ניסים");
 assert.equal(c.entries.length,347);
});

test("compact two-line artwork fits a representative side space at readable scale",async()=>{
 const c=await releaseCatalog();await mkdir(".netlify/three-name-placement",{recursive:true});
 const detection={uncertain:false,head:{x:620,y:70,width:320,height:550},star:{x:760,y:640,width:120,height:100}};
 for(const name of ["אשרת פינטו","אדיר פורטוגל"]){
  const {bytes}=await loadArtwork(c,name);
  const trim=await sharp(bytes).trim({background:"#00000000",threshold:0}).toBuffer({resolveWithObject:true});
  assert.ok(trim.info.width/trim.info.height<1.7);
  for(const [label,background] of [["light","#ffffff"],["dark","#123f69"]]){
   const base=await sharp({create:{width:1080,height:1080,channels:3,background}}).png().toBuffer();
   const result=await composePlacedArtwork(base,bytes,detection,2,null,{name,catalogueOnly:true});
   const p=result.placement,b={...p,right:p.left+p.width,bottom:p.top+p.height};
   assert.ok(p.width>=500);assert.ok(p.height>=200);
   assert.equal(intersects(b,p.head),false);assert.equal(intersects(b,p.star),false);
   assert.notEqual(p.source,"literal-two-line");
   await writeFile(`.netlify/three-name-placement/${name}-${label}.png`,result.bytes);
  }
 }
});
