import { getStore } from "@netlify/blobs";
import { authorize, json, parsePortrait, workerToken } from "../../server/core.mjs";
import { POSTER_LAYOUT } from "../../public/poster.js";
export default async (request) => {
  if (request.method !== "POST") return json({ error: "הפעולה אינה נתמכת." }, 405);
  const denied = authorize(request);
  if (denied) return denied;
  let input;
  try { input = await parsePortrait(request); } catch (error) { return json({ error: error.message }, 400); }
  const base = process.env.NETLIFY_DEV === "true" ? new URL(request.url).origin : process.env.STUDIO_SITE_URL;
  if (!base) return json({ error: "כתובת שירות הרקע לא הוגדרה בשרת." }, 503);
  const store = getStore({ name: "graffiti-jobs", consistency: "strong" });
  try {
    const created = await store.setJSON(input.id, { status: "queued", name: input.name, layoutVersion: POSTER_LAYOUT, createdAt: Date.now() }, { onlyIfNew: true });
    if (!created.modified) {
      const existing = await store.get(input.id, { type: "json" });
      if (existing.status !== "queued") return json({ id: input.id }, 202);
    } else await store.setJSON(`${input.id}/input`, { name: input.name, type: input.type, bytes: input.bytes.toString("base64") });
    const invoked = await fetch(new URL("/.netlify/functions/render-background", base), {
      method: "POST", headers: { "content-type": "application/json", "x-worker-token": workerToken(input.id) },
      body: JSON.stringify({ id: input.id }), signal: AbortSignal.timeout(10000),
    });
    if (!invoked.ok) throw new Error("Worker not accepted");
    return json({ id: input.id }, 202);
  } catch {
    return json({ error: "לא ניתן לאשר שהבקשה נכנסה לתור. בדקו שוב את החיבור לפני ניסיון נוסף." }, 503);
  }
};
