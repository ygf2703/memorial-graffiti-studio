export async function paintFixedCaption(canvas, variant) {
  if (!Number.isInteger(variant) || variant < 1 || variant > 5) throw new Error("גרסת הכיתוב אינה תקינה.");
  const image = new Image();
  image.src = `/captions/caption-${variant}.png`;
  try { await image.decode(); } catch { throw new Error("הכיתוב הקבוע לא נטען. שחזרו את התוצאה ללא יצירה נוספת."); }
  const width = Math.min(972, 290 * image.naturalWidth / image.naturalHeight);
  const height = width * image.naturalHeight / image.naturalWidth;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.globalAlpha = .97;
  ctx.drawImage(image, (1080 - width) / 2, 1030 - height, width, height);
  ctx.restore();
}
