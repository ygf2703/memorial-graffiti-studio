import sharp from "sharp";
import { seededRandom } from "../public/design.js";

// Bounded continuous displacement: no glyph splitting, reordering or erased strokes.
export async function weatherPaint(bytes, seed, amplitude = 1.2) {
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const out=Buffer.alloc(data.length), random=seededRandom("wall-paint:"+seed), phase=random()*Math.PI*2;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const sx=x+amplitude*Math.sin(y/23+phase), sy=y+amplitude*(Math.sin(x/43+phase)+.35*Math.sin(x/13));
    const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,offset=(y*info.width+x)*4;
    // Premultiplied interpolation avoids dark fringes on transparent paint edges.
    let alpha=0;const colour=[0,0,0];
    for(const [dx,dy,w] of [[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]){
      if(ix+dx<0||iy+dy<0||ix+dx>=info.width||iy+dy>=info.height)continue;
      const at=((iy+dy)*info.width+ix+dx)*4,a=data[at+3]*w;alpha+=a;
      for(let c=0;c<3;c++)colour[c]+=data[at+c]*a;
    }
    if(!alpha)continue;
    const grain=random(), coverage=.88+.12*grain, tone=.96+.04*Math.sin(x/9+y/17+phase);
    for(let c=0;c<3;c++)out[offset+c]=Math.round(colour[c]/alpha*tone);
    out[offset+3]=Math.round(alpha*coverage);
  }
  return sharp(out,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}

// Only wall/lettering margins, never the other people's portraits.
export async function materialSwatch(bytes) {
  const {width,height}=await sharp(bytes).metadata();
  const top=Math.floor(height*.1),side=Math.floor(width*.1);
  const upper=await sharp(bytes).extract({left:0,top:0,width,height:top}).resize(640,64).png().toBuffer();
  const left=await sharp(bytes).extract({left:0,top:top,width:side,height:height-top}).resize(64,576).png().toBuffer();
  return sharp({create:{width:640,height:640,channels:3,background:"#d9cbb3"}})
    .composite([{input:upper,left:0,top:0},{input:left,left:0,top:64}]).png().toBuffer();
}
