import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export async function beforeUpdates(entries,files){
 let snapshot=await beforeNameCorrections(entries);
 for(const file of files){
  const update=JSON.parse(await readFile(`data/name-artwork/updates/${file}`,'utf8'));
  snapshot=snapshot.map(entry=>{
   if(entry.name!==update.updated.name)return entry;
   assert.equal(entry.sha256,update.updated.sha256);
   return update.original;
  });
 }
 return snapshot;
}

export async function beforeNameCorrections(entries){
 entries=await beforeArielRestore(entries);
 const update=JSON.parse(await readFile('data/name-artwork/updates/2026-11-16-table-corrections.json','utf8'));
 return entries.map(entry=>{
  const row=update.replacements.find(row=>row.updated.name===entry.name);
  if(!row)return entry;
  assert.equal(entry.sha256,row.updated.sha256);
  return row.original;
 });
}

export async function beforeArielRestore(entries){
 entries=await beforeGabrielRefresh(entries);
 const update=JSON.parse(await readFile('data/name-artwork/updates/2026-11-16-ariel-shaanan.json','utf8'));
 return entries.map(entry=>{
  if(entry.name!==update.updated.name)return entry;
  assert.equal(entry.sha256,update.updated.sha256);
  return update.original;
 });
}

export async function beforeGabrielRefresh(entries){
 const update=JSON.parse(await readFile('data/name-artwork/updates/2026-11-16-gabriel-refresh.json','utf8'));
 return entries.map(entry=>{
  if(entry.name!==update.updated.name)return entry;
  assert.equal(entry.sha256,update.updated.sha256);
  return update.original;
 });
}
