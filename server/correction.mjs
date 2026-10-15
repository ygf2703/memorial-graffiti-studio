import { randomUUID } from "node:crypto";
import { CAPTION_LAYOUT, EXACT_NAME_LAYOUT, captionVariant } from "../public/design.js";

export const correctionReasons = ["portrait", "name"];
export function correctionInstruction(reason, name, exactName = false) {
  if (!correctionReasons.includes(reason)) throw new Error("סיבת הפסילה אינה תקינה.");
  if (exactName) return `\nCORRECTION: The LAST image is the previous unlettered mural; the FIRST is the original portrait. Preserve the wall and palette. ${reason === "portrait" ? "Correct the person's facial geometry and likeness against the FIRST image using four flat stencil layers." : "Keep the face unchanged and clear all marks and lettering from the top 24% so the exact name can be applied clearly in postproduction."} Do not generate ANY text. Keep top 24% and bottom 32% clear of face and flag for postproduction lettering.`;
  return `\nCORRECTION: The LAST attached image is the rejected mural, not a style reference. Preserve its wall, palette, composition and all correct elements. The FIRST image is the original portrait. ${reason === "portrait" ? "Correct the person's likeness against the FIRST image: head shape, eyes, nose, mouth, hair and facial hair. Keep four flat stencil spray layers; do not make a photographic or painterly face. Preserve the correctly written name." : `Correct ONLY the name lettering to exactly ${JSON.stringify(name)}, in Hebrew RTL. Required characters in reading order: ${JSON.stringify([...name])}. Do not add or omit letters. Preserve the person's face and likeness.`} Keep the bottom 32% clear for the fixed caption. Do not generate the fixed caption.`;
}

// One durable claim per original result; retries resume this job, never buy a second correction.
export async function queueCorrection(store, parentId, input, reason) {
  if (!correctionReasons.includes(reason)) throw new Error("סיבת הפסילה אינה תקינה.");
  const parent = await store.get(parentId, { type: "json" });
  if (!parent || parent.status !== "completed") throw new Error("ניתן לתקן רק תוצאה שהושלמה.");
  if (parent.parentId) throw new Error("ניסיון התיקון היחיד כבר נוצל.");
  if (parent.name !== input.name) throw new Error("השם חייב להיות זהה לשם המקורי.");
  const key = `${parentId}/correction`;
  await store.setJSON(key, { id: randomUUID(), reason }, { onlyIfNew: true });
  const claim = await store.get(key, { type: "json" });
  const existing = await store.get(claim.id, { type: "json" });
  if (existing) return { id: claim.id, status: existing.status };
  await store.setJSON(`${claim.id}/input`, { name: parent.name, type: input.type, bytes: input.bytes.toString("base64") }, { onlyIfNew: true });
  await store.setJSON(claim.id, {
    status: "queued", name: parent.name, parentId, correctionReason: claim.reason,
    layoutVersion: parent.layoutVersion === EXACT_NAME_LAYOUT ? EXACT_NAME_LAYOUT : CAPTION_LAYOUT, captionVariant: parent.captionVariant || captionVariant(parentId),
    designSeed: parent.designSeed || parentId, createdAt: Date.now(),
  }, { onlyIfNew: true });
  return { id: claim.id, status: "queued" };
}
