import { getStore } from "@netlify/blobs";
import { generateImage, validId, validWorker } from "../../server/core.mjs";
import { SPRAY_LAYOUT } from "../../public/design.js";
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
    const imageBase64 = await generateImage({ type: input.type, bytes: Buffer.from(input.bytes, "base64") }, input.name, fetch, designSeed);
    await store.set(`${id}/result`, Buffer.from(imageBase64, "base64"));
    await store.setJSON(id, { ...job, layoutVersion: SPRAY_LAYOUT, designSeed, status: "completed" });
  } catch (error) {
    await store.setJSON(id, { ...job, status: "failed", error: /^(שירות|מפתח|החיבור|אין יתרה|לחשבון)/u.test(error.message) ? error.message : "יצירת התמונה נכשלה. בדקו את החיבור ונסו שוב." });
  } finally {
    await store.delete(`${id}/input`);
  }
};
