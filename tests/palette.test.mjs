import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {readFile} from "node:fs/promises";
import {enforcePalette,approvedPalette,validatePaletteVersion} from "../server/palette.mjs";
import {referenceGenerationPrompt,referenceRefinementPrompt} from "../server/reference-style.mjs";
import {queueCorrection} from "../server/correction.mjs";
import {queueRecompose} from "../server/recompose.mjs";

test("all pixels, including beige, skin, green, red and black, end in the approved palette",async()=>{
 const pixels=Buffer.from([220,205,180, 210,149,120, 0,128,0, 255,0,0, 0,0,0, 255,255,255, 0,80,200, 255,220,0]);
 const input=await sharp(pixels,{raw:{width:8,height:1,channels:3}}).png().toBuffer();
 const output=await enforcePalette(input,1),{data,info}=await sharp(output).raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,8);assert.equal(info.height,1);assert.equal(info.channels,3);
 const allowed=new Set(approvedPalette.map(rgb=>rgb.join(",")));
 for(let i=0;i<data.length;i+=3)assert.ok(allowed.has([...data.subarray(i,i+3)].join(",")));
 assert.deepEqual([...data.subarray(12,15)],[6,27,65]); // No unmasked black on a face or letter.
 assert.deepEqual([...data.subarray(15,18)],[255,255,255]);
 const twice=await sharp(await enforcePalette(output,1)).raw().toBuffer();
 assert.deepEqual(twice,data);
});

test("palette members are exclusively blue, yellow or white shades; no grey, black or brown",()=>{
 for(const [r,g,b] of approvedPalette){
  assert.ok((b>g&&g>=r)||(r>=g&&g>b&&g>=164)||(r===255&&g===255&&b===255));
 }
});

test("transparent pixels flatten to white and pixel positions and dimensions remain unchanged",async()=>{
 const input=await sharp(Buffer.from([255,0,0,0, 15,92,175,255]),{raw:{width:2,height:1,channels:4}}).png().toBuffer();
 const data=await sharp(await enforcePalette(input,1)).raw().toBuffer();
 assert.deepEqual([...data],[255,255,255,15,92,175]);
});

test("historical images are returned untouched; unsupported versions fail closed",async()=>{
 const original=Buffer.from("not even an image");
 assert.equal(await enforcePalette(original),original);
 assert.throws(()=>validatePaletteVersion(2));
 await assert.rejects(enforcePalette(original,2),/Unsupported palette/);
});

test("both image prompts override warm reference walls, without modifying historical prompts",()=>{
 const style={version:1,headerBottom:300,paletteVersion:1};
 for(const prompt of [referenceGenerationPrompt("seed",style),referenceRefinementPrompt(style)]){
  assert.match(prompt,/ONLY yellow, blue and white/);
  assert.match(prompt,/Black is permitted ONLY for background doodles/);
  assert.doesNotMatch(prompt,/neutral beige only for bare wall/);
 }
 assert.match(referenceGenerationPrompt("seed",{version:1,headerBottom:300}),/neutral beige only for bare wall/);
 assert.throws(()=>referenceRefinementPrompt({...style,paletteVersion:2}));
});

test("correction and layout repair inherit palette version; old jobs are not upgraded",async()=>{
 for(const version of [undefined,1]){
  const parent={status:"completed",name:"תומר גרינברג",...(version?{paletteVersion:version}:{})};
  const map=new Map([["parent",parent]]),store={get:async k=>map.get(k),setJSON:async(k,v)=>{if(!map.has(k))map.set(k,v);}};
  const child=await queueCorrection(store,"parent",{name:parent.name,type:"image/jpeg",bytes:Buffer.from("photo")},"portrait");
  assert.equal(map.get(child.id).paletteVersion,version);
  map.set("failed",{...parent,status:"failed",nameArtwork:{name:parent.name},error:"לא נמצא מיקום בטוח"});map.set("failed/base",new Uint8Array([1]).buffer);
  const recovery=await queueRecompose(store,"failed");assert.equal(map.get(recovery.id).paletteVersion,version);
 }
});

test("server pins palette and applies it after ALL lettering/grading but before storage and review",async()=>{
 const generate=await readFile(new URL("../netlify/functions/generate.mjs",import.meta.url),"utf8");
 const worker=await readFile(new URL("../netlify/functions/render-background.mjs",import.meta.url),"utf8");
 assert.match(generate,/paletteVersion: PALETTE_VERSION/);
 const guard=worker.indexOf("await enforcePalette");
 assert.ok(guard>worker.indexOf("await compositeCaption"));assert.ok(guard>worker.indexOf("await vividPoster"));
 assert.ok(guard<worker.indexOf("await store.set(`${id}/result`"));assert.ok(guard<worker.indexOf("await reviewImage"));
 assert.ok(worker.indexOf("validatePaletteVersion(job.paletteVersion)")<worker.indexOf("await preparePortraitBase"));
});
