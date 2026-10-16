import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { readArtworkName, compareArtworkReading, ARTWORK_READER_MODEL } from "../server/read-name-artwork.mjs";

const png = () => sharp({ create: { width: 400, height: 150, channels: 4, background: "#207ba680" } }).png().toBuffer();
test("artwork OCR is blind, structured, non-storing, and receives an opaque viewing background", async () => {
  const text = "איתי ברדיצ'בסקי";
  const reading = await readArtworkName(await png(), async (_, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.store, false); assert.equal(body.model, ARTWORK_READER_MODEL);
    assert.equal(body.text.format.strict, true);
    assert.ok(!JSON.stringify(body).includes(text));
    const image = Buffer.from(body.input[0].content[0].image_url.split(",")[1], "base64");
    assert.equal((await sharp(image).metadata()).hasAlpha, false);
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ text, characters: [...text], uncertain: false }) }] }] });
  });
  assert.equal(compareArtworkReading(reading, text), "matched");
  assert.equal(compareArtworkReading(reading, "איתי ברדיצבסקי"), "needs_review");
  assert.equal(compareArtworkReading({ ...reading, uncertain: true }, text), "needs_review");
});
test("OCR errors, refusals, inconsistent character lists and malformed images cannot pass", async () => {
  const bytes = await png();
  for (const response of [new Response("private details", { status: 401 }), Response.json({ status: "incomplete" }), Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }), Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ text: "שם", characters: ["א"], uncertain: false }) }] }] })]) {
    const reading = await readArtworkName(bytes, async () => response);
    assert.equal(reading.status, "unavailable"); assert.equal(compareArtworkReading(reading, "שם"), "unavailable");
    assert.ok(!JSON.stringify(reading).includes("private details"));
  }
  assert.equal((await readArtworkName(Buffer.from("invalid"), async () => { throw new Error("must not call"); })).status, "unavailable");
});
