export const NAME_SCALE_VERSION=1;
export function nameSizing(version){
 if(version!==undefined&&version!==NAME_SCALE_VERSION)throw new Error('Unsupported name scale version');
 return version===NAME_SCALE_VERSION?{maximumHeight:320,fallbackMaximumHeight:300,maximumWidth:1008}:{maximumHeight:240,fallbackMaximumHeight:200,maximumWidth:900};
}
export const largeNameInstruction='LARGE CATALOGUE NAME OVERRIDE: reserve upper wall y=24..350 for a prominent existing graffiti name, up to 320px high and up to the available canvas width. Lettering MAY overlap painted HAIR, a HAT or clothing. Facial skin, forehead, eyebrows, eyes, nose, cheeks, lips and chin must remain wholly uncovered. Place the facial skin region below y=374 and its chin above y=790, with the complete white/blue Israeli flag beside the face and outside the title. Do not add any lettering yourself. Preserve the original facial geometry and graffiti medium; only provide more safe room for the existing name. The lower catalogue slogan and colours remain unchanged.';
