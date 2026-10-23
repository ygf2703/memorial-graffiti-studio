import test from 'node:test';
import assert from 'node:assert/strict';
import {processBatch,stopsBatch,readJson,batchSummary,resolveArtworkName} from '../public/batch.js';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';

test('a layout failure skips only that image and finishes every remaining item once, in order',async()=>{
 const attempted=[],errors=[];
 const summary=await processBatch(['first','blocked','third','fourth'],async item=>{
  attempted.push(item);if(item==='blocked')throw Object.assign(new Error('לא נמצא מיקום בטוח לשם ללא הסתרת הראש'),{jobId:'saved-job',canRecompose:true});
 },(item,error)=>errors.push({item,id:error.jobId,repair:error.canRecompose}));
 assert.deepEqual(attempted,['first','blocked','third','fourth']);
 assert.deepEqual(errors,[{item:'blocked',id:'saved-job',repair:true}]);
 assert.deepEqual(summary,{success:3,failed:1,pending:0});
 assert.match(batchSummary(summary.success,summary.failed,summary.pending),/נוצרו 3 פוסטרים, 1 נכשלו/);
});

test('multiple local failures and moderation rejection do not stop or retry the batch',async()=>{
 const attempted=[];
 const summary=await processBatch([1,2,3],async item=>{attempted.push(item);throw Error(item===2?'שירות התמונות לא אישר את הבקשה הזו.':'יצירת התמונה נכשלה.');},()=>{});
 assert.deepEqual(attempted,[1,2,3]);assert.deepEqual(summary,{success:0,failed:3,pending:0});
 assert.deepEqual(await processBatch([],()=>{throw Error('No calls');},()=>{}),{success:0,failed:0,pending:0});
});

test('HTTP credentials, rate limits and service outages stop without submitting later images',async()=>{
 for(const status of [401,403,429,500,503]){
  let attempted=0;
  const summary=await processBatch([1,2,3],async()=>{attempted++;await readJson(Response.json({error:'global failure'},{status}));},()=>{});
  assert.equal(attempted,1);assert.deepEqual(summary,{success:0,failed:1,pending:2});
 }
 assert.equal(stopsBatch(Object.assign(Error('bad photo'),{status:400})),false);
 assert.equal(stopsBatch(Error('אין יתרה זמינה בחשבון OpenAI API.')),true);
 assert.equal(stopsBatch(Error('מפתח OpenAI אינו תקף.')),true);
 assert.equal(stopsBatch(new TypeError('Failed to fetch')),true);
 assert.equal(stopsBatch(new DOMException('timeout','TimeoutError')),true);
});

test('restore mode preserves the prior behavior of checking all saved jobs without resubmission',async()=>{
 const checked=[];
 const result=await processBatch(['old-a','old-b'],async id=>{checked.push(id);throw Object.assign(Error('unavailable'),{status:503});},()=>{},false);
 assert.deepEqual(checked,['old-a','old-b']);assert.deepEqual(result,{success:0,failed:2,pending:0});
});

test('actual app run submits and displays later images after a failed job, preserving its repair button',async()=>{
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const start=source.indexOf('async function run(items, restore = false)'),end=source.indexOf('generateButton.addEventListener',start);
 assert.ok(start>0&&end>start);
 const saved=[],displayed=[],errors=[],submitted=[],progress={textContent:''};
 const run=runInNewContext(source.slice(start,end)+';run',{
  processBatch,batchSummary,resolveArtworkName,readJson,progress,artworkAliases:{},busy:false,
  checkConnection:async()=>true,buttons:()=>{},crypto:{randomUUID},sourceFiles:new Map(),
  FormData,AbortSignal,headers:()=>({}),prepareUpload:async file=>file,
  saveJob:job=>saved.push(job),
  fetch:async(url,{body})=>{submitted.push(body.get('name'));return Response.json({id:body.get('id')},{status:202});},
  waitForJob:async id=>{
   if(saved.find(job=>job.id===id)?.name==='נתאי עמאר')throw Object.assign(Error('לא נמצא מיקום בטוח לשם ללא הסתרת הראש'),{jobId:id,canRecompose:true});
   return {poster:'test-png',job:{id}};
  },
  showResult:name=>displayed.push(name),showError:(name,message,id)=>errors.push({name,id}),
 });
 await run(['ראשון תקין','נתאי עמאר','שלישי תקין'].map(name=>({name,file:new Blob(['test'],{type:'image/jpeg'})})));
 assert.deepEqual(submitted,['ראשון תקין','נתאי עמאר','שלישי תקין']);
 assert.deepEqual(displayed,['ראשון תקין','שלישי תקין']);
 assert.equal(errors[0].id,saved[1].id);assert.equal(saved.length,3);
 assert.match(progress.textContent,/נוצרו 2 פוסטרים, 1 נכשלו/);assert.doesNotMatch(progress.textContent,/לא נשלחו/);
});
