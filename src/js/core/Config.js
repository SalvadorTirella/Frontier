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
  { id: 'artillery', name: 'ARTILLERY', cost: 850, hp: 170, dmg: 62, range: 14, rate: 2.2,  speed: 1.35, supply: 3, size: 1.22, hotkey: '4', splash: 2.7, crossLane: true }
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

/* ---------- LANES & FORMATIONS (Milestone 2) ---------- */
export const LANE_CONFIG = {
  count: 3 // 1..5 supported — topology built by LaneSystem
};

export const ROLE_BY_UNIT = {
  tank: 'FRONT',
  rifleman: 'MIDDLE',
  gunner: 'MIDDLE',
  artillery: 'BACK'
};

export const FORMATION = {
  colSpacing: 1.7,                 // lateral distance between slots of the same role
  leadPush: 1.5,                   // forward lead that keeps the formation marching
  depth: { FRONT: 0, MIDDLE: 2.4, BACK: 5.0 }, // distance behind the front line
  jitterX: 0.55,                   // per-unit organic offset along the advance axis
  slotsPerLane: 22                 // soft slot budget per lane (feeds the unit cap)
};

export const LANE_SWITCH = {
  interval: 2.2,   // seconds between passive re-evaluations
  over: 5,         // a lane with >= this many allies is "overpopulated"
  relief: 3,       // required population gap to justify a transfer
  roles: ['MIDDLE'] // only infantry re-routes itself automatically
};

export const LANE_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT'];

/* ---------- CINEMATIC COMBAT (Milestone 3) ---------- */

/** Weapon profile per unit — projectile class, damage kind, ballistics */
export const WEAPONS = {
  rifleman: { proj: 'bullet', kind: 'kinetic', speed: 55, variance: 0.16, crit: 0.06 },
  gunner: { proj: 'bullet', kind: 'kinetic', speed: 62, variance: 0.12, crit: 0.05 },
  tank: { proj: 'rocket', kind: 'explosive', speed: 21, splash: 3.0, variance: 0.1, crit: 0.04 },
  artillery: { proj: 'grenade', kind: 'explosive', speed: 15, splash: 4.4, variance: 0.2, crit: 0.03 },
  boss: { proj: 'rocket', kind: 'explosive', speed: 18, splash: 3.4, variance: 0.12, crit: 0 }
};

/** Damage-kind resistance table (tank shrugs off kinetic, fears explosive) */
export const RESIST = {
  rifleman: { kinetic: 1.0, explosive: 0.9 },
  gunner: { kinetic: 0.95, explosive: 0.9 },
  tank: { kinetic: 0.55, explosive: 1.2 },
  artillery: { kinetic: 0.85, explosive: 1.1 },
  warbringer: { kinetic: 0.7, explosive: 0.95 }
};

export const CRIT_MULT = 1.8;
export const HEADSHOT = { chance: 0.12, mult: 2.2 }; // BACK row sniping FRONT row

export const COVER_DEFS = {
  sandbag: { w: 2.7, h: 0.95, d: 1.1, hp: 300, coverValue: 0.45, blocksLoS: false },
  barricade: { w: 2.3, h: 2.1, d: 0.65, hp: 480, coverValue: 0.65, blocksLoS: true }
};

export const BOSS_TEMPLATES = {
  warbringer: {
    id: 'warbringer',
    name: 'XENO WARBRINGER',
    hp: 4200,
    size: 3.1,
    speed: 1.15,
    reward: 1500,
    dmg: 58,
    radius: 2.6,
    phases: [
      { at: 1.0, rate: 2.6, move: 1.0, attack: 'cannon' },
      { at: 0.66, rate: 1.9, move: 1.3, attack: 'mortar' },
      { at: 0.33, rate: 1.25, move: 1.65, attack: 'lance' }
    ]
  }
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
