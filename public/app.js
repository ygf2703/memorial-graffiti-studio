import { nameFromFile, validateFiles, validName, readJson, batchSummary, resolveArtworkName, processBatch } from "./batch.js";
import { POSTER_LAYOUT, paintExactText } from "./poster.js";
import { SPRAY_LAYOUT, CAPTION_LAYOUT, COMPOSITED_LAYOUT, EXACT_NAME_LAYOUT, requiresApproval } from "./design.js";
import { paintFixedCaption } from "./captions.js";
import { paintSprayText } from "./spray.js";
import { savedAccessCode, rememberAccessCode } from "./access.js";
const $ = (selector) => document.querySelector(selector);
const fileInput = $("#photos"), photoList = $("#photo-list"), validation = $("#validation"), count = $("#batch-count"), generateButton = $("#generate"), progress = $("#progress"), results = $("#results");
let batch = [], busy = false, ready = false, invalid = false;
let availableNames = null, availabilityLoaded = false;
let artworkAliases = {};
const outputUrls = [];
const sourceFiles = new Map();
let accessStorage;
try { accessStorage = window.localStorage; } catch { /* Storage may be blocked. */ }
$("#access-code").value = savedAccessCode(accessStorage);
const headers = () => $("#access-code").value ? { Authorization: `Bearer ${$("#access-code").value}` } : {};
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function buttons() {
  generateButton.disabled = busy || !ready || !availabilityLoaded || invalid || !batch.length || batch.some((item) => !validName(item.name) || (availableNames && !availableNames.has(resolveArtworkName(item.name, artworkAliases))));
  for (const input of photoList.querySelectorAll("input")) input.disabled = busy;
  fileInput.disabled = busy;
  $("#check-connection").disabled = busy;
  $("#forget-access").disabled = busy;
  $("#access-code").disabled = busy;
  $("#restore").disabled = busy || !ready;
}
async function loadAvailability() {
  availabilityLoaded = false;
  buttons();
  try {
    const response = await fetch("/name-artwork/catalog.json", { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (response.status === 404) {
      availableNames = null;
      artworkAliases = {};
      $("#name-availability").textContent = "אפשר להזין שם מלא בשדה שמתחת לתמונה.";
    } else {
      const catalog = await readJson(response);
      if (!Array.isArray(catalog.names) || !catalog.names.length || catalog.names.some((name) => !validName(name))) throw new Error("רשימת השמות אינה זמינה. לחצו שוב על בדיקת חיבור.");
      availableNames = new Set(catalog.names);
      artworkAliases = catalog.aliases || {};
      if (typeof artworkAliases !== "object" || Array.isArray(artworkAliases) || Object.entries(artworkAliases).some(([alias, target]) => !validName(alias) || !availableNames.has(target) || Object.hasOwn(artworkAliases, target) || availableNames.has(alias))) throw new Error("מיפוי השמות אינו תקין. לחצו שוב על בדיקת חיבור.");
      $("#name-availability").textContent = `${availableNames.size} מתוך ${catalog.sourceCount} שמות זמינים בגרפיטי מוכן מראש. שמות נוספים יתווספו לאחר בדיקה. יש לבחור או להקליד את השם בדיוק כפי שמופיע ברשימה.`;
      $("#available-names-panel").hidden = false;
      $("#available-names-list").replaceChildren(...catalog.names.map((name) => node("li", name)));
      $("#available-names").replaceChildren(...[...catalog.names, ...Object.keys(artworkAliases)].map((name) => { const option = node("option"); option.value = name; return option; }));
    }
    availabilityLoaded = true;
  } catch (error) { $("#name-availability").textContent = error.message; }
  renderBatch();
}
async function checkConnection() {
  ready = false;
  buttons();
  $("#connection-status").textContent = "בודק חיבור…";
  try {
    const state = await readJson(await fetch("/api/health", { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(15000) }));
    ready = state.ready && state.authorized;
    $("#connection-status").textContent = ready ? "הסטודיו מחובר. אפשר ליצור פוסטרים." : state.message || "הזינו את קוד הכניסה לסטודיו ולחצו על בדיקת חיבור.";
    if (ready && !rememberAccessCode(accessStorage, $("#access-code").value)) $("#connection-status").textContent += " הדפדפן אינו מאפשר לשמור את הקוד; בכניסה הבאה יהיה צורך להזינו שוב.";
    if (ready && !availabilityLoaded) await loadAvailability();
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
    nameInput.setAttribute("list", "available-names");
    const nameStatus = node("small");
    const updateNameStatus = () => {
      const artworkName = resolveArtworkName(item.name, artworkAliases);
      const unavailable = availableNames && !availableNames.has(artworkName);
      nameStatus.textContent = unavailable ? "השם עדיין לא זמין במאגר. לא ניתן ליצור איתו תמונה כרגע." : artworkName !== item.name ? `הכיתוב בעיצוב הקיים: ${artworkName}. נוסח זה יישמר בפוסטר.` : availableNames ? "השם זמין במאגר הגרפיטי." : "";
      nameInput.setCustomValidity(!validName(item.name) ? "יש להזין שם תקין." : unavailable ? "השם עדיין לא זמין במאגר." : "");
    };
    nameInput.addEventListener("input", () => {
      item.name = nameInput.value;
      updateNameStatus();
      buttons();
    });
    nameLabel.append(nameInput);
    updateNameStatus();
    details.append(node("small", item.file.name), nameLabel, nameStatus);
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
$("#forget-access").addEventListener("click", () => {
  const removed = rememberAccessCode(accessStorage, "");
  $("#access-code").value = ""; ready = false; buttons();
  $("#connection-status").textContent = removed ? "קוד הכניסה נמחק מהדפדפן הזה." : "השדה נוקה. להסרת הקוד השמור יש לנקות את נתוני האתר בהגדרות הדפדפן.";
});

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
    if(job.status==="processing"&&job.portraitRefinementVersion===1){
      const stage={generating:"יוצר קיר ודיוקן",refining_portrait:"מדייק את הפנים מול צילום המקור",compositing:"ממקם את הכיתוב ובודק את התוצר"}[job.stage]||"מעבד";
      progress.textContent=`${job.name}: ${stage}…`;
    }
    if (job.status === "completed") {
      const response = await fetch(`/api/job?id=${encodeURIComponent(id)}&image=1`, { headers: headers(), signal: AbortSignal.timeout(60000) });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error("הפוסטר נוצר אך ההורדה נכשלה. לחצו על שחזור תוצאות.");
      return { poster: await exportPoster(await response.blob(), job), job };
    }
    if (job.status === "failed") {
      const error = new Error(job.error || "היצירה נכשלה.");
      error.jobId = id; error.canRecompose = !job.recomposeOnly && error.message.startsWith("לא נמצא מיקום בטוח");
      throw error;
    }
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
    if(job.nameSource==="literal-two-line") card.append(node("p","השם סודר אוטומטית בשתי שורות ברינדור גרפיטי מקומי מהטקסט המדויק. זהו מסלול חלופי, לא הנכס המצויר המקורי. בדקו את האיות והמראה לפני אישור.","review-note"));
    const message = review.status === "matched" ? "בדיקת האיות האוטומטית מצאה התאמה. זו אינה הבטחה — נדרש אישור חזותי לפני הורדה." : review.status === "needs_review" ? "אזהרה: הבדיקה האוטומטית מצאה חוסר התאמה או כיתוב לא ברור. אין לאשר אם חסרה או שגויה אפילו אות אחת." : "בדיקת האיות האוטומטית לא זמינה. יש לבדוק ידנית כל אות לפני אישור.";
    card.append(node("p", message, "review-note"));
    const placement = job.review?.namePlacement;
    card.append(node("p", ["clear_above", "clear_beside"].includes(placement) ? "בדיקת המיקום מצאה שהשם מעל הראש או לצדו, ללא חפיפה. יש לאמת זאת גם חזותית." : ["overlap", "not_above"].includes(placement) ? "אזהרת מיקום: השם עלול להסתיר את הראש או שמיקומו אינו בטוח. אין לאשר את התוצאה לפני בדיקה; אם יש חפיפה, פסלו ובחרו בתיקון השם." : "מיקום השם לא אומת אוטומטית. ודאו שהשם וכל הנזילות מעל הראש או לצדו, עם רווח גלוי, ואינם מסתירים פנים או שיער.", "review-note"));
    card.append(node("p", `הכיתוב הנדרש: ${job.name} | אחים ואחיות לסמל לא שוכחים`, "review-note"));
    if (job.layoutVersion === EXACT_NAME_LAYOUT) card.append(node("p", job.nameSource === "prebuilt-reviewed" ? "השם נוסף מנכס גרפיטי מוכן שנבדק מראש. בדקו קריאות, שילוב בקיר והתאמה לדמות." : `השם נוסף ישירות מהטקסט שהזנת, בסגנון גרפיטי ${job.nameVariant} מתוך ${job.nameStyleCount || 5}${job.nameStyleLabel ? ` — ${job.nameStyleLabel}` : ""}. בדקו קריאות, שילוב בקיר והתאמה לדמות.`, "review-note"));
    if (typeof review.name === "string") card.append(node("p", [CAPTION_LAYOUT, COMPOSITED_LAYOUT].includes(job.layoutVersion) ? `קריאה אוטומטית של השם (עלולה לטעות): ${review.name}. המשפט נוסף מקובץ קבוע, גרסה ${job.captionVariant} מתוך ${job.captionStyleCount || 5}, ואינו נבדק בקריאה זו.` : `קריאה אוטומטית (עלולה לטעות): ${review.name} | ${review.caption}`, "review-note"));
    const label = node("label", "", "approval"), checkbox = node("input");
    checkbox.type = "checkbox";
    checkbox.disabled = ["overlap", "not_above"].includes(placement);
    label.append(checkbox, node("span", "בדקתי אות־אות: השם והמשפט מלאים ומדויקים, השם וכל הנזילות מעל הראש או לצדו ואינם מסתירים פנים או שיער, הדגל גלוי והדמות מתאימה."));
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
    correctionPanel.append(reasonLabel, sourceLabel, node("p", job.portraitRefinementVersion===1 ? "ניסיון אחד בלבד, כולל שתי קריאות תמונה בתשלום: יצירה ודיוק פנים. אין הבטחת דיוק ואין תיקון אוטומטי נוסף." : "ניסיון אחד בלבד, כרוך בקריאת API נוספת. אין הבטחת דיוק ואין תיקון אוטומטי נוסף.", "review-note"), repair, status);
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
function showError(name, message, repairableId) {
  const card = node("article", "", "error-card");
  card.append(node("strong",name),node("p",message));
  if (repairableId) {
    const button = node("button","סידור השם מחדש — ללא יצירת דיוקן נוספת"),status = node("p","","review-note");
    button.type="button";
    button.addEventListener("click",async()=>{
      if(busy)return;
      busy=true;buttons();button.disabled=true;status.textContent="מסדר את השם על התמונה שכבר נוצרה…";
      try{
        const queued=await readJson(await fetch("/api/recompose",{method:"POST",headers:{...headers(),"content-type":"application/json"},body:JSON.stringify({id:repairableId}),signal:AbortSignal.timeout(30000)}));
        saveJob({id:queued.id,name});
        if(sourceFiles.has(repairableId))sourceFiles.set(queued.id,sourceFiles.get(repairableId));
        showResult(name,await waitForJob(queued.id));
        status.textContent="התוצאה מוצגת בכרטיס חדש ומחייבת אישור חזותי.";
      }catch(error){status.textContent=error.message;button.disabled=false;}
      finally{busy=false;buttons();}
    });
    card.append(button,status);
  }
  results.append(card);
}
async function run(items, restore = false) {
  if (!await checkConnection()) return;
  busy = true; buttons();
  let summary;
  try {
    summary=await processBatch(items,async(rawItem,attempted)=>{
      const item = restore ? rawItem : { ...rawItem, name: resolveArtworkName(rawItem.name, artworkAliases) };
      progress.textContent = `${restore ? "בודק תוצאה של" : "יוצר פוסטר עבור"} ${item.name} (${attempted} מתוך ${items.length})… יצירה עשויה להימשך כמה דקות.`;
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
      showResult(item.name, await waitForJob(id));
    },(item,error)=>{
      showError(restore?item.name:resolveArtworkName(item.name,artworkAliases),error.message,error.canRecompose?error.jobId:null);
    },!restore);
  } finally {
    progress.textContent = summary ? batchSummary(summary.success,summary.failed,summary.pending) : "האצווה הופסקה עקב שגיאה בלתי צפויה. שחזרו תוצאות לפני יצירה נוספת.";
    busy = false; buttons();
  }
}
generateButton.addEventListener("click", () => run([...batch]));
$("#restore").addEventListener("click", () => run(savedJobs(), true));
$("#restore").hidden = !savedJobs().length;
$("#connection-status").textContent = $("#access-code").value ? "קוד הכניסה השמור נטען. לחצו על בדיקת חיבור." : "הזינו את קוד הכניסה ולחצו על בדיקת חיבור. לאחר אימות הוא יישמר בדפדפן הזה.";
buttons();
loadAvailability();
