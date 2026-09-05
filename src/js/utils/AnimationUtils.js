/* ============================================================
   AnimationUtils — JS-driven transitions & FX helpers
   ============================================================ */
import { easeOutCubic, clamp } from './DOMUtils.js';

/* Count-up / count-down a numeric readout */
export function animateNumber(el, to, { dur = 400, fmt = (v) => Math.round(v), from = null } = {}) {
  if (!el) return;
  const start = from != null ? from : parseFloat(el.dataset.v ?? el.textContent) || 0;
  el.dataset.v = to;
  if (el._raf) cancelAnimationFrame(el._raf);
  const t0 = performance.now();
  const step = (now) => {
    const t = clamp((now - t0) / dur, 0, 1);
    el.textContent = fmt(start + (to - start) * easeOutCubic(t));
    if (t < 1) el._raf = requestAnimationFrame(step);
    else el._raf = null;
  };
  el._raf = requestAnimationFrame(step);
}

/* Staggered entrance for children matching selector */
export function staggerIn(container, selector = '[data-anim]', base = 60) {
  if (!container) return;
  container.querySelectorAll(selector).forEach((el, i) => {
    el.classList.remove('rise-in');
    el.style.animationDelay = `${i * base}ms`;
    // force reflow so the animation restarts
    void el.offsetWidth;
    el.classList.add('rise-in');
  });
}

/* Restart a CSS animation class */
export function retrigger(el, cls, duration = 600) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  if (duration) setTimeout(() => el.classList.remove(cls), duration);
}

/* Floating combat text into an fx layer (stage coordinates) */
export function spawnFloat(layer, x, y, text, cls = '') {
  if (!layer) return;
  if (layer.childElementCount > 30) layer.firstElementChild?.remove();
  const el = document.createElement('div');
  el.className = `dmg-float ${cls}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.addEventListener('animationend', () => el.remove());
  layer.appendChild(el);
}

/* Shake an element (stage-level screen shake handled separately) */
export function shakeEl(el, cls = 'shake-x', ms = 350) {
  retrigger(el, cls, ms);
}
