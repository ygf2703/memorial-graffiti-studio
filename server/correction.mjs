import { randomUUID } from "node:crypto";
import { CAPTION_LAYOUT, EXACT_NAME_LAYOUT, NAME_STYLE_COUNT, captionVariant } from "../public/design.js";
import { nameVariant } from "./exact-name.mjs";

export const correctionReasons = ["portrait", "name"];
export function correctionInstruction(reason, name, exactName = false, largeName = false, adaptiveName = false) {
  if (!correctionReasons.includes(reason)) throw new Error("סיבת הפסילה אינה תקינה.");
  if (exactName && adaptiveName) return "\nCORRECTION: The LAST image is the prior unlettered mural. Preserve the person's likeness from the FIRST image, palette and wall. Keep a large clear head on one side and generous bare upper wall on the opposite side for the name; do not generate ANY text. Keep bottom 32% clear. Correct facial likeness if needed without moving the head into the free name space.";
  if (exactName) return `\nCORRECTION: The LAST image is the previous unlettered mural; the FIRST is the original portrait. Preserve the wall and palette. ${reason === "portrait" ? "Correct the person's facial geometry and likeness against the FIRST image using four flat stencil layers." : "Preserve the facial likeness, but reposition the entire head below the reserved name area if necessary."} Do not generate ANY text. Keep top ${largeName ? 32 : 24}% and bottom 32% clear of the entire head, hair, face and flag for postproduction lettering. Leave a visible gap below the name area; never move the head into it.`;
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
    ...(parent.layoutVersion === EXACT_NAME_LAYOUT ? { nameVariant: claim.reason === "name" ? (parent.nameVariant || nameVariant(parent.designSeed || parentId)) % NAME_STYLE_COUNT + 1 : parent.nameVariant || nameVariant(parent.designSeed || parentId), nameStyleCount: NAME_STYLE_COUNT } : {}),
    ...(parent.nameStyleVersion ? { nameStyleVersion: parent.nameStyleVersion } : {}),
    ...(parent.nameArtwork ? { nameArtwork: parent.nameArtwork, nameSource: "prebuilt-reviewed", nameVariant: parent.nameVariant } : {}),
    ...(parent.namePlacementVersion ? { namePlacementVersion: parent.namePlacementVersion } : {}),
    ...(parent.captionStyleCount ? { captionStyleCount: parent.captionStyleCount } : {}),
    ...(parent.captionMix ? { captionMix: parent.captionMix } : {}),
    ...(parent.visualVersion ? { visualVersion: parent.visualVersion } : {}),
    ...(parent.referenceStyleVersion ? { referenceStyleVersion: parent.referenceStyleVersion } : {}),
    ...(parent.portraitRefinementVersion ? { portraitRefinementVersion: parent.portraitRefinementVersion, portraitRefinementModel: parent.portraitRefinementModel } : {}),
    designSeed: parent.designSeed || parentId, createdAt: Date.now(),
  }, { onlyIfNew: true });
  return { id: claim.id, status: "queued" };
}
