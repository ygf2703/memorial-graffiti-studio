import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {weatherPaint,materialSwatch} from "../server/paint-surface.mjs";
import {graffitiNameLayer} from "../server/graffiti-name.mjs";
import {twoLineGraffitiAsset} from "../server/name-wrap.mjs";
import {generateImage} from "../server/core.mjs";
import {queueCorrection} from "../server/correction.mjs";
import {EXACT_NAME_LAYOUT} from "../public/design.js";

test("material references exclude the central portrait and keep only verified margins",async()=>{
 const source=await sharp({create:{width:1000,height:1000,channels:3,background:"#d9cbb3"}})
  .composite([{input:await sharp({create:{width:800,height:800,channels:3,background:"#ff0000"}}).png().toBuffer(),left:150,top:150}]).png().toBuffer();
 const swatch=await materialSwatch(source),data=await sharp(swatch).raw().toBuffer();
 for(let i=0;i<data.length;i+=3)assert.ok(!(data[i]>240&&data[i+1]<20&&data[i+2]<20));
 assert.equal((await sharp(swatch).metadata()).width,640);
});

test("paint weathering is deterministic, bounded, transparent and does not mutate the source",async()=>{
 const source=await sharp({create:{width:120,height:90,channels:4,background:"#00000000"}})
  .composite([{input:await sharp({create:{width:60,height:40,channels:4,background:"#207ba6"}}).png().toBuffer(),left:30,top:25}]).png().toBuffer();
 const copy=Buffer.from(source),a=await weatherPaint(source,"same"),b=await weatherPaint(source,"same");
 assert.deepEqual(source,copy);assert.deepEqual(a,b);assert.notDeepEqual(a,source);
 const alpha=await sharp(a).extractChannel(3).raw().toBuffer();
 assert.equal(alpha[0],0);assert.ok(alpha[45*120+60]>=220);assert.ok(alpha.filter(x=>x>200).length>2000);
});

test("new literal graffiti retains ten variants, alpha safety and exact two-line text",async()=>{
 const variants=[];
 for(let v=1;v<=10;v++){
  const layer=await graffitiNameLayer("יהונתן אליהו","paint-check",v,1);variants.push(layer.toString("base64"));
  const alpha=await sharp(layer).extractChannel(3).raw().toBuffer();
  assert.ok(alpha.filter(x=>x>180).length>2500);
  for(let y=0;y<250;y++)assert.equal(alpha[y*1080],0);
 }
 assert.equal(new Set(variants).size,10);
 const {lines,bytes}=await twoLineGraffitiAsset("אשרת פינטו","paint-check",2,1);
 assert.equal(lines.join(" "),"אשרת פינטו");assert.equal((await sharp(bytes).metadata()).hasAlpha,true);
 assert.notDeepEqual(await graffitiNameLayer("יהונתן אליהו","paint-check",2,1),await graffitiNameLayer("יהונתן אליהו","paint-check",2));
});

test("new generation keeps original bytes first, high fidelity, no foreign portraits, no extra generation",async()=>{
 const source=Buffer.from([255,216,255,1,2,3]);let calls=0;
 await generateImage({bytes:source,type:"image/jpeg"},"גל בכר",async(url,options)=>{
  calls++;const images=options.body.getAll("image[]");assert.equal(images.length,5);
  assert.deepEqual(Buffer.from(await images[0].arrayBuffer()),source);
  for(const img of images.slice(1))assert.equal((await sharp(Buffer.from(await img.arrayBuffer())).metadata()).width,640);
  assert.equal(options.body.get("input_fidelity"),"high");
  const prompt=options.body.get("prompt");assert.match(prompt,/IDENTITY PRIORITY/);assert.match(prompt,/eyelid shapes/);assert.match(prompt,/do not rotate or mirror/);
  assert.doesNotMatch(prompt,/Image 5 is the approved COMPOSITION/);
  return Response.json({data:[{b64_json:"test"}]});
 },"seed",false,null,true,true,2,1);
 assert.equal(calls,1);
});

test("correction inherits visual edition and never upgrades historical jobs",async()=>{
 for(const visualVersion of [undefined,1]){
  const parent={name:"גל בכר",status:"completed",layoutVersion:EXACT_NAME_LAYOUT,...(visualVersion?{visualVersion}:{})};
  const map=new Map([["parent",parent]]),store={get:async k=>map.get(k),setJSON:async(k,v)=>{if(!map.has(k))map.set(k,v);}};
  const {id}=await queueCorrection(store,"parent",{name:parent.name,type:"image/jpeg",bytes:Buffer.from("photo")},"portrait");
  assert.equal(map.get(id).visualVersion,visualVersion);
 }
});
