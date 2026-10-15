import { nameFromFile, validateFiles, validName, readJson, batchSummary } from "./batch.js";
import { POSTER_LAYOUT, paintExactText } from "./poster.js";
import { SPRAY_LAYOUT, CAPTION_LAYOUT, COMPOSITED_LAYOUT, requiresApproval } from "./design.js";
import { paintFixedCaption } from "./captions.js";
import { paintSprayText } from "./spray.js";
const $ = (selector) => document.querySelector(selector);
const fileInput = $("#photos"), photoList = $("#photo-list"), validation = $("#validation"), count = $("#batch-count"), generateButton = $("#generate"), progress = $("#progress"), results = $("#results");
let batch = [], busy = false, ready = false, invalid = false;
const outputUrls = [];
const sourceFiles = new Map();
const headers = () => $("#access-code").value ? { Authorization: `Bearer ${$("#access-code").value}` } : {};
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function buttons() {
  generateButton.disabled = busy || !ready || invalid || !batch.length || batch.some((item) => !validName(item.name));
  for (const input of photoList.querySelectorAll("input")) input.disabled = busy;
  fileInput.disabled = busy;
  $("#check-connection").disabled = busy;
  $("#access-code").disabled = busy;
  $("#restore").disabled = busy || !ready;
}
async function checkConnection() {
  ready = false;
  buttons();
  $("#connection-status").textContent = "בודק חיבור…";
  try {
    const state = await readJson(await fetch("/api/health", { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(15000) }));
    ready = state.ready && state.authorized;
    $("#connection-status").textContent = ready ? "הסטודיו מחובר. אפשר ליצור פוסטרים." : state.message || "הזינו את קוד הכניסה לסטודיו ולחצו על בדיקת חיבור.";
  } catch (error) { $("#connection-status").textContent = error.message; }
  buttons();
  return ready;
}
function renderBatch() {
  count.textContent = `${batch.length} / 10`;
  photoList.replaceChildren();
  photoList.classList.toggle("empty-state", !batch.length);
  if (!batch.length) photoList.textContent = "עדיין לא נבחרו תמונות.";
  for (const item of batch) {
    const card = node("article", "", "photo-card"), img = node("img"), details = node("div");
    img.src = item.preview; img.alt = `תצוגה מקדימה של ${item.name}`;
    const nameLabel = node("label", "השם שיופיע בגרפיטי"), nameInput = node("input");
    nameInput.type = "text"; nameInput.value = item.name; nameInput.dir = "rtl";
    nameInput.required = true; nameInput.maxLength = 80;
    nameInput.addEventListener("input", () => {
      item.name = nameInput.value;
      nameInput.setCustomValidity(validName(item.name) ? "" : "יש להזין שם תקין.");
      buttons();
    });
    nameLabel.append(nameInput);
    details.append(node("small", item.file.name), nameLabel);
    card.append(img, details); photoList.append(card);
  }
  buttons();
}
fileInput.addEventListener("change", () => {
  for (const item of batch) URL.revokeObjectURL(item.preview);
  const files = [...fileInput.files], errors = validateFiles(files, false);
  invalid = errors.length > 0;
  batch = files.slice(0, 10).map((file) => ({ file, name: validName(nameFromFile(file)) ? nameFromFile(file) : "", preview: URL.createObjectURL(file) }));
  validation.textContent = errors.join(" ");
  renderBatch();
});
$("#check-connection").addEventListener("click", checkConnection);
$("#access-code").addEventListener("input", () => { ready = false; buttons(); });

async function loadImage(blob) {
  const url = URL.createObjectURL(blob), image = new Image();
  try { image.src = url; await image.decode(); return image; } finally { URL.revokeObjectURL(url); }
}
async function prepareUpload(file) {
  const image = await loadImage(file), scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .92));
  if (!blob || blob.size > 3 * 1024 * 1024) throw new Error("לא ניתן להכין את התמונה לשליחה. נסו תמונה קטנה יותר.");
  return blob;
}
async function exportPoster(blob, job) {
  const image = await loadImage(blob), canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1080;
  canvas.getContext("2d").drawImage(image, 0, 0, 1080, 1080);
  if (job.layoutVersion === POSTER_LAYOUT) await paintExactText(canvas, image, job.name);
  if (job.layoutVersion === SPRAY_LAYOUT) await paintSprayText(canvas, image, job.name, job.designSeed);
  if (job.layoutVersion === CAPTION_LAYOUT) await paintFixedCaption(canvas, job.captionVariant);
  const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!png) throw new Error("שמירת הפוסטר נכשלה.");
  const url = URL.createObjectURL(png); outputUrls.push(url); return url;
}
function savedJobs() {
  try { return JSON.parse(sessionStorage.getItem("graffiti-jobs") || "[]").filter((x) => x.id && x.name); } catch { return []; }
}
function saveJob(job) {
  try { sessionStorage.setItem("graffiti-jobs", JSON.stringify([...savedJobs().filter((x) => x.id !== job.id), job].slice(-30))); } catch { /* Generation also works without browser storage. */ }
  $("#restore").hidden = false;
}
async function waitForJob(id) {
  const deadline = Date.now() + 16 * 60 * 1000;
  while (Date.now() < deadline) {
    const job = await readJson(await fetch(`/api/job?id=${encodeURIComponent(id)}`, { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(20000) }));
    if (job.status === "completed") {
      const response = await fetch(`/api/job?id=${encodeURIComponent(id)}&image=1`, { headers: headers(), signal: AbortSignal.timeout(60000) });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error("הפוסטר נוצר אך ההורדה נכשלה. לחצו על שחזור תוצאות.");
      return { poster: await exportPoster(await response.blob(), job), job };
    }
    if (job.status === "failed") throw new Error(job.error || "היצירה נכשלה.");
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  throw new Error("ההמתנה הסתיימה. אפשר לבדוק שוב באמצעות שחזור תוצאות, ללא יצירה נוספת.");
}
function showResult(name, { poster, job }) {
  const card = node("article", "", "result-card"), image = node("img"), info = node("div"), link = node("a", "הורדת PNG");
  image.src = poster; image.alt = `פוסטר גרפיטי של ${name}`;
  link.download = `${name}-1080.png`; link.href = poster;
  info.append(node("strong", name), link); card.append(image, info);
  if (requiresApproval(job)) {
    // Review is an editorial safeguard, not an access-control boundary.
    link.hidden = true;
    const review = job.review || { status: "unavailable" };
    const message = review.status === "matched" ? "בדיקת האיות האוטומטית מצאה התאמה. זו אינה הבטחה — נדרש אישור חזותי לפני הורדה." : review.status === "needs_review" ? "אזהרה: הבדיקה האוטומטית מצאה חוסר התאמה או כיתוב לא ברור. אין לאשר אם חסרה או שגויה אפילו אות אחת." : "בדיקת האיות האוטומטית לא זמינה. יש לבדוק ידנית כל אות לפני אישור.";
    card.append(node("p", message, "review-note"));
    card.append(node("p", `הכיתוב הנדרש: ${job.name} | אחים ואחיות לסמל לא שוכחים`, "review-note"));
    if (typeof review.name === "string") card.append(node("p", [CAPTION_LAYOUT, COMPOSITED_LAYOUT].includes(job.layoutVersion) ? `קריאה אוטומטית של השם (עלולה לטעות): ${review.name}. המשפט נוסף מקובץ קבוע, גרסה ${job.captionVariant} מתוך 5, ואינו נבדק בקריאה זו.` : `קריאה אוטומטית (עלולה לטעות): ${review.name} | ${review.caption}`, "review-note"));
    const label = node("label", "", "approval"), checkbox = node("input");
    checkbox.type = "checkbox";
    label.append(checkbox, node("span", "בדקתי אות־אות: השם והמשפט מלאים ומדויקים, הדגל גלוי והדמות מתאימה."));
    checkbox.addEventListener("change", () => { link.hidden = !checkbox.checked; });
    const reject = node("button", "פסילת התוצאה", "reject-result");
    reject.type = "button";
    const correctionPanel = node("div", "", "correction-panel"), reason = node("select"), reasonLabel = node("label", "סיבת הפסילה"), repair = node("button", "תיקון חד־פעמי"), status = node("p", "", "review-note");
    for (const [value, text] of [["", "בחרו סיבה"], ["portrait", "תמונה לא מדויקת"], ["name", "שם שלא כתוב כראוי"]]) {
      const option = node("option", text); option.value = value; reason.append(option);
    }
    reasonLabel.append(reason);
    const sourceLabel = node("label", "תמונת המקור לתיקון"), source = node("input");
    source.type = "file"; source.accept = "image/jpeg,image/png,image/webp";
    sourceLabel.append(source); sourceLabel.hidden = sourceFiles.has(job.id);
    repair.type = "button";
    correctionPanel.append(reasonLabel, sourceLabel, node("p", "ניסיון אחד בלבד, כרוך בקריאת API נוספת. אין הבטחת דיוק ואין תיקון אוטומטי נוסף.", "review-note"), repair, status);
    correctionPanel.hidden = true;
    if (job.parentId) {
      correctionPanel.replaceChildren(node("p", "ניסיון התיקון היחיד נוצל. אפשר לפסול תוצאה זו, אך לא לתקן אותה שוב.", "review-note"));
    } else if (job.correction) {
      repair.textContent = "הצגת ניסיון התיקון הקיים";
      reason.value = job.correction.reason; reason.disabled = true; sourceLabel.hidden = true;
    }
    repair.addEventListener("click", async () => {
      if (busy) { status.textContent = "המתינו לסיום הפעולה הנוכחית."; return; }
      const file = sourceFiles.get(job.id) || source.files[0];
      if (!job.correction && (!reason.value || !file)) { status.textContent = "בחרו סיבת פסילה ותמונת מקור."; return; }
      busy = true; buttons(); repair.disabled = true; reason.disabled = true; source.disabled = true;
      status.textContent = "מעבד תיקון… הפעולה עשויה להימשך כמה דקות.";
      try {
        let id = job.correction?.id;
        if (!id) {
          const form = new FormData();
          form.append("image", await prepareUpload(file), "portrait.jpg"); form.append("name", job.name); form.append("id", job.id);
          const accepted = await readJson(await fetch(`/api/correct?reason=${reason.value}`, { method: "POST", headers: headers(), body: form, signal: AbortSignal.timeout(30000) }));
          id = accepted.id; job.correction = { id, reason: reason.value };
        } else {
          await readJson(await fetch(`/api/correct?resume=${encodeURIComponent(job.id)}`, { method: "POST", headers: headers(), signal: AbortSignal.timeout(30000) }));
        }
        saveJob({ id, name: job.name });
        showResult(job.name, await waitForJob(id));
        status.textContent = "התיקון מוצג בכרטיס חדש ומחייב בדיקה ואישור.";
      } catch (error) { status.textContent = error.message; }
      finally { busy = false; buttons(); repair.disabled = false; reason.disabled = Boolean(job.correction); source.disabled = false; if (job.correction) repair.textContent = "הצגת ניסיון התיקון הקיים"; }
    });
    reject.addEventListener("click", () => {
      checkbox.checked = false; checkbox.disabled = true; link.hidden = true; reject.disabled = true;
      correctionPanel.hidden = false;
    });
    card.append(label, reject, correctionPanel);
    if (job.correction) reject.click();
  } else card.append(node("p", "לפני פרסום: בדקו את השם ואת המשפט אחים ואחיות לסמל לא שוכחים.", "review-note"));
  results.append(card);
}
function showError(name, message) {
  const card = node("article", "", "error-card");
  card.append(node("strong", name), node("p", message)); results.append(card);
}
async function run(items, restore = false) {
  if (!await checkConnection()) return;
  busy = true; buttons();
  let success = 0, failed = 0, attempted = 0;
  try {
    for (const item of items) {
      attempted++;
      progress.textContent = `${restore ? "בודק תוצאה של" : "יוצר פוסטר עבור"} ${item.name} (${attempted} מתוך ${items.length})… יצירה עשויה להימשך כמה דקות.`;
      try {
        let id = item.id;
        if (!restore) {
          id = crypto.randomUUID();
          sourceFiles.set(id, item.file);
          const form = new FormData();
          form.append("image", await prepareUpload(item.file), "portrait.jpg"); form.append("name", item.name); form.append("id", id);
          // Save before sending so an uncertain network outcome can be checked without another paid call.
          saveJob({ id, name: item.name });
          await readJson(await fetch("/api/generate", { method: "POST", headers: headers(), body: form, signal: AbortSignal.timeout(30000) }));
        }
        showResult(item.name, await waitForJob(id)); success++;
      } catch (error) {
        showError(item.name, error.message); failed++;
        if (!restore) break;
      }
    }
  } finally {
    progress.textContent = batchSummary(success, failed, items.length - attempted);
    busy = false; buttons();
  }
}
generateButton.addEventListener("click", () => run([...batch]));
$("#restore").addEventListener("click", () => run(savedJobs(), true));
$("#restore").hidden = !savedJobs().length;
checkConnection();
