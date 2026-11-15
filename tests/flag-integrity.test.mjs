import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {dominantWallPlan,composeDominantWall} from '../server/dominant-wall.mjs';
import {intersects,pixelBox} from '../server/name-placement.mjs';
import {compositeCaption} from '../server/composite.mjs';
import {referenceGenerationPrompt,referenceRefinementPrompt} from '../server/reference-style.mjs';
import {reviewImage} from '../server/review.mjs';
import {preparePortraitBase} from '../server/portrait-refinement.mjs';
import {queueCorrection} from '../server/correction.mjs';
import {queueRecompose} from '../server/recompose.mjs';
import {EXACT_NAME_LAYOUT} from '../public/design.js';

const detection={uncertain:false,head:{x:180,y:230,width:330,height:450},face:{x:200,y:250,width:280,height:400},flag:{x:650,y:120,width:330,height:550},star:{x:740,y:350,width:160,height:180}};
test('whole flag including white field and stripes stays inside crop and outside both inscriptions',()=>{
 for(const seed of ['a','b','valeri'])for(const dimensions of [[1500,300],[700,650],[1000,250]]){
  const plan=dominantWallPlan(...dimensions,detection,220,seed,true),flag=pixelBox(plan.detection.flag,16),p=plan.placement;
  assert.equal(intersects({left:p.left,top:p.top,right:p.left+p.width,bottom:p.top+p.height},flag),false);
  assert.ok(flag.bottom<810); // Earliest possible slogan top with height 220.
  const original=pixelBox(detection.flag,0),frame=plan.frame;
  assert.ok(frame.left<=original.left&&frame.top<=original.top);
  assert.ok(frame.left+frame.width>=original.right&&frame.top+frame.height>=original.bottom);
 }
 assert.throws(()=>dominantWallPlan(1500,300,{...detection,flag:undefined},220,'a',true));
 assert.throws(()=>dominantWallPlan(1500,300,{...detection,flag:{x:0,y:0,width:100,height:100}},220,'a',true));
});

test('actual compositing and slogan preserve every pixel of full flag after crop and resize',async()=>{
 const source=await sharp({create:{width:1080,height:1080,channels:3,background:'#168dcc'}}).png().toBuffer();
 const art=await sharp({create:{width:1500,height:300,channels:4,background:'#ffd629'}}).png().toBuffer();
 const result=await composeDominantWall(source,art,detection,{seed:'a',protectFlag:true,preserveFacialDetail:true});
 assert.equal(result.placement.manualRequired,false);
 const expected=await sharp(source).extract(result.placement.frame).resize(1080,1080).png().toBuffer();
 const final=await compositeCaption(result.bytes,9,220),flag=pixelBox(result.detection.flag,0);
 const region={left:flag.left,top:flag.top,width:flag.right-flag.left,height:flag.bottom-flag.top};
 const crop=bytes=>sharp(bytes).extract(region).removeAlpha().raw().toBuffer();
 assert.deepEqual(await crop(final),await crop(expected));
});

test('both image prompts demand intact flag and preserve graffiti and sole source identity',()=>{
 const style={version:1,paletteVersion:2,nameSizeVersion:1,portraitSide:'LEFT',wallCompositionVersion:3,portraitIdentityVersion:1,flagIntegrityVersion:1};
 for(const prompt of [referenceGenerationPrompt('seed',style),referenceRefinementPrompt(style)]){
  assert.match(prompt,/MANDATORY INTACT ISRAELI FLAG/);assert.match(prompt,/TWO continuous blue stripes/);
  assert.match(prompt,/No torn edges, missing pieces, holes, cropped boundaries/);
  assert.match(prompt,/must not cover ANY part/);assert.match(prompt,/Graffiti paint on a wall/);
  assert.match(prompt,/SOURCE GEOMETRY HAS PRIORITY/);
 }
 assert.throws(()=>referenceGenerationPrompt('seed',{...style,flagIntegrityVersion:2}));
});

test('final review cannot match a damaged, covered or uncertain flag even with visible star and correct name',async()=>{
 for(const flagCondition of ['intact','damaged','uncertain'])for(const flagVisibility of ['clear','covered','uncertain']){
  let calls=0;
  const review=await reviewImage('AQID','hidden-name',async(url,{body})=>{
   calls++;const request=JSON.parse(body);assert.equal(request.input[0].content.length,1);
   assert.ok(!body.includes('hidden-name'));assert.ok(request.text.format.schema.required.includes('flagCondition'));
   assert.match(request.instructions,/even if the star remains visible/);
   const reading={name:'hidden-name',caption:'',uncertain:false,flagPresent:true,namePlacement:'clear_above',flagCondition,flagVisibility};
   return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reading)}]}]});
  },true,'image/png',true,null,true);
  assert.equal(calls,1);assert.equal(review.flagCondition,flagCondition);assert.equal(review.flagVisibility,flagVisibility);
  assert.equal(review.status,flagCondition==='intact'&&flagVisibility==='clear'?'matched':'needs_review');
 }
});

test('flag policy inherits on correction and recompose; unsupported policy fails before image generation',async()=>{
 const parent={status:'completed',name:'test',layoutVersion:EXACT_NAME_LAYOUT,layoutRecoveryVersion:3,flagIntegrityVersion:1,nameArtwork:{name:'test'}};
 const map=new Map([['parent',parent]]),store={get:async k=>map.get(k),setJSON:async(k,v)=>{if(!map.has(k))map.set(k,v);}};
 const corrected=await queueCorrection(store,'parent',{bytes:Buffer.from('source'),type:'image/jpeg',name:'test'},'name');assert.equal(map.get(corrected.id).flagIntegrityVersion,1);
 map.set('failed',{...parent,status:'failed',error:'לא נמצא מיקום בטוח'});map.set('failed/base',new Uint8Array([1]).buffer);
 const recovered=await queueRecompose(store,'failed');assert.equal(map.get(recovered.id).flagIntegrityVersion,1);
 let called=false;await assert.rejects(preparePortraitBase({flagIntegrityVersion:2},null,null,{generate:()=>{called=true;}}));assert.equal(called,false);
 const worker=await readFile('netlify/functions/render-background.mjs','utf8');
 assert.match(worker,/protectFlag:job.flagIntegrityVersion===1/);
 assert.match(worker,/portrait:null,job.flagIntegrityVersion===1/);
});
