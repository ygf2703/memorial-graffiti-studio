import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validName, caption } from "../public/batch.js";

export const MAX_UPLOAD = 3 * 1024 * 1024;
export const validId = (id) => /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id || "");
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
export function configured(env = process.env) { return Boolean(env.OPENAI_API_KEY?.trim() && env.STUDIO_ACCESS_CODE?.trim().length >= 12); }
function equal(a, b) {
  const aa = Buffer.from(a || ""), bb = Buffer.from(b || "");
  return aa.length === bb.length && aa.length > 0 && timingSafeEqual(aa, bb);
}
export function authorize(request, env = process.env) {
  if (!configured(env)) return json({ error: "היצירה עדיין לא פעילה: יש להגדיר מפתח OpenAI וקוד כניסה לסטודיו בשרת." }, 503);
  if (!equal(request.headers.get("authorization"), `Bearer ${env.STUDIO_ACCESS_CODE}`)) return json({ error: "קוד הכניסה לסטודיו חסר או שגוי." }, 401);
  return null;
}
export const workerToken = (id) => createHmac("sha256", process.env.STUDIO_ACCESS_CODE).update(id).digest("hex");
export const validWorker = (id, token) => Boolean(process.env.STUDIO_ACCESS_CODE) && equal(workerToken(id), token);
export async function parsePortrait(request) {
  if (Number(request.headers.get("content-length")) > MAX_UPLOAD + 16384) throw new Error("התמונה גדולה מדי לשליחה.");
  const form = await request.formData();
  const portrait = form.get("image"), name = String(form.get("name") || "").normalize("NFC"), id = String(form.get("id") || "");
  if (!validId(id) || !validName(name)) throw new Error("שם או מזהה בקשה לא תקינים.");
  if (!(portrait instanceof File) || !portrait.size || portrait.size > MAX_UPLOAD) throw new Error("התמונה גדולה מדי או ריקה.");
  const bytes = Buffer.from(await portrait.arrayBuffer());
  const actualType = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" :
    bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg" :
    bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
  if (!actualType || actualType !== portrait.type) throw new Error("הקובץ אינו תמונת JPG, PNG או WEBP תקינה.");
  return { id, name, bytes, type: actualType };
}
export async function generateImage(portrait, name, fetcher = fetch) {
  const form = new FormData();
  form.append("model", "gpt-image-1.5");
  form.append("size", "1024x1024");
  form.append("quality", "high");
  form.append("input_fidelity", "high");
  form.append("output_format", "jpeg");
  form.append("output_compression", "90");
  form.append("image[]", new Blob([portrait.bytes], { type: portrait.type }), "portrait");
  for (const filename of ["style-01.png", "style-02.png", "style-03.png"]) {
    const bytes = await readFile(resolve("netlify/functions/references", filename));
    form.append("image[]", new Blob([bytes], { type: "image/png" }), filename);
  }
  form.append("prompt", `Create ONE square memorial graffiti mural matching the three STYLE reference images, using ONLY the FIRST photo as the portrait identity. Reference portraits, their names and their personal details must NOT be copied. Make the face visibly hand-painted stencil street art: broad simplified blue/yellow/off-white colour planes, heavy navy contours, limited shading, no photographic skin detail, pores or glossy airbrush. Preserve recognizability, expression, hair and glasses from the source. Weathered peeling beige concrete wall, integrated distressed Israeli flag, spray paint, drips and restrained street tags. Paint the exact Hebrew name ${JSON.stringify(name)} as large dimensional graffiti letters with navy outlines and blue/yellow/white fill. Also paint the mandatory phrase ${JSON.stringify(caption)} ONCE, fully legible in Hebrew, as an integral part of the mural. The phrase consists of these words in RTL reading order: אחים | ואחיות | לסמל | לא | שוכחים. Allocate sufficient space for ALL words, no omissions or repetitions. Name can be at top, caption at bottom or beside the portrait. No blank text bands. Keep all text inside a safe 5% margin. Do not add extra people, unverified uniforms, unit insignia, logos, dates, English slogans or biographies. The final must look like a photographed real graffiti wall with an ILLUSTRATED portrait.`);
  let response;
  try {
    response = await fetcher("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(12 * 60 * 1000) });
  } catch { throw new Error("החיבור לשירות התמונות נקטע או חרג מזמן ההמתנה. אין ניסיון חוזר אוטומטי; בדקו לפני יצירה מחדש."); }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.data?.[0]?.b64_json) {
    const code = payload?.error?.code;
    if (response.status === 401) throw new Error("מפתח OpenAI אינו תקף. יש לעדכן אותו בהגדרות השרת.");
    if (code === "insufficient_quota") throw new Error("אין יתרה זמינה בחשבון OpenAI API. יש לבדוק את החיוב בחשבון.");
    if (response.status === 429) throw new Error("שירות OpenAI הגיע למגבלת שימוש. נסו שוב מאוחר יותר.");
    if (response.status === 403) throw new Error("לחשבון OpenAI אין כרגע הרשאה למודל התמונות. בדקו את הרשאות החשבון והאימות.");
    if (code === "moderation_blocked") throw new Error("שירות התמונות לא אישר את הבקשה הזו.");
    throw new Error(`שירות התמונות לא החזיר תמונה תקינה (קוד ${response.status}).`);
  }
  return payload.data[0].b64_json;
}
