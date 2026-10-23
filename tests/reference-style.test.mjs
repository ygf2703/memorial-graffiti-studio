import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {catalogueComposition,referenceCompositionInstruction,referenceBoard} from '../server/reference-style.mjs';
import {composePlacedArtwork,intersects} from '../server/name-placement.mjs';
import {generateImage} from '../server/core.mjs';
import {refinePortrait} from '../server/portrait-refinement.mjs';
import {releaseCatalog,loadArtwork} from '../server/name-artwork.mjs';
import {queueCorrection} from '../server/correction.mjs';
import {queueRecompose} from '../server/recompose.mjs';
const style={version:1,headerBottom:340};
test('graphic board is a bundled image; layout accounts for trimmed catalogue proportions',async()=>{
 const meta=await sharp(await referenceBoard()).metadata();assert.equal(meta.width,1536);assert.equal(meta.height,512);
 const narrow=await sharp({create:{width:900,height:100,channels:4,background:'#207ba6'}}).png().toBuffer();
 const tall=await sharp({create:{width:900,height:800,channels:4,background:'#207ba6'}}).png().toBuffer();
 assert.equal((await catalogueComposition(narrow)).headerBottom,200);assert.equal((await catalogueComposition(tall)).headerBottom,380);
 assert.match(referenceCompositionInstruction(style),/below y=364/);
 assert.throws(()=>referenceCompositionInstruction({version:2,headerBottom:340}));
});
test('catalogue-only placement never substitutes a font, even when the normal bitmap cannot fit',async()=>{
 const base=await sharp({create:{width:1080,height:1080,channels:3,background:'#d9cbb3'}}).png().toBuffer();
 const detection={uncertain:false,head:{x:438,y:134,width:382,height:535},star:{x:237,y:350,width:174,height:187}};
 const catalogue=await releaseCatalog(),{bytes}=await loadArtwork(catalogue,'אשרת פינטו');
 try{
  const result=await composePlacedArtwork(base,bytes,detection,2,null,{name:'אשרת פינטו',catalogueOnly:true,visualVersion:1});
  assert.notEqual(result.placement.source,'literal-two-line');
  assert.equal(intersects({...result.placement,right:result.placement.left+result.placement.width,bottom:result.placement.top+result.placement.height},result.placement.head),false);
 }catch(error){assert.match(error.message,/לא נמצא מיקום בטוח/);}
 await assert.rejects(composePlacedArtwork(base,bytes,{...detection,head:{x:0,y:0,width:1000,height:1000}},2,null,{name:'אשרת פינטו',catalogueOnly:true}));
});
test('both image stages receive the actual graphic board and explicit non-photographic rules',async()=>{
 const portrait={bytes:Buffer.from([255,216,255]),type:'image/jpeg'};
 await generateImage(portrait,'שם מלא',async(url,options)=>{
  assert.equal(options.body.getAll('image[]').length,2);assert.match(options.body.get('prompt'),/NO halftone/);assert.match(options.body.get('prompt'),/below y=364/);
  return Response.json({data:[{b64_json:'AQID'}]});
 },'seed',false,null,true,true,2,1,300000,style);
 await refinePortrait(portrait,Buffer.from('draft'),async(url,options)=>{
  assert.equal(options.body.getAll('image[]').length,3);assert.match(options.body.get('prompt'),/Image 3 is the approved GRAPHIC ILLUSTRATION STYLE board/);assert.match(options.body.get('prompt'),/broad connected/);assert.match(options.body.get('prompt'),/Preserve this safe empty upper area/);
  return Response.json({data:[{b64_json:'AQID'}]});
 },style);
});
test('new style is inherited by correction and layout-only recovery, but never assigned to old jobs',async()=>{
 for(const version of [undefined,1]){
  const parent={status:'completed',name:'תומר גרינברג',...(version?{referenceStyleVersion:version}:{})};
  const map=new Map([['parent',parent]]),store={get:async k=>map.get(k),setJSON:async(k,v)=>{if(!map.has(k))map.set(k,v);}};
  const child=await queueCorrection(store,'parent',{name:parent.name,type:'image/jpeg',bytes:Buffer.from('photo')},'portrait');
  assert.equal(map.get(child.id).referenceStyleVersion,version);
  map.set('failed',{...parent,status:'failed',nameArtwork:{name:parent.name},error:'לא נמצא מיקום בטוח'});map.set('failed/base',new Uint8Array([1]).buffer);
  const recovery=await queueRecompose(store,'failed');assert.equal(map.get(recovery.id).referenceStyleVersion,version);
 }
});
