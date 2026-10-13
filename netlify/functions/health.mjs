import { authorize, configured, json } from "../../server/core.mjs";
export default async (request) => {
  if (request.method !== "GET") return json({ error: "הפעולה אינה נתמכת." }, 405);
  if (!configured()) return json({ ready: false, message: "היצירה עדיין לא פעילה: חסרים מפתח OpenAI או קוד כניסה בהגדרות השרת." });
  if (!request.headers.has("authorization")) return json({ ready: true, authorized: false });
  return authorize(request) || json({ ready: true, authorized: true });
};
