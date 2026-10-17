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
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("שירות היצירה לא זמין בכתובת הזו. יש להפעיל את האתר עם השרת או לפתוח את כתובת Netlify.");
  let data;
  try { data = await response.json(); } catch { throw new Error("התקבלה תשובה לא תקינה מהשרת. נסו לבדוק שוב את החיבור."); }
  if (!response.ok) throw new Error(data.error || "הבקשה נכשלה. נסו שוב מאוחר יותר.");
  return data;
}
export function batchSummary(success, failed, pending = 0) {
  if (!success) return `לא נוצרו פוסטרים. ${failed} נכשלו${pending ? `, ${pending} לא נשלחו` : ""}.`;
  return `נוצרו ${success} פוסטרים${failed ? `, ${failed} נכשלו` : ""}${pending ? `, ${pending} לא נשלחו` : ""}. יש לבדוק את השם, הכיתוב ודמיון הפנים לפני פרסום.`;
}
