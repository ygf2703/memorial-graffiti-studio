import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { compositeCaption } from "../server/composite.mjs";
import { deliveredJob, CAPTION_LAYOUT, COMPOSITED_LAYOUT, requiresApproval } from "../public/design.js";

test("server returns a finished 1080 PNG for all five captions", async () => {
  const base = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#d8cfbb" } }).png().toBuffer();
  for (let variant = 1; variant <= 5; variant++) {
    const png = await compositeCaption(base, variant);
    const meta = await sharp(png).metadata();
    assert.equal(meta.width, 1080); assert.equal(meta.height, 1080); assert.equal(meta.format, "png");
    const { channels } = await sharp(png).extract({ left: 60, top: 740, width: 960, height: 290 }).stats();
    assert.ok(channels[0].stdev > 10, "caption must visibly change the wall");
  }
  await assert.rejects(compositeCaption(base, 0));
  await assert.rejects(compositeCaption(base, undefined));
});
test("delivery prevents double captions without modifying stored jobs or legacy output", () => {
  const stored = { layoutVersion: CAPTION_LAYOUT, captionVariant: 1 };
  assert.equal(deliveredJob(stored).layoutVersion, COMPOSITED_LAYOUT);
  assert.equal(stored.layoutVersion, CAPTION_LAYOUT);
  assert.ok(requiresApproval(deliveredJob(stored)));
  const legacy = { layoutVersion: "integrated-mural-v3" };
  assert.equal(deliveredJob(legacy), legacy);
});
