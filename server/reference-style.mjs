import sharp from "sharp";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {muralDesign} from "../public/design.js";
import {paletteInstruction,validatePaletteVersion} from "./palette.mjs";

export const REFERENCE_STYLE_VERSION=1;
export const NAME_SIZE_VERSION=1;
export const referenceBoard=()=>readFile(resolve("netlify/functions/references/approved-graphic-board.png"));
export const graphicStyleInstruction=`APPROVED GRAPHIC MURAL STYLE — overrides photographic and dense-grain rendering instructions: Match the supplied illustrated poster board's visual medium only, NEVER its people, words or exact wall arrangement. Bold hand-painted aerosol/stencil illustration with broad connected blue, yellow and chalk colour planes, confident dark navy contours and deliberately simplified tonal regions. Keep the person's exact photographed geometry and expression. The face is an ILLUSTRATION, not a photograph converted to coloured dots. NO halftone, stippling, pointillism, dense speckled skin, photocopy grain, photo-real facial shading, oil paint or tiny tonal islands. Weathering and spray belong mainly on wall and outer paint edges, not as noise across eyes, nose and mouth. Large worn plaster areas, cracks, peeling paint, a varied painted Israeli flag, asymmetrical arrows and abstract non-letter tags, controlled blue/yellow spray clouds; rich but not a full-canvas confetti texture. Palette unchanged: blue, navy, yellow and chalk; neutral beige only for bare wall. Do not copy any person, inscription or fixed background from the board. Paint NO words; catalogue name and slogan are added later. Preserve accurate facial features, clothing and all clear lettering space.`;

export async function catalogueComposition(artwork,nameSizeVersion){
 if(nameSizeVersion!==undefined&&nameSizeVersion!==NAME_SIZE_VERSION)throw new Error("Invalid name size version");
 // Use rendered dimensions: metadata() alone reports the untrimmed input.
 const trimmed=await sharp(artwork).trim({background:"#00000000",threshold:0}).png().toBuffer({resolveWithObject:true});
 const headerBottom=nameSizeVersion===NAME_SIZE_VERSION
  ?Math.min(440,Math.max(300,Math.ceil(1008*trimmed.info.height/trimmed.info.width)+48))
  :Math.min(380,Math.max(200,Math.ceil(900*trimmed.info.height/trimmed.info.width)+36));
 return {headerBottom};
}

export function referenceCompositionInstruction(style){
 if(style?.nameSizeVersion!==undefined&&style.nameSizeVersion!==NAME_SIZE_VERSION)throw new Error("Invalid name size version");
 if(style?.version!==REFERENCE_STYLE_VERSION||!Number.isInteger(style.headerBottom)||style.headerBottom<(style.nameSizeVersion?300:200)||style.headerBottom>(style.nameSizeVersion?440:380))throw new Error("Invalid reference layout");
 return `CATALOGUE-SAFE COMPOSITION overrides the earlier side/head coordinates: on a 1080px square, leave y=24..${style.headerBottom} as continuous lightly textured wall for the EXISTING name artwork. This is free wall, not a banner.${style.nameSizeVersion?" LARGE NAME PRIORITY: the catalogue name is a prominent main title, not a small label. Leave the full width x=36..1044 clear throughout this upper wall, including hair, flag stripes, star, tags and large paint marks. The name will be scaled as large as safely possible without covering the head. Move the entire head LOWER, not into the title space; keep it recognizable and do not shrink its features selectively.":""} Keep ALL head/hair/ears below y=${style.headerBottom+24} and above y=742. Keep the entire Israeli flag and star beside the portrait BELOW y=${style.headerBottom+24}, never in the name area. The portrait may occupy the middle and lower wall, with shoulders behind the bottom caption. Bottom 32% must not contain a face, flag or star. Keep the figure large within that middle region, naturally framed and recognizable. Vary wall/flag/marks per image; do not copy a fixed layout. Preserve this safe empty upper area during any face refinement.`;
}

export function referenceGenerationPrompt(seed,style){
 validatePaletteVersion(style.paletteVersion);
 const design=muralDesign(seed);
 if(style.paletteVersion)design.wall=design.wall.replace(/cream|beige|off-white/gi,"white");
 return `Create an unlettered memorial street-art wall for the person in Image 1. Image 1 is the ONLY identity source; Image 2 is an illustration STYLE board, not a source of people or text. Preserve the source person's head angle, expression, eye/nose/mouth proportions, hair and facial-hair boundaries and actual clothing. Transfer the graphic illustration style, not a reference person's face. ${style.paletteVersion?graphicStyleInstruction.replace("Palette unchanged: blue, navy, yellow and chalk; neutral beige only for bare wall.",paletteInstruction):graphicStyleInstruction} BACKGROUND VARIATION: ${design.wall}; ${design.wear}; ${design.marks}. A recognizable Israeli flag painted on the wall, with white field, two blue stripes and a full correctly formed six-pointed Star of David; ${design.flag}. ${referenceCompositionInstruction(style)} No words, letters, logos, dates, watermarks or extra people. The result should read as a hand-drawn painted mural, with broad flat shapes like the STYLE board, never a colourized photograph. Variation ${seed}.`;
}

export function referenceRefinementPrompt(style){
 validatePaletteVersion(style.paletteVersion);
 return `Refine the person in the unlettered mural Image 2 using original photograph Image 1 as the ONLY identity source. Image 3 is the approved GRAPHIC ILLUSTRATION STYLE board, not another identity. Correct the actual head/jaw proportions, eye/eyelid shapes, nose, smile/lips/teeth, hair, facial hair and accessories against the photo. Do not invent beard from shadows, alter expression, beautify or mirror. Preserve the draft's framing, head size/position, clothing, wall, flag and clear lettering areas. ${style.paletteVersion?graphicStyleInstruction.replace("Palette unchanged: blue, navy, yellow and chalk; neutral beige only for bare wall.",paletteInstruction):graphicStyleInstruction} This is a graphic hand-painted portrait: clean broad blue/yellow/chalk planes, navy selected contours. Remove fine facial stippling instead of adding it. Do NOT increase photographic skin detail or preserve photographic texture. Keep likeness through contour geometry, not through pores or shaded dots. ${referenceCompositionInstruction(style)} No lettering of any kind. Keep non-head elements unchanged.`;
}
