import { caption, validName } from "./batch.js";

export const POSTER_LAYOUT = "exact-text-v1";
export const captionLines = ["אחים ואחיות לסמל", "לא שוכחים"];

// Shrink the font, never truncate, rewrite or reverse the supplied string.
export function fitText(text, measure, maxSize, maxWidth, maxHeight) {
  for (let size = maxSize; size >= 12; size--) {
    const metrics = measure(text, size);
    if (metrics.width <= maxWidth && metrics.height <= maxHeight) return size;
  }
  throw new Error("השם ארוך מדי לפריסה קריאה. לא בוצע קיצור אוטומטי.");
}

let fontsReady;
async function loadFonts() {
  fontsReady ??= Promise.all([
    new FontFace("MuralName", "url(/fonts/RubikSprayPaint-Regular.ttf)"),
    new FontFace("MuralCaption", "url(/fonts/Rubik-Variable.ttf)", { weight: "300 900" }),
  ].map(async (font) => { document.fonts.add(await font.load()); })).catch(() => {
    fontsReady = undefined;
    throw new Error("פונט הגרפיטי לא נטען. נסו לשחזר את התוצאה; אין צורך ליצור מחדש.");
  });
  await fontsReady;
}

function paintLine(canvas, image, text, centerY, maxSize, maxHeight, isName) {
  const layer = document.createElement("canvas");
  layer.width = layer.height = 1080;
  const ctx = layer.getContext("2d");
  ctx.direction = "rtl"; ctx.textAlign = "center"; ctx.lineJoin = "round";
  const family = isName ? "MuralName" : "MuralCaption";
  const font = (size) => `${isName ? 400 : 900} ${size}px ${family}`;
  const size = fitText(text, (value, pixels) => {
    ctx.font = font(pixels);
    const m = ctx.measureText(value);
    return { width: Math.max(m.width, m.actualBoundingBoxLeft + m.actualBoundingBoxRight), height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent };
  }, maxSize, 940, maxHeight);
  ctx.font = font(size);
  const m = ctx.measureText(text);
  const y = centerY + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  // Layered outlines and offset extrusion keep real, correctly shaped Hebrew glyphs.
  ctx.strokeStyle = "#dfbd36"; ctx.lineWidth = isName ? 22 : 13;
  ctx.strokeText(text, 540, y);
  ctx.strokeStyle = "#071f34"; ctx.lineWidth = isName ? 14 : 8;
  for (let offset = isName ? 12 : 5; offset >= 0; offset--) ctx.strokeText(text, 540 + offset * .35, y + offset);
  const fill = ctx.createLinearGradient(0, centerY - size / 2, 0, centerY + size / 2);
  fill.addColorStop(0, "#fcf7df"); fill.addColorStop(.4, "#faf5dc");
  fill.addColorStop(.68, "#e4c94c"); fill.addColorStop(1, "#3989a8");
  ctx.fillStyle = fill; ctx.fillText(text, 540, y);
  // Sample the actual mural texture into the paint; the wall remains visible between glyphs.
  ctx.globalCompositeOperation = "source-atop"; ctx.globalAlpha = .19;
  ctx.drawImage(image, 0, 0, 1080, 1080);
  ctx.globalAlpha = 1;
  canvas.getContext("2d").drawImage(layer, 0, 0);
}

export async function paintExactText(canvas, image, name) {
  if (!validName(name) || captionLines.join(" ") !== caption) throw new Error("לא ניתן לאמת את הכיתוב לפוסטר.");
  await loadFonts();
  paintLine(canvas, image, name, 145, 176, 150, true);
  paintLine(canvas, image, captionLines[0], 905, 86, 76, false);
  paintLine(canvas, image, captionLines[1], 995, 94, 76, false);
}
