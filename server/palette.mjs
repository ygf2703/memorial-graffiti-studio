import sharp from "sharp";

export const PALETTE_VERSION=1;
export const paletteInstruction="STRICT PALETTE, overriding all reference colours: ONLY yellow, blue and white, including their shades. White or pale blue plaster, NEVER beige, cream, brown, grey, green, red, orange or natural skin colours. Portrait, clothing, name and slogan must use yellow/blue/white; use deep BLUE/navy rather than black for shadows and outlines. Black is permitted ONLY for background doodles and decorations, never on the person or lettering. Preserve likeness, geometry and expression, not the photograph's colours.";

// All output pixels belong to these blue / yellow / white ramps. No dithering,
// spatial filtering, resizing or geometry changes: lettering edges stay put.
const ramp=(a,b,steps)=>Array.from({length:steps},(_,i)=>a.map((v,c)=>Math.round(v+(b[c]-v)*i/(steps-1))));
export const approvedPalette=Object.freeze([
 ...ramp([6,27,65],[15,92,175],16),
 ...ramp([15,92,175],[40,163,232],16),
 ...ramp([40,163,232],[255,255,255],24),
 ...ramp([6,27,65],[255,255,255],40),
 ...ramp([225,190,0],[255,220,0],12),
 ...ramp([255,220,0],[255,255,255],20),
].map(rgb=>Object.freeze(rgb)));

function lab([r,g,b]){
 const linear=v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4;
 r=linear(r);g=linear(g);b=linear(b);
 const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
 const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
 const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
 return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
const paletteLab=approvedPalette.map(lab);

export function validatePaletteVersion(version){
 if(version!==undefined&&version!==PALETTE_VERSION)throw new Error("Unsupported palette version");
}

export async function enforcePalette(bytes,version){
 validatePaletteVersion(version);
 if(version===undefined)return bytes; // Historical output remains byte-for-byte unchanged.
 const {data,info}=await sharp(bytes).flatten({background:"#ffffff"}).toColourspace("srgb").removeAlpha().raw().toBuffer({resolveWithObject:true});
 const cache=new Map();
 for(let p=0;p<data.length;p+=3){
  const key=(data[p]<<16)|(data[p+1]<<8)|data[p+2];
  let rgb=cache.get(key);
  if(!rgb){
   const colour=lab([data[p],data[p+1],data[p+2]]);
   let best=Infinity,index=0;
   for(let i=0;i<paletteLab.length;i++){
    const candidate=paletteLab[i];
    const distance=(colour[0]-candidate[0])**2+(colour[1]-candidate[1])**2+(colour[2]-candidate[2])**2;
    if(distance<best){best=distance;index=i;}
   }
   rgb=approvedPalette[index];cache.set(key,rgb);
  }
  data[p]=rgb[0];data[p+1]=rgb[1];data[p+2]=rgb[2];
 }
 // No reliable background-doodle mask exists: black is conservatively mapped
 // to navy everywhere, rather than accidentally allowing it on faces or text.
 return sharp(data,{raw:{width:info.width,height:info.height,channels:3}}).png().toBuffer();
}
