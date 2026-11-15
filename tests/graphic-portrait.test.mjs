import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {graphicPortrait} from '../server/stencil-portrait.mjs';
import {pixelBox} from '../server/name-placement.mjs';
import {composeDominantWall} from '../server/dominant-wall.mjs';
const detection={uncertain:false,head:{x:200,y:150,width:500,height:550},face:{x:230,y:240,width:400,height:400},flag:{x:650,y:200,width:330,height:480},star:{x:750,y:350,width:160,height:180}};
const raw=bytes=>sharp(bytes).removeAlpha().raw().toBuffer();
test('graphic finish reduces fine shading to six paint tones while preserving entire flag and outer wall exactly',async()=>{
 const pixels=Buffer.alloc(1080*1080*3);
 for(let i=0;i<pixels.length;i++)pixels[i]=(i*29+Math.floor(i/1080))%256;
 const source=await sharp(pixels,{raw:{width:1080,height:1080,channels:3}}).png().toBuffer();
 const result=await graphicPortrait(source,detection),out=await raw(result),head=pixelBox(detection.head,0),flag=pixelBox(detection.flag,16);
 for(let y=0;y<1080;y++)for(let x=0;x<1080;x++){
  if(x<head.left||x>=head.right||y<head.top||y>=head.bottom||(x>=flag.left&&x<flag.right&&y>=flag.top&&y<flag.bottom)){
   const i=(y*1080+x)*3;assert.equal(out[i],pixels[i]);assert.equal(out[i+1],pixels[i+1]);assert.equal(out[i+2],pixels[i+2]);
  }
 }
 const colours=new Set();for(let y=320;y<510;y++)for(let x=330;x<510;x++){const i=(y*1080+x)*3;colours.add(out.subarray(i,i+3).toString('hex'));}
 assert.ok(colours.size<=6);assert.notDeepEqual(out,pixels);
});
test('original thin dark facial contours stay at their exact coordinates rather than being erased or moved',async()=>{
 const pixels=Buffer.alloc(1080*1080*3,180);
 for(let y=380;y<440;y++)for(const x of [390,470]){const i=(y*1080+x)*3;pixels.set([6,27,65],i);}
 const source=await sharp(pixels,{raw:{width:1080,height:1080,channels:3}}).png().toBuffer();
 const out=await raw(await graphicPortrait(source,detection));
 for(let y=380;y<440;y++)for(const x of [390,470]){const i=(y*1080+x)*3;assert.deepEqual([...out.subarray(i,i+3)],[6,27,65]);}
 assert.equal(await graphicPortrait(source,{...detection,uncertain:true}),source);
 assert.equal(await graphicPortrait(source,{...detection,flag:undefined}),source);
});
test('current worker applies graphic finish before catalogue lettering and preserves original-source comparison',async()=>{
 const source=await sharp({create:{width:1080,height:1080,channels:3,background:'#aaa8a5'}}).png().toBuffer();
 const art=await sharp({create:{width:1200,height:250,channels:4,background:'#ffd629'}}).png().toBuffer();
 const modern=await composeDominantWall(source,art,detection,{seed:'a',protectFlag:true,preserveFacialDetail:true,graphicFinish:true});
 const prior=await composeDominantWall(source,art,detection,{seed:'a',protectFlag:true,preserveFacialDetail:true});
 assert.equal(modern.placement.manualRequired,false);assert.notDeepEqual(modern.bytes,prior.bytes);
 assert.deepEqual(modern.placement.frame,prior.placement.frame);
 const worker=await readFile('netlify/functions/render-background.mjs','utf8');
 assert.ok(worker.includes('graphicFinish:job.portraitIdentityVersion===3'));
 assert.ok(worker.includes('[1,2,3].includes(job.portraitIdentityVersion)&&!job.recomposeOnly?portrait:null'));
});
