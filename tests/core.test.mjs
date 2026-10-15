import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { nameFromFile, validateFiles, validName, readJson, batchSummary, caption } from "../public/batch.js";
import { fitText, captionLines, POSTER_LAYOUT, paintExactText } from "../public/poster.js";
import { authorize, parsePortrait, generateImage, configured } from "../server/core.mjs";
import { muralDesign, seededRandom, requiresApproval, INTEGRATED_LAYOUT, SPRAY_LAYOUT } from "../public/design.js";
import { compareReading, reviewImage } from "../server/review.mjs";
import { muralPrompt } from "../server/prompt.mjs";
import { paintSprayText } from "../public/spray.js";
import health from "../netlify/functions/health.mjs";
import generate from "../netlify/functions/generate.mjs";
import job from "../netlify/functions/job.mjs";
import { captionVariant, CAPTION_LAYOUT } from "../public/design.js";
import { paintFixedCaption } from "../public/captions.js";
import { readFileSync } from "node:fs";
test("five fixed caption choices are stable, bounded and all reachable", () => {
  const choices = new Set();
  for (let i = 0; i < 1000; i++) { const seed = `job-${i}`, value = captionVariant(seed); assert.equal(value, captionVariant(seed)); assert.ok(value >= 1 && value <= 5); choices.add(value); }
  assert.equal(choices.size, 5);
  assert.equal(requiresApproval({ layoutVersion: CAPTION_LAYOUT }), true);
  for (const choice of choices) { const png = readFileSync(new URL(`../public/captions/caption-${choice}.png`, import.meta.url)); assert.equal(png.subarray(1, 4).toString(), "PNG"); assert.equal(png[25], 6); }
});
test("fixed caption prompt reserves wall and does not generate the slogan", () => {
  const prompt = muralPrompt("seed", "יהונתן אליהו", true);
  assert.match(prompt, /bottom 32%/); assert.match(prompt, /יהונתן אליהו/);
  assert.ok(!prompt.includes(caption));
  assert.equal(compareReading({ name: "יהונתן אליהו", caption: "", uncertain: false, flagPresent: true }, "יהונתן אליהו", true).status, "matched");
  assert.equal(compareReading({ name: "יהונתן אליהו", caption, uncertain: false, flagPresent: true }, "יהונתן אליהו", true).status, "needs_review");
});
test("fixed caption renderer places one asset inside its reserved area and fails closed", async () => {
  const previous = globalThis.Image, calls = [];
  try {
    globalThis.Image = class { naturalWidth = 2000; naturalHeight = 800; async decode() {} };
    const canvas = { getContext() { return { save() {}, restore() {}, drawImage(...args) { calls.push(args); } }; } };
    await paintFixedCaption(canvas, 3);
    assert.equal(calls.length, 1); assert.equal(calls[0][0].src, "/captions/caption-3.png");
    const [, x, y, width, height] = calls[0]; assert.ok(x >= 0 && y >= 1080 * .68 && x + width <= 1080 && y + height <= 1080);
    await assert.rejects(paintFixedCaption(canvas, 6));
    globalThis.Image = class { async decode() { throw new Error("missing"); } };
    await assert.rejects(paintFixedCaption(canvas, 1), /לא נטען/);
  } finally { if (previous) globalThis.Image = previous; else delete globalThis.Image; }
});
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
    const prompt = muralPrompt(`job-${i}`, "יהונתן אליהו");
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
test("OpenAI request generates both literal inscriptions as part of one mural", async () => {
  const result = await generateImage({ bytes: new Uint8Array([255,216,255]), type: "image/jpeg" }, "יהונתן אליהו", async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    assert.equal(options.body.getAll("image[]").length, 4);
    assert.match(options.body.get("prompt"), /ONE coherent mural/);
    assert.match(options.body.get("prompt"), /יהונתן אליהו/u);
    assert.match(options.body.get("prompt"), /אחים ואחיות לסמל לא שוכחים/u);
    assert.doesNotMatch(options.body.get("prompt"), /Our renderer adds|NO TEXT|for separately rendered lettering/);
    assert.match(options.body.get("prompt"), /Simplify tonal detail, NOT facial geometry/);
    assert.match(options.body.get("prompt"), /NEVER substitute a military uniform/);
    assert.equal(options.body.get("input_fidelity"), "high");
    return Response.json({ data: [{ b64_json: "test-image" }] });
  });
  assert.equal(result, "test-image");
});
test("new integrated murals require human approval even after matching OCR", () => {
  assert.equal(requiresApproval({ layoutVersion: INTEGRATED_LAYOUT, review: { status: "matched" } }), true);
  for (const layoutVersion of [undefined, POSTER_LAYOUT, SPRAY_LAYOUT]) assert.equal(requiresApproval({ layoutVersion }), false);
});
test("reading comparison rejects wrong letters, missing words, uncertainty and missing flag", () => {
  const reading = { name: "יהונתן אליהו", caption, uncertain: false, flagPresent: true };
  assert.equal(compareReading(reading, reading.name).status, "matched");
  assert.equal(compareReading({ ...reading, caption: "אחים ואחיות\nלסמל לא שוכחים" }, reading.name).status, "matched");
  for (const patch of [{ name: "יונתן אליהו" }, { caption: "אחים ואחיות לסמל שוכחים" }, { uncertain: true }, { flagPresent: false }]) assert.equal(compareReading({ ...reading, ...patch, status: "matched" }, reading.name).status, "needs_review");
  assert.equal(compareReading({ name: reading.name }, reading.name).status, "unavailable");
});
test("vision reader receives only the generated image, not expected text", async () => {
  const reading = { name: "יהונתן אליהו", caption, uncertain: false, flagPresent: true };
  const result = await reviewImage("image-bytes", reading.name, async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.reasoning.effort, "none");
    assert.equal(body.input[0].content[0].image_url, "data:image/jpeg;base64,image-bytes");
    assert.equal(body.text.format.strict, true);
    assert.ok(!options.body.includes(reading.name) && !options.body.includes(caption));
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(reading) }] }] });
  });
  assert.equal(result.status, "matched");
});
test("review errors and refusals never masquerade as matched and never leak details", async () => {
  for (const payload of [{ status: "incomplete" }, { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "private" }] }] }, { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "not json private" }] }] }]) assert.deepEqual(await reviewImage("test", "שם מלא", async () => Response.json(payload)), { status: "unavailable" });
  assert.deepEqual(await reviewImage("test", "שם מלא", async () => { throw new Error("secret"); }), { status: "unavailable" });
  assert.deepEqual(await reviewImage("test", "שם מלא", async () => Response.json({ error: "secret" }, { status: 429 })), { status: "unavailable" });
});
test("upstream credentials/errors are not leaked to client", async () => {
  await assert.rejects(generateImage({ bytes: new Uint8Array([255,216,255]), type: "image/jpeg" }, "שם מלא", async () => Response.json({ error: { message: "private-upstream-detail" } }, { status: 401 })), (error) => !error.message.includes("private-upstream-detail") && error.message.includes("מפתח"));
});
