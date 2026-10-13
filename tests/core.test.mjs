import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { nameFromFile, validateFiles, validName, readJson, batchSummary } from "../public/batch.js";
import { authorize, parsePortrait, generateImage, configured } from "../server/core.mjs";
import health from "../netlify/functions/health.mjs";
import generate from "../netlify/functions/generate.mjs";
import job from "../netlify/functions/job.mjs";
const photo = (name = "יהונתן אליהו.jpg") => ({ name, type: "image/jpeg", size: 100 });
test("filename supplies the Hebrew name", () => assert.equal(nameFromFile(photo("יהונתן-אליהו.jpeg")), "יהונתן אליהו"));
test("ten named photos pass; eleven are rejected", () => {
  const files = Array.from("אבגדהוזחטי", (x) => photo(`שם ${x}.jpg`));
  assert.deepEqual(validateFiles(files), []);
  assert.ok(validateFiles([...files, photo("שם נוסף.jpg")]).length);
});
test("duplicate normalized names block the entire batch", () => assert.ok(validateFiles([photo(), photo("יהונתן-אליהו.png")]).length));
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
test("OpenAI request includes portrait, three references and exact required wording", async () => {
  const result = await generateImage({ bytes: new Uint8Array([255,216,255]), type: "image/jpeg" }, "יהונתן אליהו", async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    assert.equal(options.body.getAll("image[]").length, 4);
    assert.match(options.body.get("prompt"), /אחים ואחיות לסמל לא שוכחים/u);
    assert.match(options.body.get("prompt"), /יהונתן אליהו/u);
    return Response.json({ data: [{ b64_json: "test-image" }] });
  });
  assert.equal(result, "test-image");
});
test("upstream credentials/errors are not leaked to client", async () => {
  await assert.rejects(generateImage({ bytes: new Uint8Array([255,216,255]), type: "image/jpeg" }, "שם מלא", async () => Response.json({ error: { message: "private-upstream-detail" } }, { status: 401 })), (error) => !error.message.includes("private-upstream-detail") && error.message.includes("מפתח"));
});
