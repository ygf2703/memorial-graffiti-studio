import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {generateImage} from '../server/core.mjs';
import {refinePortrait} from '../server/portrait-refinement.mjs';
import {paintSwatchBoard,paintedMediumInstruction} from '../server/reference-style.mjs';
import {PORTRAIT_IDENTITY_VERSION} from '../server/portrait-identity.mjs';
const style={version:1,paletteVersion:2,nameSizeVersion:1,wallCompositionVersion:3,portraitSide:'LEFT',portraitIdentityVersion:PORTRAIT_IDENTITY_VERSION,flagIntegrityVersion:1};
test('current edition uses six supplied paint samples, with original photo as sole identity and no rejected portrait',async()=>{
 assert.equal(PORTRAIT_IDENTITY_VERSION,4);
 const photo={type:'image/jpeg',bytes:Buffer.from('original-photo')},board=await paintSwatchBoard();
 const manifest=JSON.parse(await readFile('netlify/functions/references/approved-paint-swatches.json','utf8'));
 assert.equal(createHash('sha256').update(board).digest('hex'),manifest.boardSha256);assert.equal(manifest.sources.length,6);
 const meta=await sharp(board).metadata();assert.equal(meta.width,768);assert.equal(meta.height,512);
 let calls=0;
 const mocked=count=>async(url,{body})=>{
  calls++;const images=body.getAll('image[]');assert.equal(images.length,count);
  assert.deepEqual(Buffer.from(await images[0].arrayBuffer()),photo.bytes);
  assert.deepEqual(Buffer.from(await images.at(-1).arrayBuffer()),board);
  assert.equal(images.at(-1).name,'paint-material-swatches.png');
  if(count===3)assert.equal(Buffer.from(await images[1].arrayBuffer()).toString(),'draft');
  assert.ok(!images.some(image=>/approved-graphic|rejected/.test(image.name)));
  const prompt=body.get('prompt');assert.ok(prompt.includes(paintedMediumInstruction));
  assert.match(prompt,/fine PAINT texture/);assert.match(prompt,/No flat six-colour posterization/i);
  assert.match(prompt,/sole identity source|ONLY identity source/);assert.match(prompt,/MANDATORY INTACT ISRAELI FLAG/);
  assert.doesNotMatch(prompt,/Remove fine facial stippling|hidden-expected-name/);
  if(count===3){assert.match(prompt,/never restore photographic skin/);assert.doesNotMatch(prompt,/BACKGROUND VARIATION/);}
  return Response.json({data:[{b64_json:Buffer.from('painted').toString('base64')}]});
 };
 await generateImage(photo,'hidden-expected-name',mocked(2),'seed',false,{bytes:Buffer.from('rejected')},true,true,2,1,1000,style);
 await refinePortrait(photo,Buffer.from('draft'),mocked(3),style);
 assert.equal(calls,2);
});
test('new edition preserves photographic geometry and painted detail without the flat native finish',async()=>{
 const worker=await readFile('netlify/functions/render-background.mjs','utf8');
 assert.ok(worker.includes('graphicFinish:job.portraitIdentityVersion===3'));
 assert.ok(worker.includes('preserveFacialDetail:[1,2,3,4].includes(job.portraitIdentityVersion)'));
 const rules=await readFile('netlify.toml','utf8');assert.ok(rules.includes('netlify/functions/references/**'));
});
