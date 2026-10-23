import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {refinePortrait,preparePortraitBase,PORTRAIT_REFINEMENT_MODEL} from "../server/portrait-refinement.mjs";
import {queueCorrection} from "../server/correction.mjs";
import {queueRecompose} from "../server/recompose.mjs";
import {EXACT_NAME_LAYOUT} from "../public/design.js";
const portrait={bytes:Buffer.from([255,216,255,1]),type:"image/jpeg"};
const edition={portraitRefinementVersion:1,portraitRefinementModel:PORTRAIT_REFINEMENT_MODEL};

test("refinement sends only original photo first and unlettered draft second, with pinned edit model",async()=>{
 let calls=0;
 const result=await refinePortrait(portrait,Buffer.from("draft"),async(url,options)=>{
  calls++;assert.equal(url,"https://api.openai.com/v1/images/edits");
  const form=options.body,images=form.getAll("image[]");
  assert.equal(form.get("model"),PORTRAIT_REFINEMENT_MODEL);assert.equal(form.get("quality"),"high");
  assert.equal(form.get("input_fidelity"),null);assert.equal(form.get("size"),"1024x1024");assert.equal(images.length,2);
  assert.deepEqual(Buffer.from(await images[0].arrayBuffer()),portrait.bytes);
  assert.equal(Buffer.from(await images[1].arrayBuffer()).toString(),"draft");
  const prompt=form.get("prompt");assert.match(prompt,/sole source/);assert.match(prompt,/NO natural brown/);assert.match(prompt,/No names, letters, slogans/);assert.match(prompt,/Do not interpret.*shadows/);
  assert.doesNotMatch(prompt,/תומר|גרינברג/); // No person-specific assumptions in production.
  return Response.json({data:[{b64_json:Buffer.from("refined").toString("base64")}]});
 });
 assert.equal(result.toString(),"refined");assert.equal(calls,1);
});

test("new edition runs two steps in order, checkpoints the draft and returns only refined bytes",async()=>{
 const events=[];
 const result=await preparePortraitBase(edition,portrait,null,{
  onStage:async stage=>events.push(stage),
  generate:async()=>{events.push("generate-call");return Buffer.from("draft").toString("base64");},
  saveDraft:async b=>events.push("saved:"+b),
  refine:async(p,b)=>{assert.equal(p,portrait);assert.equal(b.toString(),"draft");events.push("refine-call");return Buffer.from("refined");},
 });
 assert.equal(result.toString(),"refined");
 assert.deepEqual(events,["generating","generate-call","saved:draft","refining_portrait","refine-call"]);
});

test("failed refinement stops without delivering the draft or retrying either paid call",async()=>{
 let generated=0,refined=0,saved=0;
 await assert.rejects(preparePortraitBase(edition,portrait,null,{
  generate:async()=>{generated++;return "AQID";},saveDraft:async()=>{saved++;},refine:async()=>{refined++;throw Error("failed");},
 }));
 assert.deepEqual([generated,refined,saved],[1,1,1]);
 let calls=0;
 await assert.rejects(refinePortrait(portrait,Buffer.from("draft"),async()=>{calls++;return Response.json({error:{message:"secret-upstream"}},{status:403});}),e=>!e.message.includes("secret-upstream"));
 assert.equal(calls,1);
});

test("historical and layout-repair jobs never invoke refinement or purchase an extra image",async()=>{
 const forbidden=async()=>{throw Error("MUST NOT CALL");};
 const legacy=await preparePortraitBase({},portrait,null,{generate:async()=>"AQID",refine:forbidden,saveDraft:forbidden});
 assert.deepEqual([...legacy],[1,2,3]);
 const repaired=await preparePortraitBase({...edition,recomposeOnly:true,recomposeOf:"parent"},null,Buffer.from("saved"),{generate:forbidden,refine:forbidden,saveDraft:forbidden});
 assert.equal(repaired.toString(),"saved");
 await assert.rejects(preparePortraitBase({...edition,recomposeOnly:true,recomposeOf:"parent"},null,null,{generate:forbidden,refine:forbidden}));
});

test("invalid version, model and missing source fail before a paid call",async()=>{
 let called=0;const generate=async()=>{called++;return "AQID";};
 for(const job of [{portraitRefinementVersion:2},{...edition,portraitRefinementModel:"unknown"},edition]){
  await assert.rejects(preparePortraitBase(job,null,null,{generate}));
 }
 assert.equal(called,0);
});

test("correction and recompose inherit the pinned edition without upgrading historical results",async()=>{
 for(const configured of [false,true]){
  const parent={status:"completed",name:"גל בכר",layoutVersion:EXACT_NAME_LAYOUT,...(configured?edition:{})};
  const map=new Map([["parent",parent]]),store={get:async k=>map.get(k),setJSON:async(k,v)=>{if(!map.has(k))map.set(k,v);}};
  const {id}=await queueCorrection(store,"parent",{...portrait,name:parent.name},"portrait");
  assert.equal(map.get(id).portraitRefinementVersion,configured?1:undefined);
  assert.equal(map.get(id).portraitRefinementModel,configured?PORTRAIT_REFINEMENT_MODEL:undefined);
  map.set("layout",{...parent,status:"failed",error:"לא נמצא מיקום בטוח",nameArtwork:{name:parent.name}});
  map.set("layout/base",new Uint8Array([1]).buffer);
  const repair=await queueRecompose(store,"layout");
  assert.equal(map.get(repair.id).portraitRefinementVersion,configured?1:undefined);
 }
});

test("fresh jobs pin the two-stage edition server-side; the worker retains claim and input cleanup",async()=>{
 const generate=await readFile(new URL("../netlify/functions/generate.mjs",import.meta.url),"utf8");
 const worker=await readFile(new URL("../netlify/functions/render-background.mjs",import.meta.url),"utf8");
 assert.match(generate,/portraitRefinementVersion: PORTRAIT_REFINEMENT_VERSION/);
 assert.ok(worker.indexOf("if (!claim.modified) return")<worker.indexOf("await preparePortraitBase"));
 assert.match(worker,/finally[\s\S]*store.delete\(`\$\{id\}\/input`\)/);
 assert.ok(worker.indexOf("await preparePortraitBase")<worker.indexOf("await detectPortraitLayout"));
});
