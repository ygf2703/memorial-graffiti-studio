import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { nameVariant, exactNameLayer, compositeExactName, nameGlyph } from "../server/exact-name.mjs";
import { muralPrompt } from "../server/prompt.mjs";
import { generateImage } from "../server/core.mjs";
import { EXACT_NAME_LAYOUT, NAME_STYLE_COUNT, requiresApproval, deliveredJob } from "../public/design.js";

test("name styles are stable, all reachable, and require human approval", () => {
  const choices = Array.from({ length: 1000 }, (_, i) => nameVariant(`unique-image-${i}`));
  assert.equal(new Set(choices).size, 10);
  assert.ok(choices.every((x) => x >= 1 && x <= NAME_STYLE_COUNT));
  assert.equal(nameVariant("same"), nameVariant("same"));
  const job = { layoutVersion: EXACT_NAME_LAYOUT };
  assert.equal(deliveredJob(job), job); assert.ok(requiresApproval(job));
});
test("literal pipeline sends no name or slogan to image generation", async () => {
  const prompt = muralPrompt("seed", "יהונתן אליהו", true, true);
  assert.match(prompt, /NO LETTERING/); assert.match(prompt, /top 24%/);
  assert.ok(!prompt.includes("יהונתן")); assert.ok(!prompt.includes("אחים ואחיות"));
  await generateImage({ type: "image/jpeg", bytes: Buffer.from([255,216,255]) }, "יהונתן אליהו", async (_, options) => {
    assert.equal(options.body.get("prompt"), prompt);
    return Response.json({ data: [{ b64_json: "mock" }] });
  }, "seed", true, null, true);
});
test("all ten name fonts render Hebrew and common separators without truncation", async () => {
  for (let variant = 1; variant <= NAME_STYLE_COUNT; variant++) {
    for (const name of ["יהונתן אליהו", "נועה מרציאנו", "מאור כהן איזנקוט", "בן־עמי", "דוד לוי"]) {
      const glyph = await nameGlyph(name, variant);
      assert.ok(glyph.info.width <= 880 && glyph.info.height >= 48);
    }
  }
});
test("ten transparent name styles differ, keep margins, and preserve the wall below", async () => {
  const images = [];
  for (let variant = 1; variant <= NAME_STYLE_COUNT; variant++) {
    const png = await exactNameLayer("יהונתן אליהו", "same", variant); images.push(png.toString("base64"));
    const meta = await sharp(png).metadata();
    assert.equal(meta.width, 1080); assert.equal(meta.height, 250); assert.ok(meta.hasAlpha);
    for (const left of [0, 1050]) {
      const alpha = await sharp(png).extract({ left, top: 0, width: 30, height: 250 }).extractChannel(3).raw().toBuffer();
      assert.equal(Math.max(...alpha), 0, "safe margin is transparent");
    }
  }
  assert.equal(new Set(images).size, 10);
  await assert.rejects(exactNameLayer("שם מלא", "seed", 11));
  const base = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#d8cfbb" } }).png().toBuffer();
  const final = await compositeExactName(base, "יהונתן אליהו", "same", 1);
  assert.deepEqual(await sharp(final).extract({ left: 0, top: 250, width: 1080, height: 830 }).removeAlpha().raw().toBuffer(), await sharp(base).extract({ left: 0, top: 250, width: 1080, height: 830 }).removeAlpha().raw().toBuffer());
});
