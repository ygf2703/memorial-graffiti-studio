import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {readFile} from "node:fs/promises";
import {catalogueComposition,referenceCompositionInstruction} from "../server/reference-style.mjs";
import {planNamePlacement,intersects} from "../server/name-placement.mjs";
import {queueCorrection} from "../server/correction.mjs";
import {queueRecompose} from "../server/recompose.mjs";

test("new titles reserve more wall for wide and stacked assets; historical dimensions stay unchanged",async()=>{
 for(const [width,height] of [[900,100],[900,250],[900,500],[900,800]]){
  const art=await sharp({create:{width,height,channels:4,background:"#168dcc"}}).png().toBuffer();
  const old=await catalogueComposition(art),large=await catalogueComposition(art,1);
  assert.ok(large.headerBottom>old.headerBottom);
  assert.ok(large.headerBottom>=300&&large.headerBottom<=440);
  assert.equal(old.headerBottom,Math.min(380,Math.max(200,Math.ceil(900*height/width)+36)));
  await assert.rejects(catalogueComposition(art,2));
 }
});

test("using the reserved larger header increases rendered name size without changing aspect ratio or head safety",()=>{
 const detection=top=>({uncertain:false,head:{x:320,y:Math.ceil((top+48)/1.08),width:300,height:220},star:{x:800,y:490,width:100,height:100}});
 for(const [width,height,oldTop,newTop] of [[900,100,200,300],[900,500,380,440]]){
  const old=planNamePlacement(width,height,detection(oldTop));
  const large=planNamePlacement(width,height,detection(newTop));
  assert.ok(large.width>=old.width);assert.ok(large.height>=old.height);
  if(height===500)assert.ok(large.width>old.width);
  assert.ok(Math.abs(large.width/large.height-width/height)<.12);
  const box={...large,right:large.left+large.width,bottom:large.top+large.height};
  assert.equal(intersects(box,large.head),false);assert.equal(intersects(box,large.star),false);
 }
 const prompt=referenceCompositionInstruction({version:1,nameSizeVersion:1,headerBottom:440});
 assert.match(prompt,/LARGE NAME PRIORITY/);assert.match(prompt,/below y=464/);assert.match(prompt,/x=36..1044/);
 assert.throws(()=>referenceCompositionInstruction({version:1,headerBottom:440}));
 assert.throws(()=>referenceCompositionInstruction({version:1,nameSizeVersion:2,headerBottom:440}));
});

test("new size is inherited by corrections and recovery, without upgrading historical jobs",async()=>{
 for(const version of [undefined,1]){
  const parent={status:"completed",name:"תומר גרינברג",...(version?{nameSizeVersion:version}:{})};
  const map=new Map([["parent",parent]]),store={get:async k=>map.get(k),setJSON:async(k,v)=>{if(!map.has(k))map.set(k,v);}};
  const child=await queueCorrection(store,"parent",{name:parent.name,type:"image/jpeg",bytes:Buffer.from("photo")},"portrait");
  assert.equal(map.get(child.id).nameSizeVersion,version);
  map.set("failed",{...parent,status:"failed",nameArtwork:{name:parent.name},error:"לא נמצא מיקום בטוח"});map.set("failed/base",new Uint8Array([1]).buffer);
  const recovery=await queueRecompose(store,"failed");assert.equal(map.get(recovery.id).nameSizeVersion,version);
 }
});

test("fresh jobs pin larger size and pass it to layout planning before image generation",async()=>{
 const generate=await readFile(new URL("../netlify/functions/generate.mjs",import.meta.url),"utf8");
 const worker=await readFile(new URL("../netlify/functions/render-background.mjs",import.meta.url),"utf8");
 assert.match(generate,/nameSizeVersion: NAME_SIZE_VERSION/);
 assert.match(worker,/catalogueComposition\(artwork,job.nameSizeVersion\)/);
 assert.ok(worker.indexOf("catalogueComposition(artwork,")<worker.indexOf("await preparePortraitBase"));
});
