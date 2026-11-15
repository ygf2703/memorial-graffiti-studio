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
