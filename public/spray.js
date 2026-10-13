import { caption, validName } from "./batch.js";
import { fitText, captionLines } from "./poster.js";
import { muralDesign, seededRandom } from "./design.js";

let fontReady;
async function loadSprayFont() {
  fontReady ??= new FontFace("StreetLetters", "url(/fonts/Karantina-Bold.ttf)", { weight: "700" }).load().then((font) => document.fonts.add(font)).catch(() => {
    fontReady = undefined;
    throw new Error("פונט הגרפיטי לא נטען. אפשר לשחזר את התוצאה ללא יצירה נוספת.");
  });
  await fontReady;
}

function sprayLine(canvas, image, text, y, height, width, random, design, headline) {
  const layer = document.createElement("canvas"); layer.width = layer.height = 1080;
  const ctx = layer.getContext("2d");
  ctx.direction = "rtl"; ctx.textAlign = "center"; ctx.lineJoin = "miter"; ctx.miterLimit = 2;
  const size = fitText(text, (value, pixels) => {
    ctx.font = `700 ${pixels}px StreetLetters`;
    const m = ctx.measureText(value);
    return { width: Math.max(m.width, m.actualBoundingBoxLeft + m.actualBoundingBoxRight), height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent };
  }, headline ? 240 : 135, width, height);
  ctx.font = `700 ${size}px StreetLetters`;
  const metrics = ctx.measureText(text);
  const baseline = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
  const scale = Math.min(1.8, width / Math.max(metrics.width, 1));
  ctx.save(); ctx.translate(540, y); ctx.rotate(headline ? design.rotation : -design.rotation / 2);
  ctx.transform(scale, 0, design.slant, 1, 0, 0);
  ctx.strokeStyle = "#e6c62e"; ctx.lineWidth = headline ? 19 : 12; ctx.strokeText(text, 0, baseline);
  ctx.strokeStyle = "#082e49"; ctx.lineWidth = headline ? 11 : 7;
  for (let depth = headline ? 12 : 6; depth >= 0; depth--) ctx.strokeText(text, depth * .4, baseline + depth);
  ctx.fillStyle = "#f5f1da"; ctx.fillText(text, 0, baseline);
  // Hard-edged two-colour fill instead of a glossy, smooth gradient.
  ctx.save(); ctx.beginPath(); ctx.rect(-1080, 12, 2160, 250); ctx.clip();
  ctx.fillStyle = "#207ba6"; ctx.fillText(text, 0, baseline); ctx.restore(); ctx.restore();

  const mask = ctx.getImageData(0, 0, 1080, 1080).data;
  const alpha = (x, py) => x >= 0 && x < 1080 && py >= 0 && py < 1080 ? mask[(Math.floor(py) * 1080 + Math.floor(x)) * 4 + 3] : 0;
  // Spray grains outside the real glyph silhouette, never replacing its shape.
  const target = canvas.getContext("2d"); target.save(); target.fillStyle = "#082e49";
  for (let i = 0; i < 6500; i++) {
    const x = 45 + random() * 990, py = y - height / 2 - 25 + random() * (height + 65);
    if (alpha(x, py) || !alpha(x + (random() - .5) * 22, py + (random() - .5) * 22)) continue;
    target.globalAlpha = .08 + random() * .3;
    target.fillRect(x, py, .6 + random() * 1.4, .6 + random() * 1.4);
  }
  target.restore();
  // Small wear marks are clipped to painted pixels. Full letter skeletons stay legible.
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 2200; i++) {
    ctx.globalAlpha = .1 + random() * .22;
    ctx.fillRect(45 + random() * 990, y - height / 2 + random() * height, .4 + random() * 1.8, .4 + random() * 2);
  }
  ctx.globalCompositeOperation = "source-atop"; ctx.globalAlpha = .14;
  ctx.drawImage(image, 0, 0, 1080, 1080);
  ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = .8; ctx.strokeStyle = "#082e49"; ctx.lineCap = "round";
  // Drips start on the bottom of actual letter strokes, not an arbitrary text box.
  for (let i = 0; i < (headline ? 15 : 7); i++) {
    const x = Math.floor(100 + random() * 880);
    for (let py = Math.min(1040, Math.floor(y + height / 2 + 22)); py > y - height / 2; py--) {
      if (alpha(x, py) < 180) continue;
      ctx.lineWidth = 1.4 + random() * 2.7;
      ctx.beginPath(); ctx.moveTo(x, py - 3); ctx.lineTo(x + random() * 2, Math.min(1050, py + 8 + random() * (headline ? 40 : 18))); ctx.stroke(); break;
    }
  }
  target.drawImage(layer, 0, 0);
}

export async function paintSprayText(canvas, image, name, seed) {
  if (!validName(name) || captionLines.join(" ") !== caption) throw new Error("לא ניתן לאמת את הכיתוב לפוסטר.");
  await loadSprayFont();
  const random = seededRandom(seed), design = muralDesign(seed);
  sprayLine(canvas, image, name, 140, 155, 850, random, design, true);
  sprayLine(canvas, image, captionLines[0], 902, 72, 825, random, design, false);
  sprayLine(canvas, image, captionLines[1], 995, 70, 580, random, design, false);
}
