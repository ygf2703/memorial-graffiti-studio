import sharp from "sharp";
import {pixelBox,planNamePlacement} from "./name-placement.mjs";
import {compositeNameLayer} from "./exact-name.mjs";
import {stencilPortrait,graphicPortrait} from "./stencil-portrait.mjs";
import {backgroundGraffiti} from "./background-graffiti.mjs";

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const sideFor=seed=>[...String(seed)].reduce((n,c)=>n+c.codePointAt(0),0)%2?420:660;
export const dominantPortraitSide=seed=>sideFor(seed)<540?"LEFT":"RIGHT";
function remapBox(box,frame){
 const x=Math.floor((box.x*1.08-frame.left)/frame.width*1000),y=Math.floor((box.y*1.08-frame.top)/frame.height*1000);
 const right=Math.ceil(((box.x+box.width)*1.08-frame.left)/frame.width*1000),bottom=Math.ceil(((box.y+box.height)*1.08-frame.top)/frame.height*1000);
 return {x:clamp(x,0,1000),y:clamp(y,0,1000),width:clamp(right,0,1000)-clamp(x,0,1000),height:clamp(bottom,0,1000)-clamp(y,0,1000)};
}

export function dominantWallPlan(width,height,detection,captionHeight=220,seed="",protectFlag=false){
 if(detection?.uncertain!==false)throw new Error("Uncertain face layout");
 const rawHead=pixelBox(detection.head,0),rawFace=pixelBox(detection.face,0);
 if(rawFace.left<rawHead.left||rawFace.top<rawHead.top||rawFace.right>rawHead.right||rawFace.bottom>rawHead.bottom)throw new Error("Face outside head bounds");
 const head=pixelBox(detection.head),face=pixelBox(detection.face),star=pixelBox(detection.star,16);
 const bounds={left:Math.min(head.left,star.left),top:Math.min(head.top,star.top),right:Math.max(head.right,star.right),bottom:Math.max(head.bottom,star.bottom)};
 if(protectFlag){
  const flag=pixelBox(detection.flag,16),rawFlag=pixelBox(detection.flag,0),rawStar=pixelBox(detection.star,0);
  if(rawStar.left<rawFlag.left||rawStar.top<rawFlag.top||rawStar.right>rawFlag.right||rawStar.bottom>rawFlag.bottom)throw new Error('Star outside flag');
  bounds.left=Math.min(bounds.left,flag.left);bounds.top=Math.min(bounds.top,flag.top);
  bounds.right=Math.max(bounds.right,flag.right);bounds.bottom=Math.max(bounds.bottom,flag.bottom);
 }
 let best;
 // Every candidate FILLS the canvas. Reframe by cropping outer wall/body only;
 // never shrink a mural into a larger wall template. The flag edition also
 // preserves the entire white field and stripes, not just the star.
 for(const size of [980,1040,1080]){
  const minX=Math.max(0,bounds.right-size),maxX=Math.min(bounds.left,1080-size);
  const minY=Math.max(0,bounds.bottom-size),maxY=Math.min(bounds.top,1080-size);
  if(minX>maxX||minY>maxY)continue;
  const desiredX=(face.left+face.right)/2-sideFor(seed)*size/1080;
  const desiredY=face.top-220*size/1080;
  const xs=[...new Set([Math.round(clamp(desiredX,minX,maxX)),Math.ceil(minX),Math.floor(maxX)])];
  const ys=[...new Set([Math.round(clamp(desiredY,minY,maxY)),Math.ceil(minY),Math.floor(maxY)])];
  for(const left of xs)for(const top of ys){
   const frame={left,top,width:size,height:size};
   const mapped={uncertain:false,...Object.fromEntries(["head","face","star",...(detection.flag?["flag"]:[])].map(k=>[k,remapBox(detection[k],frame)]))};
   const transformedFace=pixelBox(mapped.face),transformedStar=pixelBox(mapped.star,16);
   if(Math.max(transformedFace.bottom,transformedStar.bottom,...(protectFlag?[pixelBox(mapped.flag,16).bottom]:[]))>1030-captionHeight-12)continue;
   for(const minimumWidth of [360,180])try{
    const placement=planNamePlacement(width,height,mapped,minimumWidth,false,{faceOnly:true,maximumHeight:240,protectFlag});
    const offCenter=Math.abs((transformedFace.left+transformedFace.right)/2-540);
    const score=(1080/size)*1000+Math.min(offCenter,160)+placement.width*.03;
    if(!best||score>best.score)best={frame,detection:mapped,placement,score,sourceFrameCoverage:1,offCenter};
    break;
   }catch{/* Try another crop without reducing illustration coverage. */}
  }
 }
 if(!best)throw new Error("No verified full-wall title position");
 return best;
}

export async function composeDominantWall(bytes,artwork,detection,context={}){
 const name=await sharp(artwork).trim({background:"#00000000",threshold:0}).png().toBuffer({resolveWithObject:true});
 const base=await sharp(bytes).resize(1080,1080).png().toBuffer();
 let plan,manualRequired=false;
 try{plan=dominantWallPlan(name.info.width,name.info.height,detection,220,context.seed,context.protectFlag===true);}
 catch{
  // Do not silently shrink the illustration when vision is unavailable. Keep
  // the complete full-wall image; the blind final review and human approval
  // must check this unverified title position, with no claim of face safety.
  const scale=Math.min(900/name.info.width,200/name.info.height),width=Math.max(1,Math.floor(name.info.width*scale)),height=Math.max(1,Math.floor(name.info.height*scale));
  plan={frame:{left:0,top:0,width:1080,height:1080},placement:{left:sideFor(context.seed)<540?36:1044-width,top:24,width,height},sourceFrameCoverage:1};
  manualRequired=true;
 }
 const painted=await backgroundGraffiti(await sharp(base).extract(plan.frame).resize(1080,1080).png().toBuffer(),plan.detection,context.seed);
 const mural=context.graphicFinish?await graphicPortrait(painted,plan.detection):context.preserveFacialDetail?painted:await stencilPortrait(painted,plan.detection);
 const paint=await sharp(name.data).resize(plan.placement.width,plan.placement.height).png().toBuffer();
 const layer=await sharp({create:{width:1080,height:1080,channels:4,background:"#00000000"}}).composite([{input:paint,left:plan.placement.left,top:plan.placement.top}]).png().toBuffer();
 const {head:protectedFace,...position}=plan.placement;
 return {bytes:await compositeNameLayer(mural,layer,true),placement:{...position,...(protectedFace?{protectedFace}:{}),source:"prebuilt-dominant-wall",frame:plan.frame,sourceFrameCoverage:1,manualRequired,protection:"face"},detection:plan.detection||null,recovered:true};
}
