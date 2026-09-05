/* ============================================================
   TACTICAL ARMY BATTLE — Global Config & Balance Data
   ============================================================ */

export const BASE_W = 1280;
export const BASE_H = 720;

export const COLORS = {
  cyan: '#00C6FF',
  amber: '#FFD700',
  red: '#FF4757',
  green: '#3DFF8C',
  bg: '#04070d'
};

/* ---------- GRAPHICS QUALITY PRESETS ---------- */
export const QUALITY_PRESETS = {
  LOW:    { particles: false, glow: false, shadows: false, hardwareScaling: 2.0 },
  MEDIUM: { particles: true,  glow: true,  shadows: false, hardwareScaling: 1.5 },
  HIGH:   { particles: true,  glow: true,  shadows: true,  hardwareScaling: 1.0 },
  ULTRA:  { particles: true,  glow: true,  shadows: true,  hardwareScaling: 0.75 }
};
export const PRESET_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];

export const DEFAULT_SETTINGS = {
  quality: 'HIGH',
  particles: true,
  glow: true,
  shadows: true,
  bgAnim: true,
  screenShake: true,
  master: 80,
  music: 55,
  sfx: 85
};

/* ---------- UNIT ROSTER ---------- */
export const UNIT_TYPES = [
  { id: 'rifleman',  name: 'RIFLEMAN',  cost: 100, hp: 78,  dmg: 9,  range: 8,  rate: 0.85, speed: 3.5,  supply: 1, size: 1.0,  hotkey: '1' },
  { id: 'gunner',    name: 'GUNNER',    cost: 240, hp: 135, dmg: 16, range: 9,  rate: 0.55, speed: 2.8,  supply: 2, size: 1.12, hotkey: '2' },
  { id: 'tank',      name: 'TANK',      cost: 520, hp: 380, dmg: 34, range: 7,  rate: 1.35, speed: 1.75, supply: 4, size: 1.5,  hotkey: '3' },
  { id: 'artillery', name: 'ARTILLERY', cost: 850, hp: 170, dmg: 62, range: 14, rate: 2.2,  speed: 1.35, supply: 3, size: 1.22, hotkey: '4', splash: 2.7 }
];

export const ABILITY = { id: 'airstrike', name: 'AIRSTRIKE', cooldown: 25, dmg: 150, radius: 6.5, hotkey: 'SPACE' };

/* ---------- ECONOMY ---------- */
export const ECONOMY = {
  start: 300,
  income: 12.5,        // credits / sec
  incomePerWave: 2.2,  // extra income per wave index
  killRatio: 0.42,     // refund ratio of killed unit cost
  waveBonus: 170,
  supplyCap: 42
};

export const BASES = { player: { hp: 1000 }, enemy: { hp: 2600 } };

export const BATTLE = {
  spawnX: 27,
  baseX: 30,
  laneMin: -6.5,
  laneMax: 6.5,
  finalWave: 5,
  unitCap: 64,
  comboWindow: 2.6
};

/* Wave generator */
export function waveDef(i) {
  return {
    budget: Math.round(430 * Math.pow(i + 1, 1.38)),
    interval: Math.max(0.82, 1.75 - i * 0.16),
    heavy: Math.min(0.5, 0.08 + i * 0.085),
    hpScale: 1 + i * 0.16,
    dmgScale: 1 + i * 0.1
  };
}

/* ---------- PROFILE / RANKS ---------- */
export const RANKS = [
  { name: 'RECRUIT',    xp: 0 },
  { name: 'PRIVATE',    xp: 400 },
  { name: 'CORPORAL',   xp: 1000 },
  { name: 'SERGEANT',   xp: 2000 },
  { name: 'LIEUTENANT', xp: 3400 },
  { name: 'CAPTAIN',    xp: 5200 },
  { name: 'MAJOR',      xp: 7600 },
  { name: 'COLONEL',    xp: 10800 },
  { name: 'GENERAL',    xp: 15000 }
];

export const DEFAULT_PROFILE = {
  callsign: 'GHOST-7',
  xp: 0,
  bestWave: 0,
  kills: 0,
  wins: 0,
  deployed: 0,
  battles: 0
};

export const STORAGE_KEYS = {
  settings: 'tab:settings:v1',
  profile: 'tab:profile:v1'
};

export function rankForXp(xp) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) idx = i;
  const cur = RANKS[idx];
  const next = RANKS[idx + 1] || null;
  const pct = next ? Math.min(1, (xp - cur.xp) / (next.xp - cur.xp)) : 1;
  return { idx, name: cur.name, next, pct };
}
