import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { nameFromFile, validateFiles, validName, readJson, batchSummary, caption } from "../public/batch.js";
import { fitText, captionLines, POSTER_LAYOUT, paintExactText } from "../public/poster.js";
import { authorize, parsePortrait, generateImage, configured } from "../server/core.mjs";
import { muralDesign, seededRandom } from "../public/design.js";
import { muralPrompt } from "../server/prompt.mjs";
import { paintSprayText } from "../public/spray.js";
import health from "../netlify/functions/health.mjs";
import generate from "../netlify/functions/generate.mjs";
import job from "../netlify/functions/job.mjs";
const photo = (name = "יהונתן אליהו.jpg") => ({ name, type: "image/jpeg", size: 100 });
test("filename supplies the exact name without rewriting letters or separators", () => {
  for (const name of ["יהונתן-אליהו", "יהונתן אליהו", "שם_משפחה", "בן־עמי", "שֵׁם  מָלֵא"]) assert.equal(nameFromFile(photo(`${name}.jpeg`)), name);
});
test("caption contains every required word exactly once", () => assert.equal(captionLines.join(" "), caption));
test("backgrounds vary per job but remain stable when restoring the same job", () => {
  const designs = Array.from({ length: 50 }, (_, i) => muralDesign(`job-${i}`));
  assert.deepEqual(muralDesign("job-3"), designs[3]);
  for (const key of ["wall", "flag", "marks", "wear"]) assert.ok(new Set(designs.map((x) => x[key])).size >= 4);
  const a = seededRandom("same-job"), b = seededRandom("same-job");
  for (let i = 0; i < 20000; i++) { const value = a(); assert.equal(value, b()); assert.ok(value >= 0 && value < 1); }
});
test("every variation requires the Israeli flag, four flat inks and unchanged palette", () => {
  for (let i = 0; i < 50; i++) {
    const prompt = muralPrompt(`job-${i}`);
    assert.match(prompt, /TWO BLUE stripes and ONE correctly formed six-pointed blue Star of David/);
    assert.match(prompt, /FOUR SPRAY LAYERS ONLY/);
    for (const colour of ["#082e49", "#207ba6", "#e6c62e", "#f5f1da"]) assert.ok(prompt.includes(colour));
  }
});
test("font fitting measures the literal text and never truncates", () => {
  const text = "יהונתן אליהו";
  const size = fitText(text, (value, pixels) => { assert.equal(value, text); return { width: pixels * 10, height: pixels }; }, 176, 940, 150);
  assert.equal(size, 94);
  assert.throws(() => fitText(text, () => ({ width: 2000, height: 100 }), 100, 940, 150), /ארוך מדי/u);
  assert.equal(POSTER_LAYOUT, "exact-text-v1");
});
test("poster renderer paints exact RTL name and both caption lines, using loaded fonts", async () => {
  const painted = [], loaded = [];
  const context = {
    measureText(value) { return { width: value.length * 30, actualBoundingBoxLeft: value.length * 15, actualBoundingBoxRight: value.length * 15, actualBoundingBoxAscent: 50, actualBoundingBoxDescent: 10 }; },
    strokeText() {}, drawImage() {}, save() {}, restore() {}, translate() {}, rotate() {}, transform() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, moveTo() {}, lineTo() {}, stroke() {},
    getImageData() { return { data: new Uint8ClampedArray(1080 * 1080 * 4) }; },
    fillText(value) { painted.push({ value, direction: this.direction, font: this.font }); },
    createLinearGradient() { return { addColorStop() {} }; },
  };
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document"), savedFont = Object.getOwnPropertyDescriptor(globalThis, "FontFace");
  try {
    globalThis.document = { fonts: { add(font) { loaded.push(font.family); } }, createElement() { return { getContext() { return context; } }; } };
    globalThis.FontFace = class { constructor(family) { this.family = family; } async load() { return this; } };
    const name = "יהונתן־אליהו";
    await paintExactText({ getContext() { return context; } }, {}, name);
    assert.deepEqual(painted.map((line) => line.value), [name, ...captionLines]);
    assert.ok(painted.every((line) => line.direction === "rtl"));
    assert.deepEqual(loaded.sort(), ["MuralCaption", "MuralName"]);
    painted.length = 0;
    await paintSprayText({ getContext() { return context; } }, {}, name, "test-job");
    assert.deepEqual(painted.map((line) => line.value), [name, name, captionLines[0], captionLines[0], captionLines[1], captionLines[1]]);
    assert.ok(painted.every((line) => line.direction === "rtl" && line.font.includes("StreetLetters")));
  } finally {
    if (savedDocument) Object.defineProperty(globalThis, "document", savedDocument); else delete globalThis.document;
    if (savedFont) Object.defineProperty(globalThis, "FontFace", savedFont); else delete globalThis.FontFace;
  }
});
test("ten named photos pass; eleven are rejected", () => {
  const files = Array.from("אבגדהוזחטי", (x) => photo(`שם ${x}.jpg`));
  assert.deepEqual(validateFiles(files), []);
  assert.ok(validateFiles([...files, photo("שם נוסף.jpg")]).length);
});
test("duplicate names block the entire batch", () => assert.ok(validateFiles([photo(), photo("יהונתן אליהו.png")]).length));
test("generic, numbered and markup names are blocked", () => {
  for (const name of ["080", "WhatsApp Image", "נועה מרציאנו 3", '<img src=x onerror="bad">']) assert.equal(validName(name), false);
});
test("unsupported, empty and oversized uploads rejected", () => {
  for (const change of [{ type: "text/html" }, { size: 0 }, { size: 21 * 1024 * 1024 }]) assert.ok(validateFiles([{ ...photo(), ...change }]).length);
});
test("HTML 404 produces useful message instead of JSON parse error", async () => {
  await assert.rejects(readJson(new Response("<!doctype html>", { status: 404, headers: { "content-type": "text/html" } })), /שירות היצירה/u);
});
test("malformed JSON and API errors are handled", async () => {
  await assert.rejects(readJson(new Response("{", { headers: { "content-type": "application/json" } })), /לא תקינה/u);
  await assert.rejects(readJson(Response.json({ error: "חסר מפתח" }, { status: 503 })), /חסר מפתח/u);
});
test("no false success when the batch fails", () => {
  assert.match(batchSummary(0, 1, 3), /^לא נוצרו פוסטרים/u);
  assert.match(batchSummary(2, 1), /נוצרו 2 פוסטרים, 1 נכשלו/u);
});
test("authorization fails closed", () => {
  const env = { OPENAI_API_KEY: "test-only", STUDIO_ACCESS_CODE: "test-code-at-least-12" };
  assert.equal(configured({}), false);
  assert.equal(authorize(new Request("https://test/"), {}).status, 503);
  assert.equal(authorize(new Request("https://test/"), env).status, 401);
  assert.equal(authorize(new Request("https://test/", { headers: { Authorization: `Bearer ${env.STUDIO_ACCESS_CODE}` } }), env), null);
});
test("health and both paid/read endpoints fail closed without configuration", async () => {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    assert.equal((await (await health(new Request("https://test/"))).json()).ready, false);
    assert.equal((await generate(new Request("https://test/", { method: "POST" }))).status, 503);
    assert.equal((await job(new Request("https://test/"))).status, 503);
  } finally { if (saved !== undefined) process.env.OPENAI_API_KEY = saved; }
});
test("server rejects disguised files and accepts matching image signature", async () => {
  const request = (bytes) => {
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: "image/jpeg" }), "portrait.jpg");
    form.append("name", "יהונתן אליהו"); form.append("id", randomUUID());
    return new Request("https://test/", { method: "POST", body: form });
  };
  await assert.rejects(parsePortrait(request("<html>")), /אינו תמונת/u);
  assert.equal((await parsePortrait(request(new Uint8Array([255,216,255,224])))).name, "יהונתן אליהו");
});
test("OpenAI request preserves portrait geometry and reserves text for exact renderer", async () => {
  const result = await generateImage({ bytes: new Uint8Array([255,216,255]), type: "image/jpeg" }, "יהונתן אליהו", async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    assert.equal(options.body.getAll("image[]").length, 4);
    assert.match(options.body.get("prompt"), /NO TEXT/);
    assert.match(options.body.get("prompt"), /Simplify tonal detail, NOT facial geometry/);
    assert.match(options.body.get("prompt"), /NEVER substitute a military uniform/);
    assert.equal(options.body.get("input_fidelity"), "high");
    return Response.json({ data: [{ b64_json: "test-image" }] });
  });
  assert.equal(result, "test-image");
});
test("upstream credentials/errors are not leaked to client", async () => {
  await assert.rejects(generateImage({ bytes: new Uint8Array([255,216,255]), type: "image/jpeg" }, "שם מלא", async () => Response.json({ error: { message: "private-upstream-detail" } }, { status: 401 })), (error) => !error.message.includes("private-upstream-detail") && error.message.includes("מפתח"));
});
