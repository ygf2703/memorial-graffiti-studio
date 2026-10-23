import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {pixelBox,planNamePlacement,intersects,detectPortraitLayout,compositeAdaptiveArtwork} from "../server/name-placement.mjs";
import {muralPrompt} from "../server/prompt.mjs";
import {correctionInstruction,queueCorrection} from "../server/correction.mjs";
import {EXACT_NAME_LAYOUT} from "../public/design.js";

const detection={uncertain:false,head:{x:500,y:90,width:360,height:530},star:{x:110,y:470,width:220,height:180}};
test("left/right/central heads get large separate name boxes above or beside, never across hair",()=>{
 for(const head of [detection.head,{x:100,y:90,width:360,height:530},{x:320,y:280,width:360,height:340}]){
  const value={...detection,head,star:head.x<200?{x:700,y:470,width:180,height:180}:detection.star};
  const p=planNamePlacement(600,350,value),box={left:p.left,top:p.top,right:p.left+p.width,bottom:p.top+p.height};
  assert.equal(intersects(box,p.head),false);assert.equal(intersects(box,p.star),false);
  assert.ok(p.top+p.height<=720);assert.ok(p.width>=180&&p.height>=75);assert.ok(p.top<p.head.bottom);
 }
});
test("invalid detections, uncertainty and no free space fail closed",()=>{
 for(const bad of [{...detection,uncertain:true},{...detection,head:{x:-1,y:0,width:900,height:900}},{...detection,head:{x:0,y:0,width:1000,height:1000}},{...detection,head:{x:800,y:10,width:400,height:400}}])assert.throws(()=>planNamePlacement(600,350,bad));
 assert.throws(()=>pixelBox({x:NaN,y:1,width:100,height:100}));
});
test("actual composition preserves all protected head pixels and safe bottom caption area",async()=>{
 const base=await sharp({create:{width:1080,height:1080,channels:3,background:"#d9cbb3"}}).png().toBuffer();
 const art=await sharp({create:{width:600,height:350,channels:4,background:"#207ba6"}}).png().toBuffer();
 const result=await compositeAdaptiveArtwork(base,art,detection);
 const meta=await sharp(result.bytes).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1080);
 const h=pixelBox(detection.head),area={left:h.left,top:h.top,width:h.right-h.left,height:h.bottom-h.top};
 assert.deepEqual(await sharp(result.bytes).extract(area).removeAlpha().raw().toBuffer(),await sharp(base).extract(area).raw().toBuffer());
 assert.deepEqual(await sharp(result.bytes).extract({left:0,top:740,width:1080,height:340}).removeAlpha().raw().toBuffer(),await sharp(base).extract({left:0,top:740,width:1080,height:340}).raw().toBuffer());
});
test("layout vision is blind, non-storing, structured, and rejects malformed/refused/failed responses",async()=>{
 const response=d=>Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(d)}]}]});
 assert.deepEqual(await detectPortraitLayout(Buffer.from("image"),async(url,options)=>{
  const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.model,"gpt-6-luna");
  assert.match(body.instructions,/ALL hair/);assert.equal(body.input[0].content[0].image_url,"data:image/jpeg;base64,aW1hZ2U=");return response(detection);
 }),detection);
 for(const fetcher of [async()=>response({...detection,uncertain:true}),async()=>response({}),async()=>Response.json({status:"incomplete"}),async()=>Response.json({}, {status:429}),async()=>{throw Error("secret");}])await assert.rejects(detectPortraitLayout(Buffer.from("image"),fetcher),e=>!e.message.includes("secret"));
});
test("adaptive prompt requests richer wall and lifelike graffiti without reserving a fixed top band",()=>{
 const prompt=muralPrompt("seed","גל בכר",false,true,true,true);
 assert.match(prompt,/RICH WALL GRAFFITI/);assert.match(prompt,/slightly more lifelike/);assert.doesNotMatch(prompt,/below y=356/);
 assert.match(correctionInstruction("name","גל בכר",true,true,true),/opposite side/);
});
test("correction retains adaptive version without upgrading historical jobs",async()=>{
 for(const adaptive of [false,true]){
  const parent={status:"completed",name:"גל בכר",layoutVersion:EXACT_NAME_LAYOUT,...(adaptive?{namePlacementVersion:1}:{})};
  const data=new Map([["parent",parent]]),store={get:async k=>data.get(k),setJSON:async(k,v)=>{if(!data.has(k))data.set(k,v);}};
  const child=await queueCorrection(store,"parent",{name:parent.name,type:"image/jpeg",bytes:Buffer.from("test")},"name");
  assert.equal(data.get(child.id).namePlacementVersion,adaptive?1:undefined);
 }
});
