export const caption = "אחים ואחיות לסמל לא שוכחים";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export function resolveArtworkName(name, aliases = {}) {
  return Object.hasOwn(aliases, name) ? aliases[name] : name;
}
export function nameFromFile(file) {
  return file.name.replace(/\.[^.]+$/u, "");
}
export function validName(name) {
  return typeof name === "string" && name.length >= 2 && name.length <= 80 &&
    /^[\p{L}\p{M} '\u2019\u05f3\u05f4\u05be".,()_-]+$/u.test(name) && /\p{L}/u.test(name) && name === name.trim() &&
    !/^(?:whatsapp|img|image|photo|dsc|pxl|screenshot)(?:\s|$)/iu.test(name);
}
export function validateFiles(files, checkNames = true) {
  const errors = [];
  const names = new Set();
  if (files.length > 10) errors.push("אפשר להעלות עד 10 תמונות בכל אצווה.");
  for (const file of files) {
    const name = nameFromFile(file);
    if (checkNames && !validName(name)) errors.push(`יש לתת לקובץ ${file.name} שם מלא, ללא מספרי תמונה או תאריכים.`);
    if (checkNames && names.has(name.toLocaleLowerCase())) errors.push(`השם ${name} מופיע יותר מפעם אחת.`);
    names.add(name.toLocaleLowerCase());
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > MAX_FILE_BYTES) errors.push(`הקובץ ${file.name} חייב להיות JPG, PNG או WEBP ועד 20MB.`);
  }
  return errors;
}
export async function readJson(response) {
  const failure = message => Object.assign(new Error(message), { status: response.status });
  if (!response.headers.get("content-type")?.includes("application/json")) throw failure("שירות היצירה לא זמין בכתובת הזו. יש להפעיל את האתר עם השרת או לפתוח את כתובת Netlify.");
  let data;
  try { data = await response.json(); } catch { throw failure("התקבלה תשובה לא תקינה מהשרת. נסו לבדוק שוב את החיבור."); }
  if (!response.ok) throw failure(data.error || "הבקשה נכשלה. נסו שוב מאוחר יותר.");
  return data;
}

export function stopsBatch(error) {
  return [401,403,429].includes(error?.status) || error?.status >= 500 ||
    ["AbortError","TimeoutError"].includes(error?.name) ||
    (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) ||
    /^(אין יתרה|מפתח OpenAI|לחשבון OpenAI|שירות OpenAI הגיע למגבלת|החיבור לשירות התמונות)/u.test(error?.message || "");
}

// Each item is attempted once, serially. Local failures do not cancel remaining items.
export async function processBatch(items, processItem, onError, stopOnGlobal = true) {
  let success=0,failed=0,attempted=0;
  for(const item of items){
    attempted++;
    try{await processItem(item,attempted);success++;}
    catch(error){
      failed++;await onError(item,error);
      if(stopOnGlobal&&stopsBatch(error))break;
    }
  }
  return {success,failed,pending:items.length-attempted};
}
export function batchSummary(success, failed, pending = 0) {
  if (!success) return `לא נוצרו פוסטרים. ${failed} נכשלו${pending ? `, ${pending} לא נשלחו` : ""}.`;
  return `נוצרו ${success} פוסטרים${failed ? `, ${failed} נכשלו` : ""}${pending ? `, ${pending} לא נשלחו` : ""}. יש לבדוק את השם, הכיתוב ודמיון הפנים לפני פרסום.`;
}
