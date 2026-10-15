// Provision this studio only. Never print credential values or API response bodies.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
const config = JSON.parse(await readFile(join(process.env.APPDATA, "netlify/Config/config.json"), "utf8"));
const token = config.users[config.userId]?.auth?.token;
if (!token) throw new Error("Netlify login required");
async function api(path, method = "GET", body) {
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Netlify ${method} ${path.split("?")[0]}: ${response.status}`);
  return response.status === 204 ? null : response.json();
}
const action = process.argv[2];
if (action === "create") {
  const repoId = Number(process.argv[3]);
  if (!repoId) throw new Error("GitHub repo id required");
  const sites = await api("/sites?per_page=100");
  let site = sites.find((s) => s.build_settings?.repo_path === "ygf2703/memorial-graffiti-studio");
  if (!site) site = await api("/ygf2703/sites", "POST", {
    name: "achim-lasemel-graffiti", force_ssl: true,
    repo: { provider: "github", repo_path: "ygf2703/memorial-graffiti-studio", repo: "ygf2703/memorial-graffiti-studio", repo_id: repoId, repo_branch: "main", installation_id: 65133189, dir: "public", cmd: "npm run check && npm test", functions_dir: "netlify/functions" },
  });
  await mkdir(".netlify", { recursive: true });
  await writeFile(".netlify/state.json", JSON.stringify({ siteId: site.id }));
  console.log(JSON.stringify({ siteId: site.id, url: site.ssl_url || site.url, repo: site.build_settings?.repo_path }));
} else {
  const { siteId } = JSON.parse(await readFile(".netlify/state.json", "utf8"));
  const site = await api(`/sites/${siteId}`);
  if (action === "rotate-access") {
    // Explicit admin action only: update the shared credential, never the OpenAI key.
    const accessCode = randomBytes(12).toString("hex").match(/.{6}/g).join("-");
    const content = await readFile(".env", "utf8");
    await writeFile(".env", content.replace(/^STUDIO_ACCESS_CODE=.*\r?\n?/gm, "").trimEnd() + `\nSTUDIO_ACCESS_CODE=${accessCode}\n`);
    await mkdir(".netlify", { recursive: true });
    await writeFile(".netlify/studio-access.txt", accessCode + "\n");
    const variable = { key: "STUDIO_ACCESS_CODE", scopes: ["functions"], values: [{ context: "all", value: accessCode }] };
    const existing = await api(`/accounts/${site.account_id}/env?site_id=${siteId}`);
    if (existing.some((x) => x.key === variable.key)) await api(`/accounts/${site.account_id}/env/${variable.key}?site_id=${siteId}`, "PUT", variable);
    else await api(`/accounts/${site.account_id}/env?site_id=${siteId}`, "POST", [variable]);
    console.log(JSON.stringify({ sharedAccessUpdated: true, credentialFile: ".netlify/studio-access.txt", redeployRequired: true }));
  } else if (action === "env") {
    let content = await readFile(".env", "utf8");
    let values = parseEnv(content);
    if (!values.STUDIO_ACCESS_CODE || values.STUDIO_ACCESS_CODE.length < 12) {
      const accessCode = randomBytes(18).toString("base64url");
      content = content.replace(/^STUDIO_ACCESS_CODE=.*\r?\n?/gm, "").trimEnd() + `\nSTUDIO_ACCESS_CODE=${accessCode}\n`;
      await writeFile(".env", content);
      values = parseEnv(content);
    }
    const variables = ["OPENAI_API_KEY", "STUDIO_ACCESS_CODE"].map((key) => ({ key, scopes: ["functions"], values: [{ context: "all", value: values[key] || "" }] }));
    variables.push({ key: "STUDIO_SITE_URL", scopes: ["functions"], values: [{ context: "all", value: site.ssl_url || site.url }] });
    const existing = await api(`/accounts/${site.account_id}/env?site_id=${siteId}`);
    for (const variable of variables) {
      if (existing.some((x) => x.key === variable.key)) await api(`/accounts/${site.account_id}/env/${variable.key}?site_id=${siteId}`, "PUT", variable);
      else await api(`/accounts/${site.account_id}/env?site_id=${siteId}`, "POST", [variable]);
    }
    console.log(JSON.stringify({ variables: variables.map((x) => ({ key: x.key, configured: Boolean(x.values[0].value) })) }));
  } else if (action === "status") {
    const deploys = await api(`/sites/${siteId}/deploys?per_page=3`);
    console.log(JSON.stringify({ url: site.ssl_url || site.url, repo: site.build_settings?.repo_path, installationId: site.build_settings?.installation_id, deploys: deploys.map((d) => ({ id: d.id, state: d.state, error: d.error_message, url: d.deploy_ssl_url, commit: d.commit_ref })) }, null, 2));
  } else if (action === "build") {
    const build = await api(`/sites/${siteId}/builds`, "POST", {});
    console.log(JSON.stringify({ buildId: build.id, deployId: build.deploy_id }));
  } else throw new Error("Unknown action");
}
