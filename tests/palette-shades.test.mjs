import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {readFile} from "node:fs/promises";
import {PALETTE_VERSION,approvedPalette,expandedPalette,enforcePalette,paletteInstructionForVersion} from "../server/palette.mjs";
import {referenceGenerationPrompt,referenceRefinementPrompt} from "../server/reference-style.mjs";
import {queueCorrection} from "../server/correction.mjs";
import {queueRecompose} from "../server/recompose.mjs";

test("new palette extends the immutable old colours and retains exact light accents",async()=>{
 assert.equal(PALETTE_VERSION,2);
 assert.deepEqual(expandedPalette.slice(0,approvedPalette.length),approvedPalette);
 for(const [r,g,b] of expandedPalette)assert.ok((b>g&&g>=r)||(r>=g&&g>b&&g>=164)||(r===255&&g===255&&b===255));
 const input=await sharp(Buffer.from([255,240,106,54,169,225,255,255,255]),{raw:{width:3,height:1,channels:3}}).png().toBuffer();
 const next=await enforcePalette(input,2),data=await sharp(next).raw().toBuffer();
 assert.deepEqual([...data],[255,240,106,54,169,225,255,255,255]);
 assert.deepEqual(await sharp(await enforcePalette(next,2)).raw().toBuffer(),data);
 assert.notDeepEqual(await sharp(await enforcePalette(input,1)).raw().toBuffer(),data);
});

test("colour additions reach both stages without changing composition instructions",()=>{
 const style={version:1,nameSizeVersion:1,headerBottom:440};
 for(const make of [s=>referenceGenerationPrompt("same-seed",s),referenceRefinementPrompt]){
  const old=make({...style,paletteVersion:1}),next=make({...style,paletteVersion:2});
  const addition=paletteInstructionForVersion(2).slice(paletteInstructionForVersion(1).length);
  assert.ok(next.includes(addition));assert.equal(next.replace(addition,""),old);
 }
});

test("palette version is inherited without upgrading historical jobs or name artwork",async()=>{
 for(const version of [undefined,1,2]){
  const nameArtwork={name:"שם קיים",file:"unchanged.png"};
  const parent={status:"completed",name:"שם קיים",nameArtwork,...(version?{paletteVersion:version}:{})};
  const map=new Map([["parent",parent]]),store={get:async k=>map.get(k),setJSON:async(k,v)=>{if(!map.has(k))map.set(k,v);}};
  const child=await queueCorrection(store,"parent",{name:parent.name,type:"image/jpeg",bytes:Buffer.from("photo")},"portrait");
  assert.equal(map.get(child.id).paletteVersion,version);assert.deepEqual(map.get(child.id).nameArtwork,nameArtwork);
  map.set("failed",{...parent,status:"failed",error:"לא נמצא מיקום בטוח"});map.set("failed/base",new Uint8Array([1]).buffer);
  const recovery=await queueRecompose(store,"failed");assert.equal(map.get(recovery.id).paletteVersion,version);
 }
});

test("published names remain catalogue-only; no fallback to ordinary lettering is introduced",async()=>{
 const worker=await readFile(new URL("../netlify/functions/render-background.mjs",import.meta.url),"utf8");
 assert.match(worker,/catalogueOnly:Boolean\(referenceStyle\)/);
});
