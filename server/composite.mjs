import sharp from "sharp";
import { resolve } from "node:path";
import { CAPTION_STYLE_COUNT } from "../public/design.js";

export async function captionAsset(variant,maximumHeight=290) {
  if (!Number.isInteger(variant) || variant < 1 || variant > CAPTION_STYLE_COUNT) throw new Error("Invalid caption variant");
  if(![220,290].includes(maximumHeight))throw new Error("Invalid caption height");
  return sharp(resolve(`public/captions/caption-${variant}.png`))
    .resize({ width: 972, height: maximumHeight, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
}

export async function compositeCaption(bytes, variant,maximumHeight=290) {
  const caption = await captionAsset(variant,maximumHeight);
  return sharp(bytes).resize(1080, 1080).composite([{
    input: caption.data,
    left: Math.round((1080 - caption.info.width) / 2),
    top: 1030 - caption.info.height,
  }]).png().toBuffer();
}
