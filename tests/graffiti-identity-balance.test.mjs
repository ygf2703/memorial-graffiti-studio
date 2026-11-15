import test from 'node:test';
import assert from 'node:assert/strict';
import {generateImage} from '../server/core.mjs';
import {refinePortrait} from '../server/portrait-refinement.mjs';
import {referenceGenerationPrompt,referenceRefinementPrompt} from '../server/reference-style.mjs';
import {PORTRAIT_IDENTITY_VERSION,graffitiIdentityInstruction} from '../server/portrait-identity.mjs';
const photo={bytes:Buffer.from('original'),type:'image/jpeg'};
const style={version:1,paletteVersion:2,nameSizeVersion:1,wallCompositionVersion:3,portraitSide:'LEFT',portraitIdentityVersion:PORTRAIT_IDENTITY_VERSION,flagIntegrityVersion:1};
test('balanced graffiti edition removes photographic surface detail while retaining anatomy and full flag in BOTH stages',async()=>{
 assert.equal(PORTRAIT_IDENTITY_VERSION,2);
 const mock=count=>async(url,{body})=>{
  const images=body.getAll('image[]');assert.equal(images.length,count);
  assert.deepEqual(Buffer.from(await images[0].arrayBuffer()),photo.bytes);
  const prompt=body.get('prompt');assert.ok(prompt.includes(graffitiIdentityInstruction));
  assert.match(prompt,/Remove pores, tiny wrinkles, individual eyelashes/);
  assert.match(prompt,/small set of broad connected/);assert.match(prompt,/ORIGINAL head angle/);
  assert.match(prompt,/remain readable rather than becoming solid blobs/);assert.match(prompt,/not over its facial features/);
  assert.match(prompt,/MANDATORY INTACT ISRAELI FLAG/);assert.match(prompt,/MORE THAN 85%/);
  assert.match(prompt,/original photograph is the ONLY identity reference/);
  return Response.json({data:[{b64_json:Buffer.from('painted').toString('base64')}]});
 };
 await generateImage(photo,'not-sent',mock(1),'seed',false,null,true,true,2,1,1000,style);
 await refinePortrait(photo,Buffer.from('draft'),mock(2),style);
});
test('historical source-identity edition retains its original prompt, without imposing reduced-detail edition',()=>{
 for(const prompt of [referenceGenerationPrompt('seed',{...style,portraitIdentityVersion:1}),referenceRefinementPrompt({...style,portraitIdentityVersion:1})]){
  assert.ok(!prompt.includes(graffitiIdentityInstruction));assert.match(prompt,/SOURCE GEOMETRY HAS PRIORITY/);
 }
});
