import sharp from "sharp";
import {resolve} from "node:path";
import {captionAsset} from "./composite.mjs";
import {pixelBox} from "./name-placement.mjs";

let backdrop;
async function wallBackdrop(){
 if(!backdrop)backdrop=(async()=>{
  const layers=[];
  for(let row=0;row<3;row++)for(let col=0;col<3;col++){
   const size=540,tile=await sharp(resolve("netlify/functions/references/recovery-wall-tile.png")).rotate(((row*3+col)%4)*90).resize(size,size,{fit:"cover"}).removeAlpha().raw().toBuffer();
   const rgba=Buffer.alloc(size*size*4);
   for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x,alpha=Math.min(1,Math.max(0,Math.min(x,y,size-1-x,size-1-y)/70));
    rgba[i*4]=tile[i*3];rgba[i*4+1]=tile[i*3+1];rgba[i*4+2]=tile[i*3+2];rgba[i*4+3]=Math.round(alpha*255);
   }
   const left=-110+col*400+(row%2)*45,top=-100+row*400;
   const x=Math.max(0,left),y=Math.max(0,top),w=Math.min(1080,left+size)-x,h=Math.min(1080,top+size)-y;
   layers.push({input:await sharp(rgba,{raw:{width:size,height:size,channels:4}}).extract({left:x-left,top:y-top,width:w,height:h}).png().toBuffer(),left:x,top:y});
  }
  return sharp({create:{width:1080,height:1080,channels:3,background:"#dedbd1"}}).composite(layers).png().toBuffer();
 })();
 return backdrop;
}

export function wallRecoveryPlan(width,height,captionHeight,detection){
 if(![width,height,captionHeight].every(Number.isFinite)||width<=0||height<=0||captionHeight<=0||captionHeight>290)throw new Error("Invalid wall layout dimensions");
 const titleScale=Math.min(1008/width,240/height);
 const name={width:Math.max(1,Math.floor(width*titleScale)),height:Math.max(1,Math.floor(height*titleScale)),top:24};
 name.left=Math.round((1080-name.width)/2);
 const top=name.top+name.height+24,captionTop=1030-captionHeight,bottom=captionTop-16;
 let protectedBox={left:0,top:0,right:1080,bottom:1080},wholeMuralProtected=true;
 if(detection?.uncertain===false){
  try{
  const head=pixelBox(detection.head),star=pixelBox(detection.star,16);
  protectedBox={left:Math.min(head.left,star.left),top:Math.min(head.top,star.top),right:Math.max(head.right,star.right),bottom:Math.max(head.bottom,star.bottom)};
  wholeMuralProtected=false;
  }catch{/* Invalid vision bounds: preserve the entire mural instead. */}
 }
 // Scale the head AND star into the safe region, rather than shrinking all the
 // unused wall and shoulders into a small inset. Only outer wall/body may clip.
 const scale=Math.min(1.15,1008/(protectedBox.right-protectedBox.left),(bottom-top)/(protectedBox.bottom-protectedBox.top));
 const size=Math.max(1,Math.floor(1080*scale)),actualScale=size/1080;
 const transform={width:size,height:size,left:Math.round(540-(protectedBox.left+protectedBox.right)/2*actualScale),top:Math.ceil(top-protectedBox.top*actualScale)};
 const protectedRegion={left:Math.floor(transform.left+protectedBox.left*actualScale),top:Math.floor(transform.top+protectedBox.top*actualScale),right:Math.ceil(transform.left+protectedBox.right*actualScale),bottom:Math.ceil(transform.top+protectedBox.bottom*actualScale)};
 if(protectedRegion.top<name.top+name.height+20||protectedRegion.bottom>captionTop-12||protectedRegion.left<0||protectedRegion.right>1080)throw new Error("Unsafe wall layout");
 return {name,transform,protectedRegion,captionTop,wholeMuralProtected};
}

export async function composeWallRecovery(bytes,artwork,captionVariant,detection){
 const name=await sharp(artwork).trim({background:"#00000000",threshold:0}).png().toBuffer({resolveWithObject:true});
 const caption=await captionAsset(captionVariant);
 const plan=wallRecoveryPlan(name.info.width,name.info.height,caption.info.height,detection);
 const t=plan.transform;
 const resized=await sharp(bytes).resize(t.width,t.height).flatten({background:"#ffffff"}).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const channels=resized.info.channels,rgba=Buffer.alloc(t.width*t.height*4);
 for(let y=0;y<t.height;y++)for(let x=0;x<t.width;x++){
  const offset=(y*t.width+x),i=offset*4,j=offset*channels,gx=t.left+x,gy=t.top+y,p=plan.protectedRegion;
  // Retain every protected pixel. Feather only outer wall/body into the wall;
  // no transparent face, hard photo frame, or blurred background portrait copy.
  const protectedPixel=gx>=p.left-8&&gx<=p.right+8&&gy>=p.top-8&&gy<=p.bottom+8;
  const edge=Math.min(x,y,t.width-1-x,t.height-1-y)/96;
  rgba[i]=resized.data[j];rgba[i+1]=resized.data[j+1];rgba[i+2]=resized.data[j+2];rgba[i+3]=protectedPixel?255:Math.round(255*Math.min(1,Math.max(0,edge)));
 }
 const left=Math.max(0,t.left),top=Math.max(0,t.top),right=Math.min(1080,t.left+t.width),bottom=Math.min(1080,t.top+t.height);
 const mural=await sharp(rgba,{raw:{width:t.width,height:t.height,channels:4}}).extract({left:left-t.left,top:top-t.top,width:right-left,height:bottom-top}).png().toBuffer();
 const paint=await sharp(name.data).resize(plan.name.width,plan.name.height).png().toBuffer();
 const result=await sharp(await wallBackdrop()).composite([{input:mural,left,top},{input:paint,left:plan.name.left,top:plan.name.top}]).png().toBuffer();
 return {bytes:result,placement:{...plan.name,source:"prebuilt-wall-reflow",protectedRegion:plan.protectedRegion,transform:t,captionTop:plan.captionTop,wholeMuralProtected:plan.wholeMuralProtected},detection:detection||null,recovered:true};
}
