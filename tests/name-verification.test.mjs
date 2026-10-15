import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { summarizeNameReadings, verifyName, nameGuide } from "../server/name-verification.mjs";
import { exactNameLayer } from "../server/exact-name.mjs";

const reading = (text, uncertain = false) => ({ text, characters: [...text], uncertain });
test("dual name readings reject missing/extra letters, uncertainty, inconsistent characters and disagreement", () => {
  const name = "יהונתן אליהו", correct = reading(name);
  assert.equal(summarizeNameReadings([correct, correct], name).status, "matched");
  for (const other of [reading("יונתן אליהו"), reading("יהונתן אלייהו"), reading("יהונתן אליחו"), reading(name, true), { ...correct, characters: [..."אור אבני"] }, reading("יהונתן  אליהו")]) {
    assert.equal(summarizeNameReadings([correct, other], name).status, "needs_review");
  }
  assert.equal(summarizeNameReadings([correct], name).status, "unavailable");
  assert.equal(summarizeNameReadings([correct, { error: "unavailable" }], name).status, "unavailable");
});
test("dual transcription uses independent full/crop calls and never sends the expected name", async () => {
  const bytes = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: "white" } }).png().toBuffer();
  const seen = [];
  const result = await verifyName(bytes, "שם ניסוי", async (_, options) => {
    const body = JSON.parse(options.body); seen.push(body);
    assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
    assert.ok(!body.instructions.includes("שם ניסוי"));
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(reading("שם ניסוי")) }] }] });
  });
  assert.equal(result.status, "matched");
  assert.deepEqual(seen.map((x) => x.model), ["gpt-4.1-mini", "gpt-4.1"]);
  const dimensions = await Promise.all(seen.map((x) => sharp(Buffer.from(x.input[0].content[0].image_url.split(",")[1], "base64")).metadata()));
  assert.deepEqual(dimensions.map((x) => [x.width, x.height]), [[1080,1080], [1620,570]]);
});
test("name verification fails safely on malformed image and inaccessible service", async () => {
  assert.equal((await verifyName(Buffer.from("not image"), "שם ניסוי")).status, "unavailable");
  const bytes = await nameGuide("שם ניסוי");
  const result = await verifyName(bytes, "שם ניסוי", async () => { throw new Error("secret"); });
  assert.equal(result.status, "unavailable"); assert.ok(!JSON.stringify(result).includes("secret"));
});
test("literal-name prototypes render Hebrew names and reject invalid/illegibly long names", async () => {
  const names = ["יהונתן אליהו", "אור אבני", "נועה מרציאנו", "חן נחמיאס", "בניה רובל", "אלעד ראובן", "דרור אלטון", "חיים בכר", "שחר אביגיל", "מאור כהן איזנקוט", "בן־עמי", "דוד לוי"];
  for (const name of names) {
    const result = await exactNameLayer(name, "same");
    const metadata = await sharp(result).metadata();
    assert.equal(metadata.width, 1080); assert.equal(metadata.height, 250); assert.equal(metadata.hasAlpha, true);
    const alpha = await sharp(result).extractChannel(3).stats();
    assert.ok(alpha.channels[0].max > 200);
  }
  await assert.rejects(exactNameLayer("<script>"));
  await assert.rejects(exactNameLayer("אבגדהוזחטיכלמנסעפצקרשת".repeat(3)));
  assert.notDeepEqual(await exactNameLayer("יונתן אליהו"), await exactNameLayer("יהונתן אליהו"));
  assert.deepEqual(await exactNameLayer("יהונתן אליהו"), await exactNameLayer("יהונתן אליהו"));
});
