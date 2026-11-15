import sharp from "sharp";
import {pixelBox} from "./name-placement.mjs";

const tones=[[6,27,65],[7,74,115],[22,141,204],[225,190,0],[255,220,0],[255,240,106],[255,248,185],[255,255,255]];

// Local mural finishing, before catalogue lettering. Keep geometry and wall
// pixels; simplify photographic shading into blue and four yellow paint tones.
export async function stencilPortrait(bytes,detection){
 if(detection?.uncertain!==false)return bytes;
 let box;
 try{box=pixelBox(detection.head,0);}catch{return bytes;}
 const region={left:box.left,top:box.top,width:box.right-box.left,height:box.bottom-box.top};
 const {data,info}=await sharp(bytes).toColourspace("srgb").removeAlpha().raw().toBuffer({resolveWithObject:true});
 const clean=await sharp(bytes).extract(region).median(3).toColourspace("srgb").removeAlpha().raw().toBuffer();
 const out=Buffer.from(data),cx=(region.width-1)/2,cy=(region.height-1)/2;
 for(let y=0;y<region.height;y++)for(let x=0;x<region.width;x++){
  const j=(y*region.width+x)*3,r=clean[j],g=clean[j+1],b=clean[j+2];
  const light=(.2126*r+.7152*g+.0722*b)/255;
  const tone=tones[light<.17?0:light<.33?1:light<.48?2:light<.56?3:light<.66?4:light<.77?5:light<.88?6:7];
  const radius=Math.hypot((x-cx)/(region.width/2),(y-cy)/(region.height/2));
  const alpha=Math.max(0,Math.min(1,(1.08-radius)/.18));
  const i=((region.top+y)*info.width+region.left+x)*3;
  for(let c=0;c<3;c++)out[i+c]=Math.round(data[i+c]*(1-alpha)+tone[c]*alpha);
 }
 return sharp(out,{raw:{width:info.width,height:info.height,channels:3}}).png().toBuffer();
}

// Stronger graphic edition: suppress fine texture before separating paint
// planes. Work at the original coordinates; never warp or resize features.
// The whole flag and outer wall are excluded from this finish.
export async function graphicPortrait(bytes,detection){
 if(detection?.uncertain!==false)return bytes;
 let head,flag;
 try{head=pixelBox(detection.head,0);flag=pixelBox(detection.flag,16);}catch{return bytes;}
 const region={left:head.left,top:head.top,width:head.right-head.left,height:head.bottom-head.top};
 const {data,info}=await sharp(bytes).toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});
 const clean=await sharp(bytes).extract(region).median(5).blur(1.1).toColourspace('srgb').removeAlpha().raw().toBuffer();
 const paintTones=[[6,27,65],[7,74,115],[22,141,204],[255,220,0],[255,240,106],[255,255,255]];
 const out=Buffer.from(data),cx=(region.width-1)/2,cy=(region.height-1)/2;
 for(let y=0;y<region.height;y++)for(let x=0;x<region.width;x++){
  const px=region.left+x,py=region.top+y;
  if(px>=flag.left&&px<flag.right&&py>=flag.top&&py<flag.bottom)continue;
  const i=(py*info.width+px)*3,j=(y*region.width+x)*3;
  const light=(.2126*clean[j]+.7152*clean[j+1]+.0722*clean[j+2])/255;
  let tone=paintTones[light<.22?0:light<.42?1:light<.60?2:light<.73?3:light<.87?4:5];
  // Preserve original dark eye, nose and mouth contours that smoothing might
  // otherwise merge. Fine light texture is intentionally not restored.
  const originalLight=(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])/255;
  if(originalLight<.19&&light-originalLight>.09)tone=paintTones[0];
  const radius=Math.hypot((x-cx)/(region.width/2),(y-cy)/(region.height/2));
  const alpha=Math.max(0,Math.min(1,(1.08-radius)/.14));
  for(let c=0;c<3;c++)out[i+c]=Math.round(data[i+c]*(1-alpha)+tone[c]*alpha);
 }
 return sharp(out,{raw:{width:info.width,height:info.height,channels:3}}).png().toBuffer();
}
