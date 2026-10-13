import sharp from "sharp";
import { resolve } from "node:path";

export async function compositeCaption(bytes, variant) {
  if (!Number.isInteger(variant) || variant < 1 || variant > 5) throw new Error("Invalid caption variant");
  const caption = await sharp(resolve(`public/captions/caption-${variant}.png`))
    .resize({ width: 972, height: 290, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
  return sharp(bytes).resize(1080, 1080).composite([{
    input: caption.data,
    left: Math.round((1080 - caption.info.width) / 2),
    top: 1030 - caption.info.height,
  }]).png().toBuffer();
}
