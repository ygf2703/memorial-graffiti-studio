import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import sharp from "sharp";
import {reflowPlan,reflowCatalogue,placeCatalogueWithRecovery,reviewWithLayoutProof} from "../server/layout-recovery.mjs";
import {captionAsset,compositeCaption} from "../server/composite.mjs";
import {queueRecompose} from "../server/recompose.mjs";
import {queueCorrection} from "../server/correction.mjs";
import {EXACT_NAME_LAYOUT} from "../public/design.js";

const failure=()=>{throw new Error("לא נמצא מיקום בטוח לשם ללא הסתרת הראש");};
const base=await sharp({create:{width:1080,height:1080,channels:3,background:"#168dcc"}}).png().toBuffer();
const catalog=JSON.parse(await readFile(new URL("../data/name-artwork/release.json",import.meta.url),"utf8"));
const artwork=await readFile(new URL(`../public/name-artwork/${catalog.entries[0].file}`,import.meta.url));
const input={bytes:base,artwork,placementVersion:2,captionVariant:9,recoveryVersion:1,context:{catalogueOnly:true}};

test("all 347 catalogue names fit above the entire mural for every caption",async()=>{
 const heights=await Promise.all(Array.from({length:10},async(_,i)=>(await captionAsset(i+1)).info.height));
 assert.equal(catalog.entries.length,347);
 for(const entry of catalog.entries){
  const {info}=await sharp(await readFile(new URL(`../public/name-artwork/${entry.file}`,import.meta.url))).trim({background:"#00000000",threshold:0}).png().toBuffer({resolveWithObject:true});
  for(const h of heights){
   const p=reflowPlan(info.width,info.height,h);
   assert.ok(p.name.top+p.name.height+24<=p.portrait.top,entry.name);
   assert.ok(p.portrait.top+p.portrait.height+16<=p.captionTop,entry.name);
   assert.ok(p.name.left>=24&&p.name.left+p.name.width<=1056,entry.name);
   assert.ok(p.name.height>0&&p.portrait.height>=400,entry.name);
   assert.ok(Math.abs(p.name.width/info.width-p.name.height/info.height)<.01,entry.name);
  }
 }
});

test("uncertain detection and fully occupied heads recover without another generation",async()=>{
 const occupied={uncertain:false,head:{x:0,y:0,width:1000,height:1000},star:{x:800,y:800,width:100,height:100}};
 for(const detect of [failure,async()=>({uncertain:true}),async()=>occupied]){
  const result=await placeCatalogueWithRecovery(input,{detect});
  assert.equal(result.recovered,true);
  assert.equal(result.placement.source,"prebuilt-reflow");
  assert.ok(result.placement.top+result.placement.height<result.placement.portrait.top);
  const final=await compositeCaption(result.bytes,9),meta=await sharp(final).metadata();
  assert.equal(meta.width,1080);assert.equal(meta.height,1080);
 }
});

test("entire source including its four corners survives uncropped in its separate region",async()=>{
 const source=await sharp({create:{width:600,height:900,channels:3,background:"#ffff00"}}).png().toBuffer();
 const result=await reflowCatalogue(source,artwork,9),p=result.placement.portrait;
 const expected=await sharp(source).resize({width:p.width,height:p.height,fit:"contain",background:"#ffffff"}).removeAlpha().raw().toBuffer();
 const actual=await sharp(result.bytes).extract(p).removeAlpha().raw().toBuffer();
 assert.deepEqual(actual,expected);
});

test("successful placements stay unchanged; historical and unrelated failures are not hidden",async()=>{
 const detection={uncertain:false},result={bytes:base,placement:{top:24}};
 const normal=await placeCatalogueWithRecovery(input,{detect:async()=>detection,compose:async()=>result});
 assert.equal(normal.bytes,base);assert.equal(normal.recovered,false);assert.equal(normal.detection,detection);
 await assert.rejects(placeCatalogueWithRecovery({...input,recoveryVersion:undefined},{detect:failure}),/לא נמצא/);
 await assert.rejects(placeCatalogueWithRecovery({...input,context:{catalogueOnly:false}},{detect:failure}),/לא נמצא/);
 await assert.rejects(placeCatalogueWithRecovery(input,{detect:async()=>{throw new Error("Asset unavailable");}}),/Asset unavailable/);
 await assert.rejects(placeCatalogueWithRecovery({...input,recoveryVersion:2}),/Unsupported/);
 await assert.rejects(placeCatalogueWithRecovery({...input,artwork:Buffer.from("broken")},{detect:failure}));
 for(const dims of [[0,2,3],[2,0,3],[2,3,291],[NaN,3,20]])assert.throws(()=>reflowPlan(...dims));
});

test("explicit repair upgrades historical layout failures; correction inherits recovery policy",async()=>{
 const parent={status:"failed",name:"test",nameArtwork:{name:"test"},layoutVersion:EXACT_NAME_LAYOUT,error:"לא נמצא מיקום בטוח"};
 const values=new Map([["parent",parent],["parent/base",base.buffer],["parent/recompose-v1",{id:"old-failed"}],["old-failed",{status:"failed",recomposeOnly:true}]]);
 const store={get:async k=>values.get(k),setJSON:async(k,v)=>{if(!values.has(k))values.set(k,v);}};
 const repaired=await queueRecompose(store,"parent");
 assert.equal(values.get(repaired.id).layoutRecoveryVersion,1);
 assert.notEqual(repaired.id,"old-failed");
 assert.equal(values.get("old-failed").status,"failed");
 assert.equal((await queueRecompose(store,"parent")).id,repaired.id);
 assert.equal(values.get(repaired.id).recomposeOnly,true);
 for(const version of [undefined,1]){
  values.set("completed",{...parent,status:"completed",layoutRecoveryVersion:version});
  values.delete("completed/correction");
  const child=await queueCorrection(store,"completed",{name:"test",type:"image/jpeg",bytes:Buffer.from("photo")},"portrait");
  assert.equal(values.get(child.id).layoutRecoveryVersion,version);
 }
});

test("native placement proof preserves the blind reading and never asserts correct spelling",async()=>{
 const reading={status:"needs_review",name:"wrong",nameMatches:false,namePlacement:"overlap"};
 const composed=await reflowCatalogue(base,artwork,9);
 const review=reviewWithLayoutProof(reading,composed);
 assert.equal(review.namePlacement,"clear_above");
 assert.equal(review.visionNamePlacement,"overlap");
 assert.equal(review.status,"needs_review");assert.equal(review.nameMatches,false);
 assert.equal(reading.namePlacement,"overlap");
 assert.equal(reviewWithLayoutProof(reading,{recovered:false}),reading);
});
