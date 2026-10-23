import { requestImageEdit } from "./core.mjs";
import { imageBaseForJob } from "./recompose.mjs";

export const PORTRAIT_REFINEMENT_VERSION = 1;
export const PORTRAIT_REFINEMENT_MODEL = "gpt-image-2.5-sunburst";
export const portraitRefinementPrompt = `Use case: identity-preserve.
Image 1 is the ORIGINAL PHOTOGRAPH and the sole source for this person's face. Image 2 is the unlettered mural EDIT TARGET; its face is an imperfect draft, NOT an identity reference.
Change ONLY the facial likeness and necessary head details in Image 2 to faithfully match Image 1. Keep the wall, framing, body, clothing, flag, palette and clear lettering areas in the same positions. Do not move or enlarge the head. No rotation or mirroring.
Reconstruct the photographed head proportions, actual cheek volume, natural jaw contour, specific eyelid and eyebrow shapes/asymmetry, eye spacing and gaze, nose bridge/tip/nostrils, lips, smile contours and visible teeth, ears, forehead and hairline. Keep the exact photographed expression and head tilt. Do not idealize, beautify, invent a smile or turn the subject into a generic soldier. Preserve glasses, dental braces and distinctive visible details when present.
Match the ACTUAL facial hair in Image 1, including density and boundaries. Do not interpret cheek/neck shadows, wrinkles or grain as beard or moustache. Do not add dark stubble or age lines that are absent from the photo. Do not remove facial hair that is present. Keep skin contours distinct from facial-hair shapes.
Render the corrected face as SPRAYED GRAFFITI, NOT a photograph pasted on the wall. ONLY navy #082e49, bright blue #168dcc, golden yellow #ffd629 and chalk white #f5f1da are allowed on the face, hair and clothing. NO natural brown/peach/pink skin colours, green clothing, realistic skin photograph or face cutout. Yellow and chalk highlights, blue shadow masses, navy selected facial contours. Bare-wall beige is allowed on the wall only. Keep the draft's aerosol paint texture. Preserve the photographed facial geometry while translating its tones into these four inks. Retain defining contours rather than exaggerating them to force a rigid stencil. No oil-paint modelling or caricature. Wall wear must not erase defining eye, nose or mouth contours.
No names, letters, slogans, new symbols, watermarks or extra people. Preserve the existing clear space above/beside the head and the bottom 32% for later lettering. Keep the full Israeli flag visible.
Before finishing, compare the face directly against Image 1, not against the incorrect draft. Keep all non-head elements unchanged.`;

export async function refinePortrait(portrait, mural, fetcher = fetch) {
  const form=new FormData();
  form.append("model",PORTRAIT_REFINEMENT_MODEL);
  form.append("size","1024x1024");
  form.append("quality","high");
  form.append("output_format","jpeg");
  form.append("output_compression","90");
  form.append("image[]",new Blob([portrait.bytes],{type:portrait.type}),"original-portrait");
  form.append("image[]",new Blob([mural],{type:"image/jpeg"}),"unlettered-draft.jpg");
  form.append("prompt",portraitRefinementPrompt);
  return Buffer.from(await requestImageEdit(form,fetcher,5*60*1000),"base64");
}

// The worker's durable claim surrounds BOTH paid calls. Never retry either call here.
export async function preparePortraitBase(job, portrait, previous, {generate, refine=refinePortrait, saveDraft=async()=>{}, onStage=async()=>{}}) {
  if(job.portraitRefinementVersion!==undefined&&job.portraitRefinementVersion!==PORTRAIT_REFINEMENT_VERSION)throw new Error("Unsupported refinement version");
  if(job.portraitRefinementModel!==undefined&&job.portraitRefinementModel!==PORTRAIT_REFINEMENT_MODEL)throw new Error("Unsupported refinement model");
  if(job.recomposeOnly)return imageBaseForJob(job,previous,generate);
  if(job.portraitRefinementVersion===PORTRAIT_REFINEMENT_VERSION&&!portrait?.bytes?.byteLength)throw new Error("Missing source portrait");
  await onStage("generating");
  const draft=await imageBaseForJob(job,previous,generate);
  if(job.portraitRefinementVersion!==PORTRAIT_REFINEMENT_VERSION)return draft;
  await saveDraft(draft);
  await onStage("refining_portrait");
  const refined=await refine(portrait,draft);
  if(!Buffer.isBuffer(refined)||!refined.length)throw new Error("Missing refined image");
  return refined;
}
