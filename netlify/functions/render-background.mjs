import { getStore } from "@netlify/blobs";
import { generateImage, validId, validWorker } from "../../server/core.mjs";
import { INTEGRATED_LAYOUT, CAPTION_LAYOUT, EXACT_NAME_LAYOUT } from "../../public/design.js";
import { reviewImage } from "../../server/review.mjs";
import { compositeExactName, nameVariant } from "../../server/exact-name.mjs";
import { compositeCaption } from "../../server/composite.mjs";
import { compositeGraffitiName, NAME_STYLE_VERSION, graffitiStyles } from "../../server/graffiti-name.mjs";
import { fetchArtwork, compositeArtwork } from "../../server/name-artwork.mjs";
import { detectPortraitLayout, composePlacedArtwork, vividPoster } from "../../server/name-placement.mjs";
import { preparePortraitBase } from "../../server/portrait-refinement.mjs";
import {catalogueComposition,REFERENCE_STYLE_VERSION} from "../../server/reference-style.mjs";
export default async (request) => {
  if (request.method !== "POST") return;
  const { id } = await request.json().catch(() => ({}));
  if (!validId(id) || !validWorker(id, request.headers.get("x-worker-token"))) return;
  const store = getStore({ name: "graffiti-jobs", consistency: "strong" });
  const job = await store.get(id, { type: "json" });
  if (!job || job.status !== "queued") return;
  const claim = await store.set(`${id}/claimed`, "true", { onlyIfNew: true });
  if (!claim.modified) return;
  const startedAt=Date.now();
  try {
    const onStage=stage=>store.setJSON(id,{...job,status:"processing",startedAt,stage});
    await onStage("generating");
    const input = await store.get(`${id}/input`, { type: "json" });
    if (!input) throw new Error("תמונת המקור לא זמינה. יש להעלות אותה מחדש.");
    if (job.nameArtwork && job.nameArtwork.name !== input.name) throw new Error("Artwork name mismatch");
    const artwork = job.nameArtwork ? await fetchArtwork(job.nameArtwork) : null;
    if(job.referenceStyleVersion!==undefined&&job.referenceStyleVersion!==REFERENCE_STYLE_VERSION)throw new Error("Unsupported reference style");
    if(job.referenceStyleVersion&&!artwork)throw new Error("Missing approved name artwork");
    const referenceStyle=job.referenceStyleVersion?{version:REFERENCE_STYLE_VERSION,...await catalogueComposition(artwork)}:null;
    const designSeed = job.designSeed || id;
    const exactName = job.layoutVersion === EXACT_NAME_LAYOUT;
    const fixedCaption = job.layoutVersion === CAPTION_LAYOUT;
    const previousId = job.recomposeOf || job.parentId;
    const previous = previousId ? await store.get(`${previousId}/${exactName ? "base" : "result"}`, { type: "arrayBuffer" }) : null;
    if (previousId && !previous) throw new Error("Missing original result");
    const correction = previous ? { bytes: Buffer.from(previous), reason: job.correctionReason } : null;
    const adaptiveName = artwork && [1,2].includes(job.namePlacementVersion) ? job.namePlacementVersion : false;
    const portrait={type:input.type,bytes:Buffer.from(input.bytes,"base64")};
    let result = await preparePortraitBase(job,portrait,previous,{
      generate:()=>generateImage(portrait,input.name,fetch,designSeed,fixedCaption,correction,exactName,Boolean(artwork),adaptiveName,job.visualVersion||0,job.portraitRefinementVersion?5*60*1000:12*60*1000,referenceStyle),
      saveDraft:draft=>store.set(`${id}/draft`,draft),onStage,referenceStyle,
    });
    await onStage("compositing");
    const variant = job.nameVariant || nameVariant(designSeed);
    let namePlacement;
    if (exactName) {
      await store.set(`${id}/base`, result);
      if (adaptiveName) {
        const wrapped = job.nameArtwork.wrapped ? await fetchArtwork(job.nameArtwork.wrapped) : null;
        const detection = await detectPortraitLayout(result);
        await store.setJSON(`${id}/layout`,detection);
        const composed = await composePlacedArtwork(result, artwork, detection, job.namePlacementVersion, wrapped, {name:input.name,seed:designSeed,variant,visualVersion:job.visualVersion||0,catalogueOnly:Boolean(referenceStyle)});
        result = composed.bytes; namePlacement = composed.placement;
      } else result = artwork ? await compositeArtwork(result, artwork) : job.nameStyleVersion === NAME_STYLE_VERSION ? await compositeGraffitiName(result, input.name, designSeed, variant, job.visualVersion||0) : await compositeExactName(result, input.name, designSeed, variant);
      result = await compositeCaption(result, job.captionVariant);
      if (job.namePlacementVersion === 2) result = await vividPoster(result);
    }
    await store.set(`${id}/result`, result);
    const review = await reviewImage(result.toString("base64"), input.name, fetch, fixedCaption, exactName ? "image/png" : "image/jpeg");
    await store.setJSON(id, { ...job, layoutVersion: exactName ? EXACT_NAME_LAYOUT : fixedCaption ? CAPTION_LAYOUT : INTEGRATED_LAYOUT, ...(exactName ? { nameVariant: variant, nameSource: namePlacement?.source === "literal-two-line" ? "literal-two-line" : artwork ? "prebuilt-reviewed" : "literal-input" } : {}), ...(job.nameStyleVersion === NAME_STYLE_VERSION ? { nameStyleLabel: namePlacement?.source === "literal-two-line" ? "גרפיטי מקומי בשתי שורות" : artwork ? "גרפיטי מוכן מראש" : graffitiStyles[variant - 1].label } : {}), designSeed, ...(namePlacement ? { namePlacement } : {}), review, status: "completed" });
  } catch (error) {
    await store.setJSON(id, { ...job, status: "failed", error: /^(לא נמצא מיקום בטוח|שירות|מפתח|החיבור|אין יתרה|לחשבון)/u.test(error.message) ? error.message : "יצירת התמונה נכשלה. בדקו את החיבור ונסו שוב." });
  } finally {
    await store.delete(`${id}/input`);
  }
};
