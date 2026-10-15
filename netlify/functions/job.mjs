import { getStore } from "@netlify/blobs";
import { authorize, json, validId } from "../../server/core.mjs";
import { CAPTION_LAYOUT, deliveredJob } from "../../public/design.js";
import { compositeCaption } from "../../server/composite.mjs";
export default async (request) => {
  if (request.method !== "GET") return json({ error: "הפעולה אינה נתמכת." }, 405);
  const denied = authorize(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams, id = params.get("id");
  if (!validId(id)) return json({ error: "מזהה בקשה לא תקין." }, 400);
  const store = getStore({ name: "graffiti-jobs", consistency: "strong" });
  const job = await store.get(id, { type: "json" });
  if (!job) return json({ error: "הבקשה לא נמצאה." }, 404);
  if (params.has("image") && job.status === "completed") {
    if (job.layoutVersion === CAPTION_LAYOUT) {
      try {
        const bytes = await store.get(`${id}/result`, { type: "arrayBuffer" });
        if (!bytes) throw new Error("Missing result");
        const png = await compositeCaption(Buffer.from(bytes), job.captionVariant);
        return new Response(png, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
      } catch { return json({ error: "חיבור הכיתוב לתמונה נכשל. שחזרו את התוצאה ללא יצירה נוספת." }, 503); }
    }
    const stream = await store.get(`${id}/result`, { type: "stream" });
    return new Response(stream, { headers: { "content-type": "image/jpeg", "cache-control": "no-store" } });
  }
  if (["queued", "processing"].includes(job.status) && Date.now() - (job.startedAt || job.createdAt) > 15 * 60 * 1000) return json({ ...job, status: "failed", error: "זמן העיבוד הסתיים ללא תוצאה. אין ניסיון חוזר אוטומטי." });
  const correction = !job.parentId ? await store.get(`${id}/correction`, { type: "json" }) : null;
  const correctionReady = correction && await store.get(correction.id, { type: "json" });
  return json({ ...deliveredJob(job), id, correction: correctionReady ? correction : null });
};
