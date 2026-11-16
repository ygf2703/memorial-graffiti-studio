import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {releaseCatalog,selectArtwork,loadArtwork,compositeArtwork} from '../server/name-artwork.mjs';
import {loadNameRoster,validateRosterCoverage} from '../server/name-roster.mjs';
import {beforeArielRestore} from './catalog-history.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const audit=JSON.parse(await readFile('data/name-artwork/updates/2026-11-16-table-corrections.json','utf8'));
const restoration=JSON.parse(await readFile('data/name-artwork/updates/2026-11-16-ariel-shaanan.json','utf8'));
async function tableSnapshot(){
 const catalog=await releaseCatalog();
 return {...catalog,entries:await beforeArielRestore(catalog.entries),aliases:restoration.originalAliases};
}

test('39 user-approved corrections retain all 347 roster records and 308 untouched assets',async()=>{
 const current=await releaseCatalog(),roster=await loadNameRoster(),catalog=await tableSnapshot();
 assert.equal(audit.replacements.length,39);assert.equal(new Set(audit.replacements.map(r=>r.pdfNumber)).size,39);
 assert.equal(catalog.entries.length,347);assert.equal(validateRosterCoverage(current,roster),true);
 assert.deepEqual(roster.records.map(({row,name})=>({row,name})),audit.previousRosterMappings.map(({row,name})=>({row,name})));
 const changed=new Set(audit.replacements.map(r=>r.updated.name));
 const unchanged=catalog.entries.filter(e=>!changed.has(e.name));assert.equal(unchanged.length,308);
 assert.equal(hash(JSON.stringify(unchanged.map(({name,file,sha256})=>({name,file,sha256})))),audit.unchangedFingerprint);
 for(const row of audit.replacements){
  assert.deepEqual(selectArtwork(catalog,row.original.name===row.updated.name?row.updated.name:row.sourcePdfTitle.replace(/^\d+\s*-\s*/,'').replace(/\.pdf$/i,'').replaceAll('\u00a0',' ')),row.updated);
  const old=await loadArtwork({entries:[row.original]},row.original.name);assert.equal(hash(old.bytes),row.original.sha256);
 }
});

test('new PNGs match approved hashes, retain alpha and render at 1080 without changing inscription pixels',async()=>{
 const catalog=await tableSnapshot();
 for(const row of audit.replacements){
  const {bytes}=await loadArtwork(catalog,row.updated.name);assert.equal(hash(bytes),row.updated.sha256);
  const metadata=await sharp(bytes).metadata(),alpha=await sharp(bytes).extractChannel(3).raw().toBuffer();
  assert.ok(metadata.hasAlpha&&alpha.includes(0));
  for(const i of [0,metadata.width-1,(metadata.height-1)*metadata.width,metadata.width*metadata.height-1])assert.equal(alpha[i],0);
  assert.equal(row.sourceNormalization.paintPixelsPreserved,true);assert.equal(row.review.spellingChecked,true);
  assert.equal(row.blindReading.sha256,row.updated.sha256);
  if(row.blindReading.status!=='matched')assert.ok(row.updated.ocr.overrideReason.length>=20);
  for(const background of ['#ffffff','#123f69']){
   const base=await sharp({create:{width:1080,height:1080,channels:3,background}}).png().toBuffer();
   const result=await compositeArtwork(base,bytes),info=await sharp(result).metadata();assert.equal(info.width,1080);assert.equal(info.height,1080);
  }
 }
});

test('final-kaf and stray-apostrophe fixes publish their second versions and exact requested spellings',async()=>{
 const catalog=await tableSnapshot();
 for(const [number,name]of [[337,'עידו ברוך'],[96,'בן כובאני']]){
  const row=audit.replacements.find(r=>r.pdfNumber===number);assert.ok(row.revisionPrompt);assert.equal(selectArtwork(catalog,name).sha256,row.updated.sha256);
  assert.equal(row.blindReading.status,'matched');assert.equal(row.blindReading.reading.text,name);
 }
 for(const name of ['עומרי-חיים אלמקייס-יעקובוביץ','נפתלי בן-ציון לנצקרון','אריאל בן שושן','עומר בלוה',"איל מאיר ברקוביץ'"])assert.equal(selectArtwork(catalog,name).name,name);
});
