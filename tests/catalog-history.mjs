import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export async function beforeUpdates(entries,files){
 let snapshot=entries;
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
