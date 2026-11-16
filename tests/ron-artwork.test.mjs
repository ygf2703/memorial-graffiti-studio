import test from 'node:test';
import {beforeNameCorrections} from './catalog-history.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {releaseCatalog,selectArtwork,loadArtwork,compositeArtwork} from '../server/name-artwork.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
test('Ron uses reviewed new bubble design; all other 346 names and historical asset remain unchanged',async()=>{
 const catalog=await releaseCatalog(),update=JSON.parse(await readFile('data/name-artwork/updates/2026-11-15-ron.json','utf8'));
 const entry=selectArtwork(catalog,'רון צרפתי');assert.equal(entry.sha256,update.updated.sha256);assert.notEqual(entry.sha256,update.original.sha256);
 const unchanged=(await beforeNameCorrections(catalog.entries)).filter(item=>item.name!==entry.name);assert.equal(unchanged.length,346);
 assert.equal(hash(JSON.stringify(unchanged.map(({name,file,sha256})=>({name,file,sha256})))),update.unchangedFingerprint);
 assert.equal(hash(await readFile('public/name-artwork/'+update.original.file)),update.original.sha256);
 assert.equal(entry.ocr.text,entry.name);assert.equal(entry.ocr.uncertain,false);assert.equal(update.sourceNormalization.paintPixelsPreserved,true);
 const {bytes}=await loadArtwork(catalog,entry.name),meta=await sharp(bytes).metadata(),alpha=await sharp(bytes).extractChannel(3).raw().toBuffer();
 assert.ok(meta.hasAlpha&&alpha.includes(0)&&alpha.includes(255));
 for(const i of [0,meta.width-1,(meta.height-1)*meta.width,meta.width*meta.height-1])assert.equal(alpha[i],0);
 for(const background of ['#ffffff','#123f69']){
  const base=await sharp({create:{width:1080,height:1080,channels:3,background}}).png().toBuffer();
  const result=await compositeArtwork(base,bytes),info=await sharp(result).metadata();assert.equal(info.width,1080);assert.equal(info.height,1080);
 }
});
