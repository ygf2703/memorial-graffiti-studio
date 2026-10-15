import { getStore } from "@netlify/blobs";
import { generateImage, validId, validWorker } from "../../server/core.mjs";
import { INTEGRATED_LAYOUT, CAPTION_LAYOUT, EXACT_NAME_LAYOUT } from "../../public/design.js";
import { reviewImage } from "../../server/review.mjs";
import { compositeExactName, nameVariant } from "../../server/exact-name.mjs";
import { compositeCaption } from "../../server/composite.mjs";
export default async (request) => {
  if (request.method !== "POST") return;
  const { id } = await request.json().catch(() => ({}));
  if (!validId(id) || !validWorker(id, request.headers.get("x-worker-token"))) return;
  const store = getStore({ name: "graffiti-jobs", consistency: "strong" });
  const job = await store.get(id, { type: "json" });
  if (!job || job.status !== "queued") return;
  const claim = await store.set(`${id}/claimed`, "true", { onlyIfNew: true });
  if (!claim.modified) return;
  try {
    await store.setJSON(id, { ...job, status: "processing", startedAt: Date.now() });
    const input = await store.get(`${id}/input`, { type: "json" });
    if (!input) throw new Error("תמונת המקור לא זמינה. יש להעלות אותה מחדש.");
    const designSeed = job.designSeed || id;
    const exactName = job.layoutVersion === EXACT_NAME_LAYOUT;
    const fixedCaption = job.layoutVersion === CAPTION_LAYOUT;
    const previous = job.parentId ? await store.get(`${job.parentId}/${exactName ? "base" : "result"}`, { type: "arrayBuffer" }) : null;
    if (job.parentId && !previous) throw new Error("Missing original result");
    const correction = previous ? { bytes: Buffer.from(previous), reason: job.correctionReason } : null;
    const imageBase64 = await generateImage({ type: input.type, bytes: Buffer.from(input.bytes, "base64") }, input.name, fetch, designSeed, fixedCaption, correction, exactName);
    let result = Buffer.from(imageBase64, "base64");
    const variant = job.correctionReason === "name" ? nameVariant(designSeed) % 5 + 1 : nameVariant(designSeed);
    if (exactName) {
      await store.set(`${id}/base`, result);
      result = await compositeExactName(result, input.name, designSeed, variant);
      result = await compositeCaption(result, job.captionVariant);
    }
    await store.set(`${id}/result`, result);
    const review = await reviewImage(result.toString("base64"), input.name, fetch, fixedCaption, exactName ? "image/png" : "image/jpeg");
    await store.setJSON(id, { ...job, layoutVersion: exactName ? EXACT_NAME_LAYOUT : fixedCaption ? CAPTION_LAYOUT : INTEGRATED_LAYOUT, ...(exactName ? { nameVariant: variant, nameSource: "literal-input" } : {}), designSeed, review, status: "completed" });
  } catch (error) {
    await store.setJSON(id, { ...job, status: "failed", error: /^(שירות|מפתח|החיבור|אין יתרה|לחשבון)/u.test(error.message) ? error.message : "יצירת התמונה נכשלה. בדקו את החיבור ונסו שוב." });
  } finally {
    await store.delete(`${id}/input`);
  }
};
