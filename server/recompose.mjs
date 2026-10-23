import {randomUUID} from "node:crypto";
import {EXACT_NAME_LAYOUT} from "../public/design.js";

export async function queueRecompose(store,parentId){
  const parent=await store.get(parentId,{type:"json"});
  if(!parent||parent.status!=="failed"||parent.recomposeOnly||!parent.nameArtwork||!parent.error?.startsWith("לא נמצא מיקום בטוח"))throw new Error("Not a layout failure");
  const base=await store.get(parentId+"/base",{type:"arrayBuffer"});
  if(!base?.byteLength)throw new Error("Missing saved base");
  const key=parentId+"/recompose-v1";
  await store.setJSON(key,{id:randomUUID()},{onlyIfNew:true});
  const claim=await store.get(key,{type:"json"});
  const existing=await store.get(claim.id,{type:"json"});
  if(existing)return{id:claim.id,status:existing.status};
  const inherited=Object.fromEntries(["name","nameArtwork","nameVariant","nameStyleVersion","nameStyleCount","visualVersion","portraitRefinementVersion","portraitRefinementModel","captionVariant","captionStyleCount","captionMix","designSeed","parentId","correctionReason"].filter(k=>parent[k]!==undefined).map(k=>[k,parent[k]]));
  await store.setJSON(claim.id+"/input",{name:parent.name,type:"image/jpeg",bytes:""},{onlyIfNew:true});
  await store.setJSON(claim.id,{...inherited,status:"queued",layoutVersion:EXACT_NAME_LAYOUT,namePlacementVersion:2,recomposeOnly:true,recomposeOf:parentId,createdAt:Date.now()},{onlyIfNew:true});
  return{id:claim.id,status:"queued"};
}

export async function imageBaseForJob(job,previous,generate){
  if(job.recomposeOnly){
    if(!job.recomposeOf||!previous?.byteLength)throw new Error("Missing saved base");
    return Buffer.from(previous);
  }
  return Buffer.from(await generate(),"base64");
}
