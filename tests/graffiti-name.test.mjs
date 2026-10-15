import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { graffitiStyles, graffitiGlyph, graffitiNameLayer, compositeGraffitiName, NAME_STYLE_VERSION } from "../server/graffiti-name.mjs";
import { queueCorrection } from "../server/correction.mjs";
import { EXACT_NAME_LAYOUT } from "../public/design.js";

test("reference-board catalog keeps ten distinct styles and literal Hebrew input", async () => {
  assert.equal(graffitiStyles.length, 10);
  assert.equal(new Set(graffitiStyles.map((x) => x.label)).size, 10);
  for (let variant = 1; variant <= 10; variant++) {
    const glyph = await graffitiGlyph("יוסף חיים אשרף", variant);
    assert.ok(glyph.info.width <= 880 && glyph.info.height >= 48);
  }
  await assert.rejects(graffitiGlyph("<script>", 1));
  await assert.rejects(graffitiGlyph("שם מלא", 11));
  const a = await graffitiGlyph("יונתן אליהו", 1), b = await graffitiGlyph("יהונתן אליהו", 1);
  assert.notDeepEqual(a.data, b.data);
});

test("new spray layers render all ten styles with visible ink, transparent safe edges and stable output", async () => {
  const outputs = [];
  for (let variant = 1; variant <= 10; variant++) {
    const layer = await graffitiNameLayer("יהונתן אליהו", "same", variant);
    outputs.push(layer.toString("base64"));
    const metadata = await sharp(layer).metadata();
    assert.equal(metadata.width, 1080); assert.equal(metadata.height, 250);
    const alpha = await sharp(layer).extractChannel(3).raw().toBuffer();
    assert.ok(alpha.filter((x) => x > 200).length > 2500, "name must not render blank");
    for (let y = 0; y < 250; y++) for (let x = 0; x < 30; x++) {
      assert.equal(alpha[y * 1080 + x], 0);
      assert.equal(alpha[y * 1080 + 1079 - x], 0);
    }
  }
  assert.equal(new Set(outputs).size, 10);
  assert.equal((await graffitiNameLayer("יהונתן אליהו", "same", 1)).toString("base64"), outputs[0]);
  const base = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#d8cfbb" } }).png().toBuffer();
  const result = await compositeGraffitiName(base, "יהונתן אליהו", "same", 1);
  const crop = (bytes) => sharp(bytes).extract({ left: 0, top: 250, width: 1080, height: 830 }).removeAlpha().raw().toBuffer();
  assert.deepEqual(await crop(result), await crop(base));
});

test("one-time corrections retain the exact style catalog version", async () => {
  const data = new Map([["parent", { name: "אור אבני", status: "completed", nameStyleVersion: NAME_STYLE_VERSION, layoutVersion: EXACT_NAME_LAYOUT, nameVariant: 2 }]]);
  const store = {
    async get(key) { return data.get(key) || null; },
    async setJSON(key, value, options) { if (!options?.onlyIfNew || !data.has(key)) data.set(key, value); return { modified: true }; },
  };
  const { id } = await queueCorrection(store, "parent", { name: "אור אבני", type: "image/jpeg", bytes: Buffer.from("image") }, "portrait");
  assert.equal(data.get(id).nameStyleVersion, NAME_STYLE_VERSION);
  assert.equal(data.get(id).nameVariant, 2);
});
