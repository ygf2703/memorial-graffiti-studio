import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nameSizing} from '../server/name-sizing.mjs';
import {dominantWallPlan} from '../server/dominant-wall.mjs';
import {pixelBox,intersects} from '../server/name-placement.mjs';
import {referenceGenerationPrompt,referenceRefinementPrompt} from '../server/reference-style.mjs';
import {preparePortraitBase} from '../server/portrait-refinement.mjs';
import {queueCorrection} from '../server/correction.mjs';
import {queueRecompose} from '../server/recompose.mjs';
import {EXACT_NAME_LAYOUT} from '../public/design.js';
const detection={uncertain:false,head:{x:250,y:100,width:430,height:570},face:{x:280,y:360,width:370,height:300},star:{x:810,y:450,width:120,height:120},flag:{x:720,y:370,width:270,height:300}};

test('large name grows within safe bounds, may cross hair, and stays outside face and whole flag',()=>{
 const previous=dominantWallPlan(1000,500,detection,220,'name-size',true);
 const larger=dominantWallPlan(1000,500,detection,220,'name-size',true,1);
 assert.equal(previous.placement.height,240);assert.ok(larger.placement.height>previous.placement.height*1.15);assert.ok(larger.placement.height<=320);
 const p=larger.placement,box={left:p.left,top:p.top,right:p.left+p.width,bottom:p.top+p.height};
 assert.equal(intersects(box,pixelBox(larger.detection.face)),false);
 assert.equal(intersects(box,pixelBox(larger.detection.flag,16)),false);
 assert.equal(intersects(box,pixelBox(larger.detection.head)),true);
 assert.ok(box.left>=36&&box.right<=1044);assert.equal(larger.sourceFrameCoverage,1);
});

test('both portrait stages request larger catalogue title while historical prompts and pixels remain pinned',async()=>{
 const style={version:1,portraitIdentityVersion:4,flagIntegrityVersion:1,paletteVersion:2,nameSizeVersion:1,wallCompositionVersion:3,portraitSide:'LEFT'};
 for(const prompt of [referenceGenerationPrompt('size',{...style,nameScaleVersion:1}),referenceRefinementPrompt({...style,nameScaleVersion:1})]){
  assert.match(prompt,/up to 320px high/);assert.match(prompt,/MAY overlap painted HAIR/);assert.match(prompt,/must remain wholly uncovered/);assert.match(prompt,/complete white\/blue Israeli flag/);
 }
 assert.doesNotMatch(referenceGenerationPrompt('size',style),/LARGE CATALOGUE NAME OVERRIDE/);
 assert.deepEqual(nameSizing(),{maximumHeight:240,fallbackMaximumHeight:200,maximumWidth:900});
 let calls=0;await assert.rejects(preparePortraitBase({nameScaleVersion:2},null,null,{generate:()=>{calls++;}}));assert.equal(calls,0);
 const generate=await readFile('netlify/functions/generate.mjs','utf8');assert.match(generate,/nameScaleVersion: NAME_SCALE_VERSION/);
});

test('correction and native recovery inherit name size without upgrading old jobs',async()=>{
 for(const version of [undefined,1]){
  const parent={status:'completed',name:'שם בדיקה',layoutVersion:EXACT_NAME_LAYOUT,nameArtwork:{name:'שם בדיקה'},...(version?{nameScaleVersion:version}:{})};
  const map=new Map([['parent',parent]]),store={get:async k=>map.get(k),setJSON:async(k,v)=>{if(!map.has(k))map.set(k,v);}};
  const child=await queueCorrection(store,'parent',{name:parent.name,type:'image/jpeg',bytes:Buffer.from('source')},'name');assert.equal(map.get(child.id).nameScaleVersion,version);
  map.set('failed',{...parent,status:'failed',error:'לא נמצא מיקום בטוח'});map.set('failed/base',new Uint8Array([1]).buffer);
  const repair=await queueRecompose(store,'failed');assert.equal(map.get(repair.id).nameScaleVersion,version);
 }
});
