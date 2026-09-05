/* ============================================================
   StateManager — serializable global app state
   ============================================================ */
import { DEFAULT_SETTINGS, DEFAULT_PROFILE } from './Config.js';

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

class StateManager {
  constructor() {
    this.state = {
      settings: deepClone(DEFAULT_SETTINGS),
      profile: deepClone(DEFAULT_PROFILE),
      session: { screen: 'loading', battleActive: false }
    };
    this._listeners = new Set();
  }

  get(path, fallback = undefined) {
    const parts = path.split('.');
    let node = this.state;
    for (const p of parts) {
      if (node == null || typeof node !== 'object') return fallback;
      node = node[p];
    }
    return node === undefined ? fallback : node;
  }

  set(path, value) {
    const parts = path.split('.');
    let node = this.state;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof node[parts[i]] !== 'object' || node[parts[i]] == null) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
    this._listeners.forEach((fn) => fn(path, value));
  }

  merge(path, obj) {
    const current = this.get(path, {}) || {};
    this.set(path, { ...current, ...obj });
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  serialize() {
    return deepClone(this.state);
  }

  hydrate(section, data) {
    if (data && typeof data === 'object') {
      this.state[section] = { ...deepClone(this._defaultsFor(section)), ...data };
    }
  }

  _defaultsFor(section) {
    if (section === 'settings') return DEFAULT_SETTINGS;
    if (section === 'profile') return DEFAULT_PROFILE;
    return {};
  }

  resetSection(section) {
    this.state[section] = deepClone(this._defaultsFor(section));
  }
}

const stateManager = new StateManager();
export default stateManager;
