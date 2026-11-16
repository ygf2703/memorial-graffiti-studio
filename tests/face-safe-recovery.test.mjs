import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {composeDominantWall,dominantWallPlan} from '../server/dominant-wall.mjs';
import {wallRecoveryPlan} from '../server/wall-recovery.mjs';
import {pixelBox,intersects,detectPortraitLayout} from '../server/name-placement.mjs';
import {queueRecompose,imageBaseForJob} from '../server/recompose.mjs';
const base=await sharp({create:{width:1080,height:1080,channels:3,background:'#168dcc'}}).png().toBuffer();
const art=await sharp({create:{width:980,height:320,channels:4,background:'#ffd629'}}).png().toBuffer();

test('missing or invalid layout never puts an unverified large name over the unchanged mural',async()=>{
 for(const detection of [undefined,{uncertain:true},{uncertain:false}]){
  const result=await composeDominantWall(base,art,detection,{nameScaleVersion:1,protectFlag:true,captionVariant:9});
  const p=result.placement;assert.equal(p.source,'prebuilt-wall-reflow');assert.equal(p.wholeMuralProtected,true);
  assert.ok(p.protectedRegion.top>=p.top+p.height+20);assert.ok(p.protectedRegion.bottom<p.captionTop);
  assert.notEqual(p.manualRequired,true);
  const proof=await sharp(result.bytes).extract({left:p.protectedRegion.left+3,top:p.protectedRegion.top+3,width:p.protectedRegion.right-p.protectedRegion.left-6,height:p.protectedRegion.bottom-p.protectedRegion.top-6}).removeAlpha().raw().toBuffer();
  for(let i=0;i<proof.length;i+=3)assert.deepEqual([...proof.subarray(i,i+3)],[22,141,204]);
 }
});

test('Ilan replay geometry places title outside face and visible full flag without changing the original portrait',()=>{
 const detection={uncertain:false,head:{x:500,y:67,width:189,height:264},face:{x:520,y:126,width:151,height:202},star:{x:86,y:204,width:205,height:184},flag:{x:0,y:65,width:430,height:597}};
 const result=dominantWallPlan(2147,701,detection,220,'ilan-replay',true,1),p=result.placement;
 const title={left:p.left,top:p.top,right:p.left+p.width,bottom:p.top+p.height};
 assert.equal(intersects(title,pixelBox(result.detection.face)),false);assert.equal(intersects(title,pixelBox(result.detection.flag,16)),false);
 const recovery=wallRecoveryPlan(2147,701,220,detection,{protectFlag:true,maximumNameHeight:320});
 assert.ok(recovery.protectedRegion.top>recovery.name.top+recovery.name.height);assert.ok(recovery.protectedRegion.bottom<recovery.captionTop);
});

test('completed unsafe results get one durable native repair while the saved base and original job stay pinned',async()=>{
 const parent={status:'completed',name:'שם בדיקה',nameArtwork:{name:'שם בדיקה'},layoutRecoveryVersion:3,nameScaleVersion:1,namePlacement:{manualRequired:true},review:{namePlacement:'overlap'}};
 const map=new Map([['original',parent],['original/base',base.buffer]]),store={get:async k=>map.get(k),setJSON:async(k,v)=>{if(!map.has(k))map.set(k,v);}};
 const a=await queueRecompose(store,'original'),b=await queueRecompose(store,'original');assert.equal(a.id,b.id);assert.equal(map.get('original'),parent);
 const child=map.get(a.id);assert.equal(child.recomposeOnly,true);assert.equal(child.recomposeOf,'original');assert.equal(child.nameScaleVersion,1);
 let imageCalls=0;assert.deepEqual(await imageBaseForJob(child,base,()=>{imageCalls++;}),base);assert.equal(imageCalls,0);
 const app=await readFile('public/app.js','utf8');assert.match(app,/סידור השם בלי הסתרת פנים/);
});

test('accurate layout fallback separates visible coordinates from flag completeness and does not send expected name',async()=>{
 const layout={uncertain:false,head:{x:500,y:67,width:189,height:264},face:{x:520,y:126,width:151,height:202},star:{x:86,y:204,width:205,height:184},flag:{x:0,y:65,width:430,height:597}};
 const measured=await detectPortraitLayout(base,async(url,{body})=>{
  const request=JSON.parse(body);assert.equal(request.model,'gpt-6.1-sol');assert.match(request.instructions,/flag completeness is reviewed separately/);assert.equal(request.store,false);assert.doesNotMatch(request.instructions,/אילן/);
  return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(layout)}]}]});
 },true,true);assert.deepEqual(measured,layout);
});
