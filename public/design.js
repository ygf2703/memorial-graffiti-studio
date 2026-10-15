export const SPRAY_LAYOUT = "spray-stencil-v2";
export const INTEGRATED_LAYOUT = "integrated-mural-v3";
export const CAPTION_LAYOUT = "fixed-caption-v4";
export const COMPOSITED_LAYOUT = "server-caption-v5";
export const EXACT_NAME_LAYOUT = "server-exact-name-v6";
export const requiresApproval = (job) => [INTEGRATED_LAYOUT, CAPTION_LAYOUT, COMPOSITED_LAYOUT, EXACT_NAME_LAYOUT].includes(job.layoutVersion);
export const deliveredJob = (job) => job.layoutVersion === CAPTION_LAYOUT ? { ...job, layoutVersion: COMPOSITED_LAYOUT } : job;
export function captionVariant(seed) { return 1 + Math.floor(seededRandom(`caption:${seed}`)() * 5); }
export function seededRandom(seed) {
  let state = 2166136261;
  for (const character of String(seed)) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function muralDesign(seed) {
  const random = seededRandom(seed), pick = (values) => values[Math.floor(random() * values.length)];
  return {
    wall: pick(["large cracked cream plaster panels", "rough pale concrete with exposed aggregate at the edges", "peeling off-white stucco over beige bricks", "old beige alley wall with a vertical repair seam", "whitewashed stone wall with irregular patches", "aged cement wall with flaking layers of cream paint"]),
    flag: pick(["a large tilted flag on the LEFT, its full Star of David clearly visible beside the face", "a large flag on the RIGHT, its full Star of David clearly visible beside the face", "a diagonal flag mural sweeping behind the shoulders with its full Star of David visible to the LEFT", "a rectangular stencil flag at the upper RIGHT beside the head, completely visible"]),
    marks: pick(["wide diagonal blue spray strokes and short yellow bursts", "loose blue loops and yellow arrow shapes at the edges", "vertical yellow spray streaks with scattered blue paint clouds", "angular navy arrows and a broad yellow halo behind the shoulders", "asymmetric blue and yellow overspray with energetic sweeping arcs"]),
    wear: pick(["large irregular plaster chips mostly on the left edge", "fine branching cracks mostly on the right edge", "rough exposed masonry along the lower corners", "uneven peeled patches and old drips at the edges"]),
    rotation: (random() - .5) * .075,
    slant: -.12 - random() * .13,
  };
}
