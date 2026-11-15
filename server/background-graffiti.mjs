import sharp from "sharp";
import {pixelBox} from "./name-placement.mjs";
import {seededRandom} from "../public/design.js";
import {validateWallPaintVersion} from './wall-paint.mjs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

async function richPaintLayer(seed){
 const stamp=await readFile(resolve('netlify/functions/references/rich-spray-brush.png'));
 const random=seededRandom(`rich-wall-paint:${seed}`),overlays=[];
 const positions=[[120,190],[960,190],[540,85],[60,520],[1020,600],[random()<.5?30:1050,950]];
 for(const [cx,cy] of positions){
  const image=await sharp(stamp).resize({width:520+Math.floor(random()*260)}).flop(random()<.5).rotate((random()-.5)*70,{background:'#00000000'}).png().toBuffer({resolveWithObject:true});
  const left=Math.round(cx+(random()-.5)*90-image.info.width/2),top=Math.round(cy+(random()-.5)*90-image.info.height/2);
  const x=Math.max(0,-left),y=Math.max(0,-top),width=Math.min(image.info.width-x,1080-Math.max(0,left)),height=Math.min(image.info.height-y,1080-Math.max(0,top));
  if(width<=0||height<=0)continue;
  overlays.push({input:await sharp(image.data).extract({left:x,top:y,width,height}).png().toBuffer(),left:Math.max(0,left),top:Math.max(0,top)});
 }
 return sharp({create:{width:1080,height:1080,channels:4,background:'#00000000'}}).composite(overlays).ensureAlpha().raw().toBuffer();
}

// Add brush/spray only to light neutral wall pixels. Preserve head, body and
// complete flag. Historical editions also preserve the entire flag-side half.
export async function backgroundGraffiti(bytes,detection,seed="",wallPaintVersion){
 validateWallPaintVersion(wallPaintVersion);
 if(detection?.uncertain!==false)return bytes;
 let head,star,flag;
 try{head=pixelBox(detection.head,32);star=pixelBox(detection.star,16);flag=pixelBox(detection.flag,32);}catch{return bytes;}
 const flagRight=(star.left+star.right)>(head.left+head.right);
 const random=seededRandom(`wall-accents:${seed}`),marks=[];
 const colours=["#e1be00","#ffdc00","#fff06a","#fff8b9","#168dcc"];
 for(let n=0;n<(wallPaintVersion===1?0:9);n++){
  const x=flagRight?15+random()*260:805+random()*260,y=25+random()*1000;
  const colour=colours[n%colours.length],dx=(random()-.5)*160,dy=(random()-.5)*140;
  marks.push(`<path d="M${x} ${y} c${dx*.3} ${dy*.1-20} ${dx*.7} ${dy*.7} ${dx} ${dy}" fill="none" stroke="${colour}" stroke-width="${18+random()*35}" opacity=".65"/>`);
  for(let s=0;s<18;s++)marks.push(`<circle cx="${x+(random()-.5)*180}" cy="${y+(random()-.5)*150}" r="${1+random()*5}" fill="${colour}" opacity="${.25+random()*.5}"/>`);
 }
 const layer=wallPaintVersion===1?await richPaintLayer(seed):await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">${marks.join("")}</svg>`)).ensureAlpha().raw().toBuffer();
 const {data,info}=await sharp(bytes).toColourspace("srgb").removeAlpha().raw().toBuffer({resolveWithObject:true});
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const p=y*info.width+x,i=p*3,a=p*4+3;
  const inHead=x>=head.left&&x<=head.right&&y>=head.top&&y<=head.bottom;
  const inFlagHalf=flagRight?x>=540:x<540;
  const inFlag=x>=flag.left&&x<=flag.right&&y>=flag.top&&y<=flag.bottom;
  const bodySpread=Math.max(0,y-head.bottom+30)*.8;
  const inBody=y>head.bottom-30&&x>=head.left-110-bodySpread&&x<=head.right+110+bodySpread;
  const max=Math.max(data[i],data[i+1],data[i+2]),min=Math.min(data[i],data[i+1],data[i+2]);
  if(inHead||inBody||inFlag||(wallPaintVersion!==1&&inFlagHalf)||min<110||max-min>45)layer[a]=0;
  else if(wallPaintVersion===1){
   // Feather OUTSIDE the protected rectangles; their pixels stay unchanged.
   // This avoids a rectangular paint cutout around the person or the flag.
   const distance=box=>Math.hypot(Math.max(box.left-x,0,x-box.right),Math.max(box.top-y,0,y-box.bottom));
   const feather=Math.min(1,distance(head)/65,distance(flag)/40);
   layer[a]=Math.round(layer[a]*.78*feather);
  }
 }
 return sharp(bytes).composite([{input:layer,raw:{width:1080,height:1080,channels:4},left:0,top:0}]).png().toBuffer();
}
