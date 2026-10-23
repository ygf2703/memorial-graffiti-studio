import { getStore } from "@netlify/blobs";
import { authorize, json, parsePortrait, workerToken } from "../../server/core.mjs";
import { EXACT_NAME_LAYOUT, NAME_STYLE_COUNT, CAPTION_STYLE_COUNT, captionVariant } from "../../public/design.js";
import { nameVariant } from "../../server/exact-name.mjs";
import { NAME_STYLE_VERSION } from "../../server/graffiti-name.mjs";
import { releaseCatalog, selectArtwork } from "../../server/name-artwork.mjs";
import { PORTRAIT_REFINEMENT_VERSION, PORTRAIT_REFINEMENT_MODEL } from "../../server/portrait-refinement.mjs";
import {REFERENCE_STYLE_VERSION} from "../../server/reference-style.mjs";
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
    else throw new Error("Verified name catalogue is required");
  } catch { return json({ error: "בדקו שהתמונה והשם תקינים ושהשם מוכן במאגר הגרפיטי. לא נשלחה בקשת יצירה." }, 400); }
  const base = process.env.NETLIFY_DEV === "true" ? new URL(request.url).origin : process.env.STUDIO_SITE_URL;
  if (!base) return json({ error: "כתובת שירות הרקע לא הוגדרה בשרת." }, 503);
  const store = getStore({ name: "graffiti-jobs", consistency: "strong" });
  try {
    const created = await store.setJSON(input.id, { status: "queued", name: input.name, referenceStyleVersion: REFERENCE_STYLE_VERSION, visualVersion: 1, portraitRefinementVersion: PORTRAIT_REFINEMENT_VERSION, portraitRefinementModel: PORTRAIT_REFINEMENT_MODEL, layoutVersion: EXACT_NAME_LAYOUT, nameStyleVersion: NAME_STYLE_VERSION, nameVariant: nameVariant(input.id), nameStyleCount: NAME_STYLE_COUNT, ...(nameArtwork ? { nameArtwork, namePlacementVersion: 2, nameSource: "prebuilt-reviewed" } : {}), captionVariant: captionVariant(input.id, CAPTION_STYLE_COUNT, "new90"), captionStyleCount: CAPTION_STYLE_COUNT, captionMix: "new90", designSeed: input.id, createdAt: Date.now() }, { onlyIfNew: true });
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
