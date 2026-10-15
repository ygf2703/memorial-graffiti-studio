import { getStore } from "@netlify/blobs";
import { authorize, json, parsePortrait, workerToken, validId } from "../../server/core.mjs";
import { queueCorrection, correctionReasons } from "../../server/correction.mjs";

export default async (request) => {
  if (request.method !== "POST") return json({ error: "הפעולה אינה נתמכת." }, 405);
  const denied = authorize(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams, reason = params.get("reason"), resume = params.get("resume");
  if (resume ? !validId(resume) : !correctionReasons.includes(reason)) return json({ error: "פרטי התיקון אינם תקינים." }, 400);
  let input;
  if (!resume) {
    try { input = await parsePortrait(request); } catch (error) { return json({ error: error.message }, 400); }
  }
  const base = process.env.NETLIFY_DEV === "true" ? new URL(request.url).origin : process.env.STUDIO_SITE_URL;
  if (!base) return json({ error: "כתובת שירות הרקע לא הוגדרה בשרת." }, 503);
  const store = getStore({ name: "graffiti-jobs", consistency: "strong" });
  let queued;
  try {
    if (resume) {
      const claim = await store.get(`${resume}/correction`, { type: "json" });
      const child = claim && await store.get(claim.id, { type: "json" });
      if (!child) throw new Error("Missing correction");
      queued = { id: claim.id, status: child.status };
    } else queued = await queueCorrection(store, input.id, input, reason);
  }
  catch { return json({ error: "לא ניתן לפתוח תיקון: בדקו שהתוצאה הושלמה, השם זהה ולא מדובר בתוצאה שכבר תוקנה." }, 409); }
  try {
    if (queued.status === "queued") {
      const response = await fetch(new URL("/.netlify/functions/render-background", base), {
        method: "POST", headers: { "content-type": "application/json", "x-worker-token": workerToken(queued.id) },
        body: JSON.stringify({ id: queued.id }), signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Worker not accepted");
    }
    return json({ id: queued.id }, 202);
  } catch { return json({ error: "שליחת התיקון לא אושרה. שחזרו תוצאות או שלחו שוב את אותה בקשת תיקון; לא ייווצר ניסיון נוסף." }, 503); }
};
