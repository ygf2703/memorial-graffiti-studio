import { getStore } from "@netlify/blobs";
import { authorize, json, parsePortrait, workerToken } from "../../server/core.mjs";
import { EXACT_NAME_LAYOUT, NAME_STYLE_COUNT, captionVariant } from "../../public/design.js";
import { nameVariant } from "../../server/exact-name.mjs";
import { graffitiGlyph, NAME_STYLE_VERSION } from "../../server/graffiti-name.mjs";
import { releaseCatalog, selectArtwork } from "../../server/name-artwork.mjs";
export default async (request) => {
  if (request.method !== "POST") return json({ error: "הפעולה אינה נתמכת." }, 405);
  const denied = authorize(request);
  if (denied) return denied;
  let input, nameArtwork;
  try {
    input = await parsePortrait(request);
    const catalog = await releaseCatalog();
    if (catalog) {
      nameArtwork = selectArtwork(catalog, input.name);
      // The approved existing inscription is authoritative for aliases too.
      input.name = nameArtwork.name;
    }
    else await graffitiGlyph(input.name, nameVariant(input.id));
  } catch { return json({ error: "בדקו שהתמונה והשם תקינים ושהשם מוכן במאגר הגרפיטי. לא נשלחה בקשת יצירה." }, 400); }
  const base = process.env.NETLIFY_DEV === "true" ? new URL(request.url).origin : process.env.STUDIO_SITE_URL;
  if (!base) return json({ error: "כתובת שירות הרקע לא הוגדרה בשרת." }, 503);
  const store = getStore({ name: "graffiti-jobs", consistency: "strong" });
  try {
    const created = await store.setJSON(input.id, { status: "queued", name: input.name, layoutVersion: EXACT_NAME_LAYOUT, nameStyleVersion: NAME_STYLE_VERSION, nameVariant: nameVariant(input.id), nameStyleCount: NAME_STYLE_COUNT, ...(nameArtwork ? { nameArtwork, nameSource: "prebuilt-reviewed" } : {}), captionVariant: captionVariant(input.id), designSeed: input.id, createdAt: Date.now() }, { onlyIfNew: true });
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
