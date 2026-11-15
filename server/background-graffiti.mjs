import sharp from "sharp";
import {pixelBox} from "./name-placement.mjs";
import {seededRandom} from "../public/design.js";

// Add modest brush/spray accents only to light, neutral wall pixels. Keep the
// entire head and the flag's half of the image untouched, including white flag.
export async function backgroundGraffiti(bytes,detection,seed=""){
 if(detection?.uncertain!==false)return bytes;
 let head,star,flag;
 try{head=pixelBox(detection.head,32);star=pixelBox(detection.star,16);flag=pixelBox(detection.flag,32);}catch{return bytes;}
 const flagRight=(star.left+star.right)>(head.left+head.right);
 const random=seededRandom(`wall-accents:${seed}`),marks=[];
 const colours=["#e1be00","#ffdc00","#fff06a","#fff8b9","#168dcc"];
 for(let n=0;n<9;n++){
  const x=flagRight?15+random()*260:805+random()*260,y=25+random()*1000;
  const colour=colours[n%colours.length],dx=(random()-.5)*160,dy=(random()-.5)*140;
  marks.push(`<path d="M${x} ${y} c${dx*.3} ${dy*.1-20} ${dx*.7} ${dy*.7} ${dx} ${dy}" fill="none" stroke="${colour}" stroke-width="${18+random()*35}" opacity=".65"/>`);
  for(let s=0;s<18;s++)marks.push(`<circle cx="${x+(random()-.5)*180}" cy="${y+(random()-.5)*150}" r="${1+random()*5}" fill="${colour}" opacity="${.25+random()*.5}"/>`);
 }
 const layer=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">${marks.join("")}</svg>`)).ensureAlpha().raw().toBuffer();
 const {data,info}=await sharp(bytes).toColourspace("srgb").removeAlpha().raw().toBuffer({resolveWithObject:true});
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const p=y*info.width+x,i=p*3,a=p*4+3;
  const inHead=x>=head.left&&x<=head.right&&y>=head.top&&y<=head.bottom;
  const inFlagHalf=flagRight?x>=540:x<540;
  const inFlag=x>=flag.left&&x<=flag.right&&y>=flag.top&&y<=flag.bottom;
  const bodySpread=Math.max(0,y-head.bottom+30)*.8;
  const inBody=y>head.bottom-30&&x>=head.left-110-bodySpread&&x<=head.right+110+bodySpread;
  const max=Math.max(data[i],data[i+1],data[i+2]),min=Math.min(data[i],data[i+1],data[i+2]);
  if(inHead||inBody||inFlag||inFlagHalf||min<110||max-min>45)layer[a]=0;
 }
 return sharp(bytes).composite([{input:layer,raw:{width:1080,height:1080,channels:4},left:0,top:0}]).png().toBuffer();
}
