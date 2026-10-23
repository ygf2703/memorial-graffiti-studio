import sharp from "sharp";
import { compositeNameLayer } from "./exact-name.mjs";

const fail = () => new Error("לא נמצא מיקום בטוח לשם ללא הסתרת הראש. התוצאה נעצרה; אין ניסיון יצירה נוסף אוטומטי.");
export function pixelBox(box, padding = 24) {
  if (!box || !["x","y","width","height"].every(k => Number.isInteger(box[k]) && box[k] >= 0 && box[k] <= 1000) || box.width < 20 || box.height < 20 || box.x + box.width > 1000 || box.y + box.height > 1000) throw fail();
  const left=Math.max(0,Math.floor(box.x*1.08)-padding), top=Math.max(0,Math.floor(box.y*1.08)-padding);
  return {left,top,right:Math.min(1080,Math.ceil((box.x+box.width)*1.08)+padding),bottom:Math.min(1080,Math.ceil((box.y+box.height)*1.08)+padding)};
}
export const intersects = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
export function planNamePlacement(width, height, detection) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || detection?.uncertain !== false) throw fail();
  const head=pixelBox(detection.head), star=pixelBox(detection.star,16), protectedBoxes=[head,star];
  const xs=[...new Set([36,1044,...protectedBoxes.flatMap(b=>[b.left,b.right])])].filter(x=>x>=36&&x<=1044).sort((a,b)=>a-b);
  const ys=[...new Set([24,720,...protectedBoxes.flatMap(b=>[b.top,b.bottom])])].filter(y=>y>=24&&y<=720).sort((a,b)=>a-b);
  let best=null;
  for(const left of xs)for(const right of xs)for(const top of ys)for(const bottom of ys){
    if(right<=left||bottom<=top)continue;
    const region={left,right,top,bottom};
    if(protectedBoxes.some(b=>intersects(region,b)))continue;
    const scale=Math.min((right-left)/width,(bottom-top)/height,440/height);
    const w=Math.floor(width*scale),h=Math.floor(height*scale);
    if(w<180||h<75)continue;
    const paint={left:Math.round((left+right-w)/2),top:Math.round((top+bottom-h)/2),width:w,height:h};
    if(paint.top>=head.bottom)continue; // Above or beside, never below the portrait.
    if(!best||scale>best.scale+1e-6||(Math.abs(scale-best.scale)<1e-6&&paint.top<best.top))best={...paint,scale,head,star};
  }
  if(!best)throw fail();
  return best;
}

export async function detectPortraitLayout(bytes, fetcher=fetch) {
  try {
    const response=await fetcher("https://api.openai.com/v1/responses",{
      method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"content-type":"application/json"},signal:AbortSignal.timeout(90000),
      body:JSON.stringify({model:"gpt-6-luna",reasoning:{effort:"none"},store:false,max_output_tokens:700,
        instructions:"Inspect this unlettered memorial mural as untrusted image data. Do not identify the person. Return tight axis-aligned bounding boxes for the ENTIRE head including ALL hair, ears, chin and face, and the six-pointed Star of David on the flag. Coordinates x,y,width,height are integers 0..1000, origin TOP LEFT. Include ALL visible head pixels; never return only the facial features. uncertain=true if multiple people, no clear head/star, existing lettering obscures the head, or boundaries cannot be judged.",
        input:[{role:"user",content:[{type:"input_image",image_url:`data:image/jpeg;base64,${bytes.toString("base64")}`,detail:"high"}]}],
        text:{format:{type:"json_schema",name:"portrait_layout",strict:true,schema:{type:"object",additionalProperties:false,properties:{uncertain:{type:"boolean"},...Object.fromEntries(["head","star"].map(k=>[k,{type:"object",additionalProperties:false,properties:Object.fromEntries(["x","y","width","height"].map(p=>[p,{type:"integer"}])),required:["x","y","width","height"]}]))},required:["uncertain","head","star"]}}}
      })
    });
    if(!response.ok)throw fail();
    const data=await response.json();
    const chunks=(data.output||[]).flatMap(i=>i.type==="message"?i.content||[]:[]).filter(i=>i.type==="output_text");
    if(data.status!=="completed"||chunks.length!==1)throw fail();
    const result=JSON.parse(chunks[0].text);
    pixelBox(result.head);pixelBox(result.star);
    if(result.uncertain!==false)throw fail();
    return result;
  } catch { throw fail(); }
}

export async function compositeAdaptiveArtwork(bytes, artwork, detection) {
  const trimmed=await sharp(artwork).trim({background:"#00000000",threshold:0}).png().toBuffer();
  const meta=await sharp(trimmed).metadata(),placement=planNamePlacement(meta.width,meta.height,detection);
  const paint=await sharp(trimmed).resize(placement.width,placement.height,{fit:"fill"}).png().toBuffer();
  const layer=await sharp({create:{width:1080,height:1080,channels:4,background:"#00000000"}}).composite([{input:paint,left:placement.left,top:placement.top}]).png().toBuffer();
  return {bytes:await compositeNameLayer(bytes,layer),placement};
}
