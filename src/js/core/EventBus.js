/* ============================================================
   EventBus — global pub/sub for total module decoupling
   ============================================================ */
class EventBus {
  constructor() {
    this._map = new Map();
  }

  on(event, fn) {
    if (!this._map.has(event)) this._map.set(event, new Set());
    this._map.get(event).add(fn);
    return () => this.off(event, fn);
  }

  once(event, fn) {
    const wrap = (payload) => {
      this.off(event, wrap);
      fn(payload);
    };
    return this.on(event, wrap);
  }

  off(event, fn) {
    const set = this._map.get(event);
    if (set) set.delete(fn);
  }

  emit(event, payload) {
    const set = this._map.get(event);
    if (!set) return;
    // copy to allow handlers to unsubscribe safely
    [...set].forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[EventBus] handler error on "${event}"`, err);
      }
    });
  }

  clear() {
    this._map.clear();
  }
}

const bus = new EventBus();
export default bus;
