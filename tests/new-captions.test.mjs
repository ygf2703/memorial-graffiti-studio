import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {captionVariant,CAPTION_STYLE_COUNT} from "../public/design.js";
import {compositeCaption} from "../server/composite.mjs";
test("ten captions are independently reachable while historical seeds keep the original five",()=>{
 const choices=new Set();
 for(let i=0;i<1000;i++){const seed="poster-"+i;const n=captionVariant(seed,CAPTION_STYLE_COUNT);choices.add(n);assert.equal(n,captionVariant(seed,10));assert.ok(captionVariant(seed)<=5);}
 assert.equal(choices.size,10);assert.throws(()=>captionVariant("seed",11));
});
test("new requests use 90 percent new styles, stable per image and balanced within each group",()=>{
 const counts=Array(11).fill(0);
 for(let i=0;i<10000;i++){
  const seed="mix-"+i,value=captionVariant(seed,10,"new90");
  assert.equal(value,captionVariant(seed,10,"new90"));counts[value]++;
 }
 const fresh=counts.slice(6).reduce((a,b)=>a+b,0);
 assert.ok(fresh>8800&&fresh<9200);
 for(let i=1;i<=10;i++)assert.ok(counts[i]>100);
 assert.throws(()=>captionVariant("seed",5,"new90"));
});
test("five new brush/fractured captions have unique alpha PNGs and all render at 1080",async()=>{
 const hashes=new Set(),wall=await sharp({create:{width:1080,height:1080,channels:3,background:"#d9cbb3"}}).png().toBuffer();
 for(let i=6;i<=10;i++){
  const bytes=await readFile("public/captions/caption-"+i+".png"),meta=await sharp(bytes).metadata();
  assert.equal(meta.hasAlpha,true);hashes.add(createHash("sha256").update(bytes).digest("hex"));
  const result=await compositeCaption(wall,i),out=await sharp(result).metadata();assert.equal(out.width,1080);assert.equal(out.height,1080);
 }
 assert.equal(hashes.size,5);await assert.rejects(compositeCaption(wall,11));
});
