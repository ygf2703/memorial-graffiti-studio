import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {readFile} from "node:fs/promises";
import {dominantWallPlan,composeDominantWall,dominantPortraitSide} from "../server/dominant-wall.mjs";
import {stencilPortrait} from "../server/stencil-portrait.mjs";
import {pixelBox,intersects,detectPortraitLayout} from "../server/name-placement.mjs";
import {captionAsset,compositeCaption} from "../server/composite.mjs";
import {catalogueComposition,referenceCompositionInstruction} from "../server/reference-style.mjs";
import {placeCatalogueWithRecovery,reviewWithLayoutProof} from "../server/layout-recovery.mjs";
import {reviewImage} from "../server/review.mjs";
import {queueRecompose} from "../server/recompose.mjs";
import {backgroundGraffiti} from "../server/background-graffiti.mjs";

const detection={uncertain:false,head:{x:270,y:190,width:440,height:520},face:{x:290,y:250,width:390,height:450},star:{x:765,y:380,width:155,height:185},flag:{x:640,y:280,width:360,height:370}};
const source=await sharp({create:{width:1080,height:1080,channels:3,background:"#168dcc"}}).png().toBuffer();
const art=await sharp({create:{width:900,height:300,channels:4,background:"#ffd629"}}).png().toBuffer();

test("full-canvas framing preserves the head/star and keeps name and slogan off the face",()=>{
 for(const dimensions of [[1500,300],[1000,650],[600,800]]){
  const plan=dominantWallPlan(...dimensions,detection,220,"valeri");
  assert.equal(plan.sourceFrameCoverage,1);assert.ok(plan.sourceFrameCoverage>.85);
  assert.ok(plan.frame.width>=980&&plan.frame.width<=1080);
  const protectedFace=pixelBox(plan.detection.face),star=pixelBox(plan.detection.star,16),p=plan.placement;
  const name={left:p.left,top:p.top,right:p.left+p.width,bottom:p.top+p.height};
  assert.equal(intersects(name,protectedFace),false);assert.equal(intersects(name,star),false);
  assert.ok(protectedFace.bottom<810&&star.bottom<810);
  const head=pixelBox(detection.head,0);
  assert.ok(plan.frame.left<=head.left&&plan.frame.left+plan.frame.width>=head.right);
  assert.ok(plan.frame.top<=head.top&&plan.frame.top+plan.frame.height>=head.bottom);
  assert.ok(plan.offCenter>=50);
 }
 assert.notEqual(dominantPortraitSide("a"),dominantPortraitSide("b"));
 assert.throws(()=>dominantWallPlan(1000,300,{...detection,uncertain:true}));
 assert.throws(()=>dominantWallPlan(1000,300,{...detection,face:{x:0,y:0,width:100,height:100}}));
});

test("rendered illustration fills every corner; no wall template or inset is added",async()=>{
 const result=await composeDominantWall(source,art,detection,{seed:"valeri"});
 assert.equal(result.placement.manualRequired,false);
 assert.equal(result.placement.protection,"face");
 for(const [left,top] of [[0,0],[1079,0],[0,1079],[1079,1079]]){
  const pixel=await sharp(result.bytes).extract({left,top,width:1,height:1}).removeAlpha().raw().toBuffer();
  assert.deepEqual([...pixel],[22,141,204]);
 }
 const final=await compositeCaption(result.bytes,9,220),meta=await sharp(final).metadata();
 assert.equal(meta.width,1080);assert.equal(meta.height,1080);
 assert.equal((await captionAsset(9,220)).info.height,220);
});

test("vision uncertainty separates the whole source from lettering instead of guessing coordinates",async()=>{
 const result=await placeCatalogueWithRecovery({bytes:source,artwork:art,recoveryVersion:3,context:{seed:"test",catalogueOnly:true}},{detect:async()=>{throw Error("Unavailable");}});
 assert.equal(result.placement.source,"prebuilt-wall-reflow");assert.equal(result.placement.wholeMuralProtected,true);
 assert.ok(result.placement.protectedRegion.top>=result.placement.top+result.placement.height+20);
 const reading={status:"needs_review",namePlacement:"overlap"};
 assert.equal(reviewWithLayoutProof(reading,result).namePlacement,"clear_above");assert.equal(reading.namePlacement,"overlap");assert.equal(reviewWithLayoutProof(reading,result).status,"needs_review");
});

test("stencil finish uses flat paint tones inside the portrait and leaves outer wall pixels intact",async()=>{
 const neutral=await sharp({create:{width:1080,height:1080,channels:3,background:{r:170,g:155,b:140}}}).png().toBuffer();
 const finished=await stencilPortrait(neutral,detection),meta=await sharp(finished).metadata();
 assert.equal(meta.width,1080);assert.equal(meta.height,1080);
 const outside=await sharp(finished).extract({left:0,top:0,width:1,height:1}).removeAlpha().raw().toBuffer();
 const inside=await sharp(finished).extract({left:530,top:480,width:1,height:1}).removeAlpha().raw().toBuffer();
 assert.deepEqual([...outside],[170,155,140]);assert.deepEqual([...inside],[255,220,0]);
 assert.equal(await stencilPortrait(neutral,null),neutral);
});

test("face bounds are requested blindly in the existing analysis call and validated",async()=>{
 const mocked=data=>async(url,options)=>{
  const body=JSON.parse(options.body);
  assert.ok(body.text.format.schema.required.includes("face"));
  assert.ok(body.text.format.schema.required.includes("flag"));
  assert.match(body.instructions,/forehead to chin/);assert.equal(body.store,false);
  return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(data)}]}]});
 };
 assert.deepEqual(await detectPortraitLayout(source,mocked(detection),true),detection);
 await assert.rejects(detectPortraitLayout(source,mocked({...detection,face:{x:0,y:0,width:100,height:100}}),true));
 await assert.rejects(detectPortraitLayout(source,mocked({...detection,flag:{x:0,y:0,width:100,height:100}}),true));
});

test("new prompts require painted coverage and off-center stencil; final review permits hair overlap only",async()=>{
 const style={version:1,nameSizeVersion:1,portraitSide:"LEFT",...await catalogueComposition(art,1,3)};
 const instructions=referenceCompositionInstruction(style);
 assert.match(instructions,/MORE THAN 85%/);assert.match(instructions,/on the LEFT, NOT centered/);assert.match(instructions,/six-layer aerosol/);
 await reviewImage("AQID","hidden expected name",async(url,options)=>{
  const body=JSON.parse(options.body);
  assert.doesNotMatch(body.instructions,/hidden expected name|relative to the entire head/);
  assert.match(body.instructions,/Hair, hats and clothing may be behind lettering/);
  return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({name:"test",caption:"test",uncertain:false,flagPresent:true,namePlacement:"clear_beside"})}]}]});
 },false,"image/png",true);
 const worker=await readFile(new URL("../netlify/functions/render-background.mjs",import.meta.url),"utf8");
 assert.match(worker,/job.layoutRecoveryVersion===3\?220:290/);
 assert.match(worker,/job.namePlacementVersion === 2 && job.layoutRecoveryVersion !== 3/);
});

test("previous small-wall results can be reframed once without a paid portrait generation",async()=>{
 const parent={status:"completed",name:"test",layoutRecoveryVersion:2,namePlacement:{source:"prebuilt-wall-reflow"},nameArtwork:{name:"test"},recomposeOnly:true};
 const map=new Map([["small",parent],["small/base",source.buffer]]),store={get:async key=>map.get(key),setJSON:async(key,value)=>{if(!map.has(key))map.set(key,value);}};
 const first=await queueRecompose(store,"small"),second=await queueRecompose(store,"small");
 assert.equal(first.id,second.id);assert.equal(map.get(first.id).layoutRecoveryVersion,3);
 assert.equal(map.get(first.id).recomposeOnly,true);assert.equal(map.get("small"),parent);
});

test("yellow background accents vary while the head, body and flag half remain unchanged",async()=>{
 const neutral=await sharp({create:{width:1080,height:1080,channels:3,background:"#cccccc"}}).png().toBuffer();
 const result=await backgroundGraffiti(neutral,detection,"valeri");
 assert.deepEqual(await backgroundGraffiti(neutral,detection,"valeri"),result);
 assert.notDeepEqual(await backgroundGraffiti(neutral,detection,"other"),result);
 const raw=await sharp(result).removeAlpha().raw().toBuffer();
 const yellowBins=new Set();let changed=0;
 const h=pixelBox(detection.head,32);
 for(let y=0;y<1080;y++)for(let x=0;x<1080;x++){
  const i=(y*1080+x)*3,pixel=[...raw.subarray(i,i+3)];
  if(x>=540||(x>=h.left&&x<=h.right&&y>=h.top&&y<=h.bottom))assert.deepEqual(pixel,[204,204,204]);
  if(pixel.some(v=>v!==204))changed++;
  if(pixel[0]>pixel[2]+25&&pixel[1]>pixel[2]+15)yellowBins.add(Math.floor(pixel[2]/32));
 }
 assert.ok(changed>500);assert.ok(yellowBins.size>=3);
 const across=await backgroundGraffiti(neutral,{...detection,flag:{x:20,y:100,width:980,height:600}},"valeri");
 const flagPixels=await sharp(across).extract({left:0,top:110,width:540,height:570}).removeAlpha().raw().toBuffer();
 assert.ok(flagPixels.every(value=>value===204));
 assert.equal(await backgroundGraffiti(neutral,null,"test"),neutral);
});
