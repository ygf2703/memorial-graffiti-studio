import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {releaseCatalog,loadArtwork,selectArtwork} from "../server/name-artwork.mjs";
import {composePlacedArtwork,intersects,planNamePlacement} from "../server/name-placement.mjs";
import {referenceCompositionInstruction} from "../server/reference-style.mjs";
import {queueCorrection} from "../server/correction.mjs";
import {queueRecompose} from "../server/recompose.mjs";
import {EXACT_NAME_LAYOUT} from "../public/design.js";

const names=["יוסף (יוסי) בן-עזרא","יאיר אשכנזי"];
const composition="side-two-line-v1";
const detection={uncertain:false,head:{x:620,y:90,width:330,height:520},star:{x:760,y:640,width:120,height:110}};

test("corrections and recovery keep pinned side artwork; historical jobs do not acquire it",async()=>{
 const c=await releaseCatalog();
 for(const side of [false,true]){
  const art=structuredClone(selectArtwork(c,names[0]));if(!side){delete art.composition;delete art.layoutReview;}
  const parent={status:"completed",name:art.name,nameArtwork:art,nameSizeVersion:1,referenceStyleVersion:1,layoutVersion:EXACT_NAME_LAYOUT};
  const map=new Map([["parent",parent]]),store={get:async k=>map.get(k),setJSON:async(k,v)=>{if(!map.has(k))map.set(k,v);}};
  const child=await queueCorrection(store,"parent",{name:art.name,type:"image/jpeg",bytes:Buffer.from("photo")},"portrait");
  assert.deepEqual(map.get(child.id).nameArtwork,art);
  map.set("failed",{...parent,status:"failed",error:"לא נמצא מיקום בטוח"});map.set("failed/base",new Uint8Array([1]).buffer);
  const recovered=await queueRecompose(store,"failed");assert.deepEqual(map.get(recovered.id).nameArtwork,art);
 }
});

test("only the two requested names opt into reviewed two-line side composition",async()=>{
 const c=await releaseCatalog();
 assert.deepEqual(c.entries.filter(e=>e.composition===composition).map(e=>e.name).sort(),names.slice().sort());
 for(const name of names){
  const e=selectArtwork(c,name);assert.equal(e.layoutReview.lines.join(" "),name);
  assert.throws(()=>selectArtwork({entries:[{...e,layoutReview:{...e.layoutReview,sha256:"0".repeat(64)}}]},name));
  assert.throws(()=>selectArtwork({entries:[{...e,composition:"unknown"}]},name));
 }
 const worker=await readFile(new URL("../netlify/functions/render-background.mjs",import.meta.url),"utf8");
 assert.match(worker,/referenceStyle.nameComposition=job.nameArtwork.composition/);
 assert.match(worker,/nameComposition:job.nameArtwork.composition/);
});

test("side instruction overrides header and is used by both portrait stages",()=>{
 const prompt=referenceCompositionInstruction({version:1,nameSizeVersion:1,headerBottom:440,nameComposition:composition});
 assert.match(prompt,/ENTIRE recognizable head/);assert.match(prompt,/BESIDE/);assert.match(prompt,/x=36..600/);
 assert.throws(()=>referenceCompositionInstruction({version:1,nameComposition:composition}));
 assert.throws(()=>referenceCompositionInstruction({version:1,nameSizeVersion:1,nameComposition:"invalid"}));
});

test("actual approved PNGs render large beside a planned head on light and dark walls",async()=>{
 const c=await releaseCatalog();await mkdir(".netlify/side-two-line-qa",{recursive:true});
 for(const [i,name] of names.entries()){
  const {bytes}=await loadArtwork(c,name);
  for(const [label,background] of [["light","#ffffff"],["dark","#123f69"]]){
   const base=await sharp({create:{width:1080,height:1080,channels:3,background}}).png().toBuffer();
   const result=await composePlacedArtwork(base,bytes,detection,2,null,{name,catalogueOnly:true,nameComposition:composition});
   const p=result.placement,box={...p,right:p.left+p.width,bottom:p.top+p.height};
   assert.ok(p.width>=460);assert.ok(p.height>=200);assert.equal(p.lines,2);
   assert.equal(intersects(box,p.head),false);assert.equal(intersects(box,p.star),false);
   assert.ok(box.right<=p.head.left||box.left>=p.head.right);
   assert.ok(box.bottom>p.head.top&&box.top<p.head.bottom);
   const overlay=Buffer.from('<svg width="1080" height="1080"><rect x="670" y="97" width="356" height="562" rx="130" fill="#168dcc"/><text x="700" y="350" fill="white" font-size="26">LAYOUT TEST</text></svg>');
   await sharp(result.bytes).composite([{input:overlay}]).png().toFile(`.netlify/side-two-line-qa/${i}-${label}.png`);
   await writeFile(`.netlify/side-two-line-qa/${i}-placement.json`,JSON.stringify(p,null,2));
  }
  await assert.rejects(composePlacedArtwork(Buffer.from("unused"),bytes,{...detection,head:{x:0,y:0,width:1000,height:1000}},2,null,{name,catalogueOnly:true,nameComposition:composition}));
 }
});

test("side-only layout cannot silently fall back to a large title above a centered head",()=>{
 const d={uncertain:false,head:{x:300,y:450,width:400,height:300},star:{x:800,y:500,width:100,height:100}};
 assert.ok(planNamePlacement(1000,500,d,460));
 assert.throws(()=>planNamePlacement(1000,500,d,460,true));
});
