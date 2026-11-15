import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {generateImage} from '../server/core.mjs';
import {refinePortrait,preparePortraitBase} from '../server/portrait-refinement.mjs';
import {reviewImage} from '../server/review.mjs';
import {composeDominantWall} from '../server/dominant-wall.mjs';
import {queueCorrection} from '../server/correction.mjs';
import {queueRecompose} from '../server/recompose.mjs';
import {EXACT_NAME_LAYOUT} from '../public/design.js';
const portrait={bytes:Buffer.from('original-photo'),type:'image/jpeg'};
const style={version:1,paletteVersion:2,nameSizeVersion:1,wallCompositionVersion:3,portraitSide:'LEFT',portraitIdentityVersion:1};

test('identity generation uses only original photo, refinement original plus draft, never unrelated faces or rejected mural',async()=>{
 let count=0;
 const mock=expected=>async(url,{body})=>{
  count++;assert.equal(url,'https://api.openai.com/v1/images/edits');
  const images=body.getAll('image[]');assert.equal(images.length,expected);
  assert.deepEqual(Buffer.from(await images[0].arrayBuffer()),portrait.bytes);
  if(expected===2)assert.equal(Buffer.from(await images[1].arrayBuffer()).toString(),'draft');
  const prompt=body.get('prompt');assert.match(prompt,/SOURCE GEOMETRY HAS PRIORITY/);
  assert.doesNotMatch(prompt,/Image [23] is .*STYLE board/);
  assert.match(prompt,/Do not invent a smile/);assert.match(prompt,/MORE THAN 85%/);
  return Response.json({data:[{b64_json:Buffer.from('result').toString('base64')}]});
 };
 await generateImage(portrait,'PRIVATE_EXPECTED_NAME',mock(1),'seed',false,{bytes:Buffer.from('rejected')},true,true,2,1,1000,style);
 await refinePortrait(portrait,Buffer.from('draft'),mock(2),style);
 assert.equal(count,2);
 let paid=0;await assert.rejects(preparePortraitBase({portraitIdentityVersion:2},portrait,null,{generate:()=>{paid++;}}));assert.equal(paid,0);
});

test('same blind reading call compares original without receiving expected name; drift cannot be marked matched',async()=>{
 for(const likeness of ['consistent','different','uncertain']){
  let calls=0;
  const review=await reviewImage('bXV yYWw='.replaceAll(' ',''),'ExpectedName',async(url,{body})=>{
   calls++;const request=JSON.parse(body);assert.equal(request.store,false);
   assert.ok(!body.includes('ExpectedName'));assert.equal(request.input[0].content.length,2);
   assert.match(request.instructions,/transcribe text ONLY from Image 1/);
   assert.ok(request.text.format.schema.required.includes('likeness'));
   const reading={name:'ExpectedName',caption:'',uncertain:false,flagPresent:true,namePlacement:'clear_above',likeness,likenessIssues:likeness==='different'?['Changed jaw shape']:[]};
   return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reading)}]}]});
  },true,'image/png',true,portrait);
  assert.equal(calls,1);assert.equal(review.likeness,likeness);assert.equal(review.status,likeness==='consistent'?'matched':'needs_review');
 }
 const review=await reviewImage('abc','Name',async()=>{throw Error('offline');},true,'image/png',true,portrait);
 assert.equal(review.status,'unavailable');assert.equal(review.likeness,undefined);
});

test('detail-preserving composition leaves face pixels unchanged after the same crop and resize',async()=>{
 const detection={uncertain:false,head:{x:270,y:190,width:440,height:520},face:{x:290,y:250,width:390,height:450},star:{x:765,y:380,width:155,height:185},flag:{x:640,y:280,width:360,height:370}};
 const pixels=Buffer.alloc(1080*1080*3);
 for(let i=0;i<pixels.length;i++)pixels[i]=(i*73+Math.floor(i/1080))%256;
 const source=await sharp(pixels,{raw:{width:1080,height:1080,channels:3}}).png().toBuffer();
 const artwork=await sharp({create:{width:900,height:300,channels:4,background:'#ffd629'}}).png().toBuffer();
 const result=await composeDominantWall(source,artwork,detection,{seed:'valeri',preserveFacialDetail:true});
 const frame=result.placement.frame;
 const expected=await sharp(source).extract(frame).resize(1080,1080).png().toBuffer();
 const face={left:460,top:420,width:40,height:40};
 const crop=bytes=>sharp(bytes).extract(face).removeAlpha().raw().toBuffer();
 assert.deepEqual(await crop(result.bytes),await crop(expected));
});

test('identity edition survives correction and recompose without storing another copy of original',async()=>{
 const parent={status:'completed',name:'גל בכר',layoutVersion:EXACT_NAME_LAYOUT,portraitIdentityVersion:1,referenceStyleVersion:1,nameArtwork:{name:'גל בכר'},layoutRecoveryVersion:3};
 const map=new Map([['parent',parent]]),store={get:async k=>map.get(k),setJSON:async(k,v)=>{if(!map.has(k))map.set(k,v);}};
 const corrected=await queueCorrection(store,'parent',{...portrait,name:parent.name},'portrait');assert.equal(map.get(corrected.id).portraitIdentityVersion,1);
 map.set('failed',{...parent,status:'failed',error:'לא נמצא מיקום בטוח'});map.set('failed/base',new Uint8Array([1]).buffer);
 const recomposed=await queueRecompose(store,'failed');assert.equal(map.get(recomposed.id).portraitIdentityVersion,1);
 const worker=await readFile('netlify/functions/render-background.mjs','utf8');
 assert.match(worker,/preserveFacialDetail:job.portraitIdentityVersion===1/);
 assert.match(worker,/job.portraitIdentityVersion===1&&!job.recomposeOnly\?portrait:null/);
 assert.match(worker,/finally[\s\S]*store.delete\(`\$\{id\}\/input`\)/);
});
