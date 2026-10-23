import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validName } from "../public/batch.js";
import { muralPrompt, likenessInstruction } from "./prompt.mjs";
import { materialSwatch } from "./paint-surface.mjs";
import { correctionInstruction } from "./correction.mjs";

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
  const portrait = form.get("image"), name = String(form.get("name") || ""), id = String(form.get("id") || "");
  if (!validId(id) || !validName(name)) throw new Error("שם או מזהה בקשה לא תקינים.");
  if (!(portrait instanceof File) || !portrait.size || portrait.size > MAX_UPLOAD) throw new Error("התמונה גדולה מדי או ריקה.");
  const bytes = Buffer.from(await portrait.arrayBuffer());
  const actualType = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" :
    bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg" :
    bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
  if (!actualType || actualType !== portrait.type) throw new Error("הקובץ אינו תמונת JPG, PNG או WEBP תקינה.");
  return { id, name, bytes, type: actualType };
}
export async function generateImage(portrait, name, fetcher = fetch, designSeed = randomUUID(), fixedCaption = false, correction = null, exactName = false, largeName = false, adaptiveName = false, visualVersion = 0, timeoutMs = 12 * 60 * 1000) {
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
    form.append("image[]", new Blob([visualVersion===1?await materialSwatch(bytes):bytes], { type: "image/png" }), filename);
  }
  if (adaptiveName === 2) {
    const layout = await readFile(resolve("netlify/functions/references/layout-vivid.png"));
    form.append("image[]", new Blob([visualVersion===1?await materialSwatch(layout):layout], { type: "image/png" }), "approved-composition.png");
  }
  if (correction) form.append("image[]", new Blob([correction.bytes], { type: "image/jpeg" }), "rejected-mural.jpg");
  let prompt=muralPrompt(designSeed, name, fixedCaption, exactName, largeName, adaptiveName);
  if(visualVersion===1)prompt=prompt.replace("Image 5 is the approved COMPOSITION AND COLOR reference, overriding composition of images 2-4. Follow its large head on one outer side and large two-line lettering area on the opposite side.","Follow the written side layout; all secondary images are paint material swatches only.");
  form.append("prompt", prompt + (correction ? correctionInstruction(correction.reason, name, exactName, largeName, adaptiveName) : "") + (visualVersion===1?likenessInstruction:""));
  return requestImageEdit(form, fetcher, timeoutMs);
}

export async function requestImageEdit(form, fetcher = fetch, timeoutMs = 12 * 60 * 1000) {
  let response;
  try {
    response = await fetcher("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(timeoutMs) });
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
