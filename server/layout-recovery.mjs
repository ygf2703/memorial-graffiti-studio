import sharp from "sharp";
import {captionAsset} from "./composite.mjs";
import {detectPortraitLayout,composePlacedArtwork} from "./name-placement.mjs";
import {composeWallRecovery} from "./wall-recovery.mjs";
import {composeDominantWall} from "./dominant-wall.mjs";

export const LAYOUT_RECOVERY_VERSION=3;

export function reviewWithLayoutProof(review,composed){
 if(composed?.placement?.source==="prebuilt-wall-reflow"&&composed.placement.wholeMuralProtected)return {...review,visionNamePlacement:review.namePlacement||"uncertain",namePlacement:"clear_above",placementVerification:"whole-mural-wall-v2"};
 if(!composed?.recovered||composed.placement?.source!=="prebuilt-reflow")return review;
 // Only position is proved by the disjoint native regions, never spelling/likeness.
 return {...review,visionNamePlacement:review.namePlacement||"uncertain",namePlacement:"clear_above",placementVerification:"separate-regions-v1"};
}

export function reflowPlan(width,height,captionHeight){
 if(![width,height,captionHeight].every(Number.isFinite)||width<=0||height<=0||captionHeight<=0||captionHeight>290)throw new Error("Invalid reflow dimensions");
 const footerTop=1030-captionHeight;
 const scale=Math.min(1008/width,240/height),w=Math.max(1,Math.floor(width*scale)),h=Math.max(1,Math.floor(height*scale));
 const top=24+h+24,size=Math.min(1008,footerTop-top-16);
 return {name:{left:Math.round((1080-w)/2),top:24,width:w,height:h},portrait:{left:Math.round((1080-size)/2),top,width:size,height:size},captionTop:footerTop};
}

// Native deterministic composition, no new AI image or invented typography.
// The ENTIRE original mural is fitted into its own region: no cropping and no
// lettering over ANY portrait pixel, even when vision cannot locate the head.
export async function reflowCatalogue(bytes,artwork,captionVariant){
 const name=await sharp(artwork).trim({background:"#00000000",threshold:0}).png().toBuffer({resolveWithObject:true});
 const caption=await captionAsset(captionVariant);
 const plan=reflowPlan(name.info.width,name.info.height,caption.info.height);
 const paint=await sharp(name.data).resize(plan.name.width,plan.name.height,{fit:"fill"}).png().toBuffer();
 const portrait=await sharp(bytes).resize({width:plan.portrait.width,height:plan.portrait.height,fit:"contain",background:"#ffffff"}).png().toBuffer();
 const result=await sharp({create:{width:1080,height:1080,channels:3,background:"#ffffff"}}).composite([
  {input:portrait,left:plan.portrait.left,top:plan.portrait.top},
  {input:paint,left:plan.name.left,top:plan.name.top},
 ]).png().toBuffer();
 return {bytes:result,placement:{...plan.name,source:"prebuilt-reflow",portrait:plan.portrait,captionTop:plan.captionTop},detection:null,recovered:true};
}

export async function placeCatalogueWithRecovery(input,deps={}){
 const {bytes,artwork,wrapped,context,placementVersion,captionVariant,recoveryVersion}=input;
 if(recoveryVersion!==undefined&&![1,2,3].includes(recoveryVersion))throw new Error("Unsupported layout recovery version");
 if(recoveryVersion===3){
  let measured;
  try{measured=await (deps.detect||((b)=>detectPortraitLayout(b,fetch,true)))(bytes);}catch{/* Final review must check unverified layout. */}
  if(!measured&&!deps.detect){
   try{measured=await detectPortraitLayout(bytes,fetch,true,true);}catch{/* Separate the entire source when geometry remains unknown. */}
  }
  return composeDominantWall(bytes,artwork,measured,{...context,captionVariant});
 }
 let detection;
 try{
  detection=await (deps.detect||detectPortraitLayout)(bytes);
  const result=await (deps.compose||composePlacedArtwork)(bytes,artwork,detection,placementVersion,wrapped,context);
  return {...result,detection,recovered:false};
 }catch(error){
  if(![1,2].includes(recoveryVersion)||!context?.catalogueOnly||!error.message?.startsWith("לא נמצא מיקום בטוח"))throw error;
  if(recoveryVersion===2)return composeWallRecovery(bytes,artwork,captionVariant,detection);
  return reflowCatalogue(bytes,artwork,captionVariant);
 }
}
