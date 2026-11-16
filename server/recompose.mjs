import {randomUUID} from "node:crypto";
import {EXACT_NAME_LAYOUT} from "../public/design.js";
import {LAYOUT_RECOVERY_VERSION} from "./layout-recovery.mjs";

export async function queueRecompose(store,parentId){
  const parent=await store.get(parentId,{type:"json"});
  const legacyWhite=parent?.status==="completed"&&[1,2].includes(parent.layoutRecoveryVersion)&&["prebuilt-reflow","prebuilt-wall-reflow"].includes(parent.namePlacement?.source);
  const unsafeTitle=parent?.status==="completed"&&parent.layoutRecoveryVersion===3&&(parent.namePlacement?.manualRequired===true||parent.review?.namePlacement==="overlap");
  const failed=parent?.status==="failed"&&!parent.recomposeOnly&&parent.error?.startsWith("לא נמצא מיקום בטוח");
  if(!parent?.nameArtwork||(!legacyWhite&&!failed&&!unsafeTitle))throw new Error("Not a repairable layout");
  const base=await store.get(parentId+"/base",{type:"arrayBuffer"});
  if(!base?.byteLength)throw new Error("Missing saved base");
  // A failed repair from the older placement policy must not pin the new button
  // to that same failed child. Keep both claims/results; one child per policy.
  const key=parentId+(unsafeTitle?"/recompose-safe-title-1":"/recompose-layout-"+LAYOUT_RECOVERY_VERSION);
  await store.setJSON(key,{id:randomUUID()},{onlyIfNew:true});
  const claim=await store.get(key,{type:"json"});
  const existing=await store.get(claim.id,{type:"json"});
  if(existing)return{id:claim.id,status:existing.status};
  const inherited=Object.fromEntries(["nameScaleVersion","wallPaintVersion","flagIntegrityVersion","portraitIdentityVersion","name","nameArtwork","nameVariant","nameStyleVersion","nameStyleCount","visualVersion","paletteVersion","nameSizeVersion","referenceStyleVersion","portraitRefinementVersion","portraitRefinementModel","captionVariant","captionStyleCount","captionMix","designSeed","parentId","correctionReason"].filter(k=>parent[k]!==undefined).map(k=>[k,parent[k]]));
  await store.setJSON(claim.id+"/input",{name:parent.name,type:"image/jpeg",bytes:""},{onlyIfNew:true});
  await store.setJSON(claim.id,{...inherited,...(legacyWhite?{parentId:parent.parentId||parentId}:{}),status:"queued",layoutRecoveryVersion:LAYOUT_RECOVERY_VERSION,layoutVersion:EXACT_NAME_LAYOUT,namePlacementVersion:2,recomposeOnly:true,recomposeOf:parentId,createdAt:Date.now()},{onlyIfNew:true});
  return{id:claim.id,status:"queued"};
}

export async function imageBaseForJob(job,previous,generate){
  if(job.recomposeOnly){
    if(!job.recomposeOf||!previous?.byteLength)throw new Error("Missing saved base");
    return Buffer.from(previous);
  }
  return Buffer.from(await generate(),"base64");
}
