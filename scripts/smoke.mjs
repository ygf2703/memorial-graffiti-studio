import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
const env = parseEnv(await readFile(".env", "utf8"));
const base = "https://achim-lasemel-graffiti.netlify.app";
const headers = { Authorization: `Bearer ${env.STUDIO_ACCESS_CODE}` };
const mode = process.argv[2];
if (mode === "start") {
  const forbidden = await fetch(`${base}/api/generate`, { method: "POST" });
  if (forbidden.status !== 401) throw new Error("Unauthorized generation was not blocked");
  const health = await fetch(`${base}/api/health`, { headers });
  if (!(await health.json()).authorized) throw new Error("Studio not authorized");
  const form = new FormData(), id = randomUUID();
  const source = await readFile(process.argv[3]);
  form.append("id", id); form.append("name", "יהונתן אליהו");
  form.append("image", new Blob([source], { type: "image/jpeg" }), "portrait.jpg");
  await writeFile(".netlify/smoke-job.json", JSON.stringify({ id }));
  const response = await fetch(`${base}/api/generate`, { method: "POST", headers, body: form });
  console.log(JSON.stringify({ status: response.status, job: await response.json() }));
} else {
  const { id } = JSON.parse(await readFile(".netlify/smoke-job.json", "utf8"));
  const response = await fetch(`${base}/api/job?id=${id}`, { headers });
  const job = await response.json();
  console.log(JSON.stringify({ status: response.status, job }));
  if (job.status === "completed") {
    const result = await fetch(`${base}/api/job?id=${id}&image=1`, { headers });
    if (!result.ok || !result.headers.get("content-type")?.startsWith("image/")) throw new Error("Result download failed");
    await mkdir(".netlify/smoke", { recursive: true });
    await writeFile(".netlify/smoke/יהונתן אליהו.jpg", Buffer.from(await result.arrayBuffer()));
    console.log("Image saved under .netlify/smoke (not tracked)");
  }
}
