/* ============================================================
   ScreenManager — screen navigation & cinematic transitions
   ============================================================ */
import EventBus from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';

const TRANSITION_MS = 340;

export default class ScreenManager {
  constructor() {
    this.screens = new Map();
    this.stack = [];
  }

  register(id, el, { overlay = false } = {}) {
    el.classList.add('screen');
    el.id = `screen-${id}`;
    if (overlay) el.classList.add('overlay-screen');
    this.screens.set(id, { id, el, overlay });
  }

  get current() {
    return this.stack[this.stack.length - 1] || null;
  }

  is(id) {
    return this.current === id;
  }

  has(id) {
    return this.screens.has(id);
  }

  show(id) {
    const s = this.screens.get(id);
    if (!s || this.current === id) return;

    if (s.overlay) {
      // overlays (pause / settings) stack on top without hiding the base screen
      this.stack.push(id);
      s.el.classList.add('active');
      EventBus.emit('screen:opened', { id });
    } else {
      // full screens replace the whole stack
      this.stack.forEach((sid) => this._hide(sid));
      this.stack = [id];
      s.el.classList.add('active');
    }
    StateSync(id);
    EventBus.emit('screen:changed', { id, stack: [...this.stack] });
  }

  back() {
    if (this.stack.length <= 1) return this.current;
    const id = this.stack.pop();
    this._hide(id);
    const current = this.current;
    EventBus.emit('screen:closed', { id });
    EventBus.emit('screen:changed', { id: current, stack: [...this.stack] });
    return current;
  }

  _hide(id) {
    const s = this.screens.get(id);
    if (!s) return;
    s.el.classList.remove('active');
    s.el.classList.add('leaving');
    setTimeout(() => s.el.classList.remove('leaving'), TRANSITION_MS);
  }
}

function StateSync(id) {
  try {
    StateManager.set('session.screen', id);
  } catch (e) { /* noop */ }
}
