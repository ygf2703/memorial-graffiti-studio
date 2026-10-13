import { getStore } from "@netlify/blobs";
import { authorize, json, validId } from "../../server/core.mjs";
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
    const stream = await store.get(`${id}/result`, { type: "stream" });
    return new Response(stream, { headers: { "content-type": "image/jpeg", "cache-control": "no-store" } });
  }
  if (["queued", "processing"].includes(job.status) && Date.now() - job.createdAt > 15 * 60 * 1000) return json({ ...job, status: "failed", error: "זמן העיבוד הסתיים ללא תוצאה. אין ניסיון חוזר אוטומטי." });
  return json(job);
};
