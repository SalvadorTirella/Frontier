/* ============================================================
   DOMUtils — DOM helpers + tiny math kit
   ============================================================ */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function make(tag, className = '', html = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (html) el.innerHTML = html;
  return el;
}

export function on(el, ev, fn, opts) {
  if (!el) return () => {};
  el.addEventListener(ev, fn, opts);
  return () => el.removeEventListener(ev, fn, opts);
}

export function setTxt(el, v) {
  if (el && el.textContent !== String(v)) el.textContent = v;
}

export function clearEl(el) {
  if (el) el.innerHTML = '';
}

/* ---------- math kit ---------- */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const pad2 = (n) => String(Math.max(0, Math.floor(n))).padStart(2, '0');
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${pad2(s / 60)}:${pad2(s % 60)}`;
}

export function weightedPick(items, weightFn) {
  const total = items.reduce((s, it) => s + weightFn(it), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= weightFn(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
