import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {nameWrapLines,twoLineGraffitiAsset}from"../server/name-wrap.mjs";
import {releaseCatalog,loadArtwork}from"../server/name-artwork.mjs";
import {composePlacedArtwork,intersects}from"../server/name-placement.mjs";
import {queueRecompose,imageBaseForJob}from"../server/recompose.mjs";
import {randomUUID}from"node:crypto";
import recompose from"../netlify/functions/recompose.mjs";
import {graffitiGlyph}from"../server/graffiti-name.mjs";

test("all 347 literal names wrap at a space without changing any character or hyphen",async()=>{
 const catalog=await releaseCatalog();
 for(const entry of catalog.entries){
  const lines=nameWrapLines(entry.name);assert.equal(lines.length,2);
  assert.equal(lines.join(" "),entry.name);
  assert.ok(lines.every(line=>line.length));
 }
 assert.deepEqual(nameWrapLines("אשרת פינטו"),["אשרת","פינטו"]);
 assert.deepEqual(nameWrapLines("יהודה שמחוני-אסף"),["יהודה","שמחוני-אסף"]);
});

test("all 347 names have measurable, non-truncated two-line glyphs across the ten local styles",async()=>{
 const catalog=await releaseCatalog();
 for(const entry of catalog.entries){
  for(let variant=1;variant<=10;variant++)for(const line of nameWrapLines(entry.name)){
   const glyph=await graffitiGlyph(line,variant);
   assert.ok(glyph.info.height>=48);assert.ok(glyph.info.width<=880);
  }
 }
});

test("Oshrat and additional names render two lines automatically without a hand-made companion",async()=>{
 const catalog=await releaseCatalog(),detection={uncertain:false,head:{x:438,y:134,width:382,height:535},star:{x:237,y:350,width:174,height:187}};
 const base=await sharp({create:{width:1080,height:1080,channels:3,background:"#d9cbb3"}}).png().toBuffer();
 for(const name of ["אשרת פינטו","יהונתן אליהו"]){
  const {bytes}=await loadArtwork(catalog,name);
  const result=await composePlacedArtwork(base,bytes,detection,2,null,{name,seed:"general-wrap-test",variant:2});
  assert.equal(result.placement.source,"literal-two-line");assert.equal(result.placement.lines,2);
  assert.equal(result.placement.textLines.join(" "),name);
  const p=result.placement;assert.equal(intersects({left:p.left,top:p.top,right:p.left+p.width,bottom:p.top+p.height},p.head),false);
  assert.ok(p.height>=130&&p.width>=240);
 }
});

test("saved base repair is concurrent-safe and never invokes image generation",async()=>{
 const id=randomUUID(),original={status:"failed",name:"אשרת פינטו",error:"לא נמצא מיקום בטוח לשם",nameArtwork:{name:"אשרת פינטו"},captionVariant:8,captionMix:"new90",designSeed:"original"};
 const data=new Map([[id,original],[id+"/base",new Uint8Array([1,2,3]).buffer]]);
 const store={get:async k=>data.get(k),setJSON:async(k,v)=>{if(!data.has(k))data.set(k,v);}};
 const results=await Promise.all([queueRecompose(store,id),queueRecompose(store,id)]);
 assert.equal(results[0].id,results[1].id);
 const child=data.get(results[0].id);assert.equal(child.recomposeOf,id);assert.equal(child.captionVariant,8);
 const bytes=await imageBaseForJob(child,data.get(id+"/base"),()=>{throw Error("MUST NOT GENERATE");});
 assert.deepEqual([...bytes],[1,2,3]);assert.equal(data.get(id),original);
 await assert.rejects(queueRecompose(store,results[0].id));
 let called=0;assert.deepEqual([...await imageBaseForJob({},null,async()=>{called++;return "AQID";})],[1,2,3]);assert.equal(called,1);
});

test("repair rejects other failures, missing saved images and unauthenticated endpoints",async()=>{
 for(const parent of [{status:"completed"},{status:"processing"},{status:"failed",error:"network",nameArtwork:{}},{status:"failed",error:"לא נמצא מיקום בטוח",nameArtwork:{}}]){
  await assert.rejects(queueRecompose({get:async()=>parent},randomUUID()));
 }
 assert.equal((await recompose(new Request("https://test/",{method:"GET"}))).status,405);
 const response=await recompose(new Request("https://test/",{method:"POST",body:JSON.stringify({id:randomUUID()})}));
 assert.ok([401,503].includes(response.status));
});

test("repair of a failed correction does not reset the one-correction limit",async()=>{
 const id=randomUUID(),parentId=randomUUID();
 const data=new Map([[id,{status:"failed",name:"אשרת פינטו",error:"לא נמצא מיקום בטוח",nameArtwork:{name:"אשרת פינטו"},parentId,correctionReason:"name"}],[id+"/base",new Uint8Array([1]).buffer]]);
 const store={get:async k=>data.get(k),setJSON:async(k,v)=>{if(!data.has(k))data.set(k,v);}};
 const result=await queueRecompose(store,id);
 assert.equal(data.get(result.id).parentId,parentId);
 assert.equal(data.get(result.id).recomposeOf,id);
});
