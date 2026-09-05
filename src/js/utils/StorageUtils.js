/* ============================================================
   StorageUtils — safe localStorage JSON wrappers
   ============================================================ */
const PREFIX = '';

export function storageGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[Storage] read failed', key, e);
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('[Storage] write failed', key, e);
    return false;
  }
}

export function storageRemove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch (e) {
    /* noop */
  }
}

export function storageClearApp() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('tab:'))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    /* noop */
  }
}
