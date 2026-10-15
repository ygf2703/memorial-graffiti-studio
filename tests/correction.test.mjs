import test from "node:test";
import assert from "node:assert/strict";
import { queueCorrection, correctionInstruction } from "../server/correction.mjs";
import { generateImage } from "../server/core.mjs";
import { validateFiles, validName } from "../public/batch.js";
import correct from "../netlify/functions/correct.mjs";
import { EXACT_NAME_LAYOUT } from "../public/design.js";

test("literal-name corrections preserve the new pipeline without asking AI to redraw letters", async () => {
  const { data, store, input } = fixture();
  data.set("original", { ...data.get("original"), layoutVersion: EXACT_NAME_LAYOUT });
  const { id } = await queueCorrection(store, "original", input, "name");
  assert.equal(data.get(id).layoutVersion, EXACT_NAME_LAYOUT);
  assert.match(correctionInstruction("name", input.name, true), /Do not generate ANY text/);
  assert.ok(!correctionInstruction("name", input.name, true).includes(input.name));
});

function fixture() {
  const data = new Map([["original", { name: "אור אבני", status: "completed", captionVariant: 3, designSeed: "same" }]]);
  const store = {
    async get(key) { return data.get(key) ?? null; },
    async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) return { modified: false }; data.set(key, value); return { modified: true }; },
  };
  return { data, store, input: { name: "אור אבני", type: "image/jpeg", bytes: Buffer.from([255,216,255]) } };
}
test("concurrent corrections and retries share a single durable child", async () => {
  const { data, store, input } = fixture();
  const responses = await Promise.all(Array.from({ length: 20 }, () => queueCorrection(store, "original", input, "name")));
  assert.equal(new Set(responses.map((x) => x.id)).size, 1);
  const id = responses[0].id, child = data.get(id);
  assert.equal(child.captionVariant, 3); assert.equal(child.designSeed, "same"); assert.equal(child.correctionReason, "name");
  data.set(id, { ...child, status: "failed" });
  assert.deepEqual(await queueCorrection(store, "original", input, "portrait"), { id, status: "failed" });
  data.set(id, { ...child, status: "completed" });
  await assert.rejects(queueCorrection(store, id, input, "portrait"), /נוצל/);
});
test("reject invalid reason, non-completed parent and altered name before claiming", async () => {
  const { data, store, input } = fixture();
  await assert.rejects(queueCorrection(store, "original", input, "anything"));
  await assert.rejects(queueCorrection(store, "missing", input, "name"));
  await assert.rejects(queueCorrection(store, "original", { ...input, name: "שם אחר" }, "name"));
  assert.equal(data.size, 1);
});
test("interrupted setup resumes the existing claim without allocating another job", async () => {
  const { data, store, input } = fixture();
  data.set("original/correction", { id: "reserved", reason: "portrait" });
  assert.equal((await queueCorrection(store, "original", input, "name")).id, "reserved");
  assert.equal(data.get("reserved").correctionReason, "portrait");
});
test("correction request includes source first, rejected mural last and targeted instruction", async () => {
  for (const reason of ["name", "portrait"]) {
    await generateImage({ type: "image/jpeg", bytes: Buffer.from([255,216,255]) }, "אור אבני", async (_, options) => {
      const images = options.body.getAll("image[]");
      assert.equal(images.length, 5); assert.equal(images[0].name, "portrait"); assert.equal(images[4].name, "rejected-mural.jpg");
      assert.ok(options.body.get("prompt").includes(correctionInstruction(reason, "אור אבני")));
      return Response.json({ data: [{ b64_json: "mock" }] });
    }, "seed", true, { reason, bytes: Buffer.from([255,216,255]) });
  }
});
test("manual naming allows generic filenames while keeping file constraints", () => {
  const photo = { name: "080.jpg", type: "image/jpeg", size: 200 };
  assert.deepEqual(validateFiles([photo], false), []);
  assert.ok(validateFiles([photo]).length);
  assert.ok(validateFiles([{ ...photo, size: 0 }], false).length);
  assert.equal(validName("יהונתן אליהו"), true); assert.equal(validName(""), false);
});
test("correction endpoint rejects unsupported method and unauthenticated access", async () => {
  assert.equal((await correct(new Request("http://localhost/api/correct"))).status, 405);
  assert.ok([401,503].includes((await correct(new Request("http://localhost/api/correct", { method: "POST" }))).status));
});
