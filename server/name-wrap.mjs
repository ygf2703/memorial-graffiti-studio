import sharp from "sharp";
import {validName} from "../public/batch.js";
import {graffitiNameLayer} from "./graffiti-name.mjs";

export function nameWrapLines(name) {
  if(!validName(name))throw new Error("Invalid name");
  const words=name.split(" ");
  if(words.length<2||words.some(word=>!word))throw new Error("Name needs a word boundary");
  let best;
  for(let cut=1;cut<words.length;cut++){
    const lines=[words.slice(0,cut).join(" "),words.slice(cut).join(" ")];
    const score=Math.max(...lines.map(s=>Array.from(s).length));
    if(!best||score<best.score)best={lines,score};
  }
  return best.lines;
}

// Deterministic literal glyph fallback; never cut the approved bitmap across letters.
export async function twoLineGraffitiAsset(name, seed, variant=2, visualVersion=0) {
  const lines=nameWrapLines(name),parts=[];
  for(const [i,line] of lines.entries()){
    const layer=await graffitiNameLayer(line,seed+":line:"+i,variant,visualVersion);
    parts.push(await sharp(layer).trim({background:"#00000000",threshold:0})
      .resize({width:1000,height:220,fit:"inside"}).png().toBuffer({resolveWithObject:true}));
  }
  const width=Math.max(...parts.map(p=>p.info.width)),height=parts[0].info.height+parts[1].info.height+18;
  const bytes=await sharp({create:{width,height,channels:4,background:"#00000000"}}).composite(parts.map((p,i)=>({
    input:p.data,left:Math.round((width-p.info.width)/2),top:i?parts[0].info.height+18:0
  }))).png().toBuffer();
  return {bytes,lines};
}
