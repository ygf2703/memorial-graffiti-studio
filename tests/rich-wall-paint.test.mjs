import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {backgroundGraffiti} from '../server/background-graffiti.mjs';
import {pixelBox} from '../server/name-placement.mjs';
import {referenceGenerationPrompt,referenceRefinementPrompt} from '../server/reference-style.mjs';
import {preparePortraitBase} from '../server/portrait-refinement.mjs';
import {queueCorrection} from '../server/correction.mjs';
import {queueRecompose} from '../server/recompose.mjs';
import {EXACT_NAME_LAYOUT} from '../public/design.js';
const detection={uncertain:false,head:{x:270,y:190,width:440,height:520},face:{x:290,y:250,width:390,height:450},star:{x:765,y:380,width:155,height:185},flag:{x:640,y:280,width:360,height:370}};
test('bundled brush stamp keeps genuine generated alpha and its audited source checksum',async()=>{
 const bytes=await readFile('netlify/functions/references/rich-spray-brush.png');
 const audit=JSON.parse(await readFile('netlify/functions/references/rich-spray-brush.json','utf8'));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),audit.sha256);assert.equal(audit.tool,'built-in-imagegen');
 const info=await sharp(bytes).metadata(),alpha=await sharp(bytes).extractChannel(3).raw().toBuffer();
 assert.equal(info.hasAlpha,true);assert.ok(alpha.some(v=>v===0));assert.ok(alpha.some(v=>v>200));
});
test('rich edition paints substantially more wall on both sides, with exact preservation of head, body and full flag',async()=>{
 const base=await sharp({create:{width:1080,height:1080,channels:3,background:'#cccccc'}}).png().toBuffer();
 const legacy=await backgroundGraffiti(base,detection,'valeri'),rich=await backgroundGraffiti(base,detection,'valeri',1);
 const a=await sharp(legacy).removeAlpha().raw().toBuffer(),b=await sharp(rich).removeAlpha().raw().toBuffer(),h=pixelBox(detection.head,32),flag=pixelBox(detection.flag,32);
 let oldCount=0,newCount=0,rightCount=0;
 for(let y=0;y<1080;y++)for(let x=0;x<1080;x++){
  const i=(y*1080+x)*3,changed=b[i]!==204||b[i+1]!==204||b[i+2]!==204;
  if(a[i]!==204||a[i+1]!==204||a[i+2]!==204)oldCount++;
  if(changed){newCount++;if(x>=540)rightCount++;}
  const inHead=x>=h.left&&x<=h.right&&y>=h.top&&y<=h.bottom;
  const inFlag=x>=flag.left&&x<=flag.right&&y>=flag.top&&y<=flag.bottom;
  const spread=Math.max(0,y-h.bottom+30)*.8;
  const inBody=y>h.bottom-30&&x>=h.left-110-spread&&x<=h.right+110+spread;
  if(inHead||inFlag||inBody)assert.equal(changed,false);
 }
 assert.ok(newCount>oldCount*2,`${newCount} versus ${oldCount}`);assert.ok(rightCount>1000);
 assert.deepEqual(await backgroundGraffiti(base,detection,'valeri',1),rich);
 assert.notDeepEqual(await backgroundGraffiti(base,detection,'other',1),rich);
 assert.equal(await backgroundGraffiti(base,null,'valeri',1),base);
 await assert.rejects(backgroundGraffiti(base,detection,'valeri',2));
});
test('rich paint instructions add dense spray and dry-brush strokes, while refinement retains them and identity geometry',()=>{
 const style={version:1,paletteVersion:2,nameSizeVersion:1,wallCompositionVersion:3,portraitSide:'LEFT',portraitIdentityVersion:4,flagIntegrityVersion:1,wallPaintVersion:1};
 const prompt=referenceGenerationPrompt('seed',style),refinement=referenceRefinementPrompt(style);
 assert.match(prompt,/substantially MORE visible/);assert.match(prompt,/dry-brush swipes/);assert.match(prompt,/BOTH sides/);
 assert.match(prompt,/complete Israeli flag stays white\/blue, intact/);assert.match(prompt,/sole|ONLY identity/);
 assert.match(refinement,/Do not wash them out/);assert.match(refinement,/original photograph|ORIGINAL photograph/);
 assert.doesNotMatch(referenceGenerationPrompt('seed',{...style,wallPaintVersion:undefined}),/RICH SPRAY AND BRUSH GRAFFITI/);
 assert.throws(()=>referenceGenerationPrompt('seed',{...style,wallPaintVersion:2}));
});
test('fresh jobs pin rich paint, correction and recompose retain it, invalid edition fails before any paid call',async()=>{
 const parent={status:'completed',name:'test',referenceStyleVersion:1,wallPaintVersion:1,layoutRecoveryVersion:3,layoutVersion:EXACT_NAME_LAYOUT,nameArtwork:{name:'test'}};
 const map=new Map([['parent',parent]]),store={get:async k=>map.get(k),setJSON:async(k,v)=>{if(!map.has(k))map.set(k,v);}};
 const corrected=await queueCorrection(store,'parent',{bytes:Buffer.from('source'),type:'image/jpeg',name:'test'},'portrait');assert.equal(map.get(corrected.id).wallPaintVersion,1);
 map.set('failed',{...parent,status:'failed',error:'לא נמצא מיקום בטוח'});map.set('failed/base',new Uint8Array([1]).buffer);
 const child=await queueRecompose(store,'failed');assert.equal(map.get(child.id).wallPaintVersion,1);
 let calls=0;await assert.rejects(preparePortraitBase({wallPaintVersion:2},null,null,{generate:()=>{calls++;}}));assert.equal(calls,0);
 const generate=await readFile('netlify/functions/generate.mjs','utf8');assert.ok(generate.includes('wallPaintVersion: WALL_PAINT_VERSION'));
 const worker=await readFile('netlify/functions/render-background.mjs','utf8');assert.ok(worker.includes('context:{wallPaintVersion:job.wallPaintVersion'));
});
