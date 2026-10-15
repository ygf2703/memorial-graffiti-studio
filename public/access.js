const key = "graffiti-studio-access-code";
export function savedAccessCode(storage) {
  try { return storage.getItem(key) || ""; } catch { return ""; }
}
export function rememberAccessCode(storage, code) {
  try {
    if (code) storage.setItem(key, code);
    else storage.removeItem(key);
    return true;
  } catch { return false; }
}
