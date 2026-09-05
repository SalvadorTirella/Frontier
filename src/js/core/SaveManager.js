/* ============================================================
   SaveManager — localStorage persistence + Supabase-ready hooks
   ============================================================ */
import StateManager from './StateManager.js';
import EventBus from './EventBus.js';
import { STORAGE_KEYS, RANKS, rankForXp } from './Config.js';
import { storageGet, storageSet, storageClearApp } from '../utils/StorageUtils.js';

const SaveManager = {
  /* ---------- load everything into StateManager ---------- */
  load() {
    const settings = storageGet(STORAGE_KEYS.settings, null);
    const profile = storageGet(STORAGE_KEYS.profile, null);
    if (settings) StateManager.hydrate('settings', settings);
    if (profile) StateManager.hydrate('profile', profile);
    EventBus.emit('save:loaded', { settings: !!settings, profile: !!profile });
  },

  saveSettings() {
    storageSet(STORAGE_KEYS.settings, StateManager.get('settings'));
  },

  saveProfile() {
    storageSet(STORAGE_KEYS.profile, StateManager.get('profile'));
    EventBus.emit('profile:updated', StateManager.get('profile'));
  },

  /* ---------- profile helpers ---------- */
  recordBattle(stats, victory) {
    const p = StateManager.get('profile');
    p.battles += 1;
    p.kills += stats.kills;
    p.deployed += stats.deployed;
    if (victory) p.wins += 1;
    p.bestWave = Math.max(p.bestWave, stats.wavesCleared);
    const before = rankForXp(p.xp).name;
    p.xp += stats.xp;
    const after = rankForXp(p.xp);
    this.saveProfile();
    return { rankUp: after.name !== before, rank: after.name, newXp: p.xp };
  },

  resetAll() {
    storageClearApp();
    StateManager.resetSection('settings');
    StateManager.resetSection('profile');
    this.saveSettings();
    this.saveProfile();
    EventBus.emit('save:reset');
  },

  exportSave() {
    return JSON.stringify(StateManager.serialize(), null, 2);
  },

  /* ---------- Supabase OAuth (prepared, offline for now) ---------- */
  async syncRemote() {
    // Ready hook: swap in supabase.auth.signInWithOAuth({ provider:'google' })
    // then supabase.from('profiles').upsert(StateManager.get('profile')).
    // Milestone runs fully offline — local save is authoritative.
    await new Promise((r) => setTimeout(r, 400));
    return { ok: false, reason: 'offline-mode' };
  }
};

export default SaveManager;
export { RANKS };
