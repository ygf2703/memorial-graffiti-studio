export const PORTRAIT_IDENTITY_VERSION=1;
export function validatePortraitIdentityVersion(version){
 if(version!==undefined&&version!==PORTRAIT_IDENTITY_VERSION)throw new Error("Unsupported portrait identity version");
}
export const identityInstruction=`SOURCE GEOMETRY HAS PRIORITY OVER STYLE: the original photograph is the ONLY identity reference. Preserve its exact head angle, facial proportions, jaw/cheek shape, eyelids, eye spacing/gaze, nose bridge/tip, lips, smile/visible teeth, hairline, facial hair and distinctive asymmetries/accessories. Do not invent a smile, beard, age details or a generic heroic face. Never copy the draft's incorrect facial anatomy. Translate the original geometry into graffiti colour and paint strokes; if simplification would change a defining feature, keep that feature. No caricature, beautification, generic replacement or mirroring. Do not erase defining eye, nose or mouth contours to force a fixed number of paint shapes.`;
