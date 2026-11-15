import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import sharp from "sharp";
import {wallRecoveryPlan,composeWallRecovery} from "../server/wall-recovery.mjs";
import {placeCatalogueWithRecovery,LAYOUT_RECOVERY_VERSION} from "../server/layout-recovery.mjs";
import {queueRecompose} from "../server/recompose.mjs";
import {catalogueComposition,referenceCompositionInstruction} from "../server/reference-style.mjs";
import {runInNewContext} from "node:vm";
import {readJson} from "../public/batch.js";

const artwork=await sharp({create:{width:900,height:200,channels:4,background:"#ffd629"}}).png().toBuffer();
const source=await sharp({create:{width:1080,height:1080,channels:3,background:"#168dcc"}}).png().toBuffer();
const detection={uncertain:false,head:{x:300,y:200,width:350,height:420},star:{x:740,y:300,width:180,height:180}};
const blocked=()=>{throw new Error("לא נמצא מיקום בטוח");};

test("wall recovery enlarges protected head/star instead of shrinking the complete wall into an inset",()=>{
 const plan=wallRecoveryPlan(900,200,290,detection);
 assert.ok(plan.transform.width>800);
 assert.ok(plan.protectedRegion.top>plan.name.top+plan.name.height);
 assert.ok(plan.protectedRegion.bottom<plan.captionTop);
 for(const name of [[1600,320],[1000,640],[600,800]])for(const d of [detection,null,{uncertain:true},{uncertain:false}]){
  const p=wallRecoveryPlan(...name,290,d);
  assert.ok(p.protectedRegion.top>p.name.top+p.name.height);
  assert.ok(p.protectedRegion.bottom<p.captionTop);
  assert.ok(p.protectedRegion.left>=0&&p.protectedRegion.right<=1080);
 }
});

test("all edges contain textured wall and protected portrait pixels stay opaque and unchanged",async()=>{
 const result=await composeWallRecovery(source,artwork,9,detection);
 const meta=await sharp(result.bytes).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1080);
 const p=result.placement.protectedRegion;
 const protectedPixels=await sharp(result.bytes).extract({left:p.left+2,top:p.top+2,width:p.right-p.left-4,height:p.bottom-p.top-4}).removeAlpha().raw().toBuffer();
 for(let i=0;i<protectedPixels.length;i+=3)assert.deepEqual([...protectedPixels.subarray(i,i+3)],[22,141,204]);
 for(const corner of [{left:0,top:0},{left:1016,top:0},{left:0,top:1016},{left:1016,top:1016}]){
  const stats=await sharp(result.bytes).extract({...corner,width:64,height:64}).stats();
  assert.ok(stats.channels.some(channel=>channel.stdev>2));
  assert.ok(stats.channels.some(channel=>channel.mean<245));
 }
 assert.equal(result.placement.source,"prebuilt-wall-reflow");
});

test("current policy uses full-wall recovery; unknown bounds preserve every original pixel region",async()=>{
 assert.equal(LAYOUT_RECOVERY_VERSION,2);
 for(const detect of [async()=>detection,blocked]){
  const result=await placeCatalogueWithRecovery({bytes:source,artwork,placementVersion:2,captionVariant:9,recoveryVersion:2,context:{catalogueOnly:true}},{detect,compose:blocked});
  assert.equal(result.placement.source,"prebuilt-wall-reflow");
  assert.equal(result.placement.wholeMuralProtected,detect===blocked);
 }
});

test("completed legacy white results can be repaired once without deleting or buying a portrait",async()=>{
 const parent={status:"completed",name:"test",nameArtwork:{name:"test"},layoutRecoveryVersion:1,namePlacement:{source:"prebuilt-reflow"},recomposeOnly:true};
 const map=new Map([["white",parent],["white/base",source.buffer]]);
 const store={get:async key=>map.get(key),setJSON:async(key,value)=>{if(!map.has(key))map.set(key,value);}};
 const a=await queueRecompose(store,"white"),b=await queueRecompose(store,"white");
 assert.equal(a.id,b.id);assert.equal(map.get(a.id).layoutRecoveryVersion,2);
 assert.equal(map.get(a.id).recomposeOnly,true);assert.equal(map.get(a.id).parentId,"white");
 assert.equal(map.get("white"),parent);
 for(const patch of [{layoutRecoveryVersion:2},{namePlacement:{source:"normal"}},{nameArtwork:null}]){
  map.set("invalid",{...parent,...patch});await assert.rejects(queueRecompose(store,"invalid"));
 }
});

test("new portrait prompts keep one full-bleed wall and a large portrait; historical layouts stay pinned",async()=>{
 const fresh=await catalogueComposition(artwork,1,2),old=await catalogueComposition(artwork,1,1);
 assert.ok(fresh.headerBottom<old.headerBottom);
 const text=referenceCompositionInstruction({version:1,nameSizeVersion:1,...fresh,nameComposition:"side-two-line-v1"});
 assert.match(text,/ONE CONTINUOUS FULL-BLEED/);assert.match(text,/Never make a white page/);assert.match(text,/portrait LARGE/);
 const worker=await readFile(new URL("../netlify/functions/render-background.mjs",import.meta.url),"utf8");
 assert.match(worker,/catalogueComposition\(artwork,job.nameSizeVersion,job.layoutRecoveryVersion\)/);
});

test("restored white cards offer a repair button that queues only native recomposition",async()=>{
 const app=await readFile(new URL("../public/app.js",import.meta.url),"utf8");
 const start=app.indexOf("function showResult("),end=app.indexOf("async function run(");
 assert.ok(end>start);
 const cards=[],requests=[],saved=[];
 const node=(tag,text)=>({tag,text,children:[],append(...children){this.children.push(...children);},addEventListener(event,listener){this.listener=listener;}});
 const show=runInNewContext(app.slice(start,end)+";showResult",{
  node,results:{append:card=>cards.push(card)},requiresApproval:()=>false,busy:false,buttons:()=>{},headers:()=>({}),AbortSignal,readJson,sourceFiles:new Map(),
  fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return Response.json({id:"repaired"});},
  saveJob:job=>saved.push(job),waitForJob:async()=>({poster:"new.png",job:{id:"repaired",layoutRecoveryVersion:2}}),
 });
 show("test",{poster:"old.png",job:{id:"white",layoutRecoveryVersion:1,namePlacement:{source:"prebuilt-reflow"}}});
 const button=cards[0].children.find(child=>child.tag==="button");
 assert.match(button.text,/החזרת קיר גרפיטי רציף/);
 await button.listener();
 assert.equal(requests.length,1);assert.equal(requests[0].url,"/api/recompose");assert.equal(requests[0].body.id,"white");
 assert.equal(saved[0].id,"repaired");assert.equal(cards.length,2);
});
