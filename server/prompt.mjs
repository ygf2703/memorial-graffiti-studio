import { muralDesign } from "../public/design.js";

export function muralPrompt(seed) {
  const design = muralDesign(seed);
  return `MEDIUM: Real aerosol street graffiti, a bold four-pass cut-paper stencil portrait sprayed on an urban wall. Match the GRAPHIC SIMPLICITY of images 2–4, not fine-art painting.
BACKGROUND VARIATION: ${design.wall}; ${design.wear}; ${design.marks}. Invent an original arrangement of cracks, paint chips, sprayed arrows and abstract non-letter tags. Do NOT copy a reference background or default to the same centered flag across the whole wall.
MANDATORY ISRAELI FLAG: ${design.flag}. A clearly recognizable Israeli flag with WHITE field, TWO BLUE stripes and ONE correctly formed six-pointed blue Star of David. Keep the entire star and enough of both stripes visible, not hidden by the portrait. The flag must be painted onto the wall, not floating fabric.
PALETTE: ONLY navy #082e49, blue #207ba6, yellow #e6c62e and chalk white #f5f1da. Neutral beige is allowed for bare wall only. No natural skin colours, green, pink or red.
PORTRAIT: Image 1 is the ONLY person reference. Preserve head tilt, facial proportions, eye spacing, nose and lip shape, mouth opening, jaw outline, hairline, facial hair boundaries, glasses and expression. Simplify tonal detail, NOT facial geometry. Keep source clothing shape and neckline; NEVER substitute a military uniform or invent insignia. Do not copy reference faces.
FOUR SPRAY LAYERS ONLY: chalk-white base, ONE flat yellow light shape, ONE flat blue shadow shape, navy silhouette and selected thick outlines. Large connected colour regions; strong graphic negative space; simplified hair and beard as solid masses. No individual hairs, skin shading, stippled face, crosshatching, painterly brushstrokes, watercolor, gradients, airbrush modelling, photorealistic skin or tiny tonal islands. Aerosol fuzz and drips belong at paint edges, not dense grain across the face. Keep the face recognizable through contour geometry.
LAYOUT: Square, near-front-facing wall. Keep top 24% and bottom 22% as continuous wall texture with sparse overspray for separately rendered lettering; no rectangular panels. Head between y=27% and y=65%, shoulders end by y=77%. Flag remains clearly visible beside the face.
NO TEXT, letters, names, numbers, captions, unit logos, extra people or watermarks. Our renderer adds exact Hebrew graffiti lettering afterward.
FINAL CHECK: actual sprayed stencil graffiti, not a detailed painted portrait. Four flat inks. Visible correct Israeli flag. Fresh asymmetrical wall composition. Variation identifier ${seed}.`;
}
