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
  gore: 'NORMAL', // impact FX: NONE | NORMAL | EXTREME
  master: 80,
  music: 55,
  sfx: 85
};

/* ---------- VISUAL BIBLE — Frontline: Operación Ironveil ---------- */
export const ART_PALETTE = {
  player: [
    { name: 'CIAN ELÉCTRICO', hex: '#00C6FF', role: 'Neón primario, visores, escudos' },
    { name: 'AZUL HIELO', hex: '#4DA6FF', role: 'Cristal de torre, relleno frío' },
    { name: 'ÁMBAR', hex: '#FFAA33', role: 'Municiones, despliegue, HUD de mando' },
    { name: 'GRIS ACERO', hex: '#1A1F26', role: 'Armadura, plataformas, blindaje' }
  ],
  enemy: [
    { name: 'ROJO HOSTIL', hex: '#FF2A2A', role: 'Alertas, ojos alien, escudo defensivo' },
    { name: 'NARANJA MAGMA', hex: '#FF6600', role: 'Ventilas térmicas, anillos de fuego' },
    { name: 'PÚRPURA NÚCLEO', hex: '#7B1FA2', role: 'Núcleo de energía, bioluminiscencia' },
    { name: 'NEGRO CARBÓN', hex: '#0D0D0D', role: 'Monolito, armadura orgánica' }
  ],
  environment: [
    { name: 'SUELO METÁLICO', hex: '#15191E', role: 'Planchas del campo de batalla' },
    { name: 'CIRCUITOS', hex: '#1E2A33', role: 'Trazas y rejilla hexagonal' },
    { name: 'CIELO PROFUNDO', hex: '#0A1A33', role: 'Cenit espacial, nebulosas' },
    { name: 'VACÍO', hex: '#020305', role: 'Horizonte y niebla de fondo' }
  ]
};

export const ART_ASSETS = {
  keyframe: 'https://image.qwenlm.ai/generated-images/4e72dd50-37af-44ae-9b1e-fcf18fd47efa/_result.png',
  fortress: 'https://image.qwenlm.ai/generated-images/1bd99ea3-81e3-4ac8-ab1c-bbb274db5bc8/_result.png',
  hub: 'https://image.qwenlm.ai/generated-images/3acf67b4-72ea-4ab6-bce0-5da68eada0f2/_result.png',
  units: 'https://image.qwenlm.ai/generated-images/74d5091a-548e-4fe5-9d65-173cb29fc712/_result.png'
};

/* ---------- UNIT ROSTER (9 classes · FRONT / MIDDLE / BACK) ---------- */
export const UNIT_TYPES = [
  { id: 'rifleman',     name: 'RIFLEMAN',     cost: 100, hp: 78,  dmg: 9,  range: 8,   rate: 0.85, speed: 3.5,  supply: 1, size: 1.0,  hotkey: '1' },
  { id: 'gunner',       name: 'GUNNER',       cost: 240, hp: 135, dmg: 16, range: 9,   rate: 0.55, speed: 2.8,  supply: 2, size: 1.12, hotkey: '2' },
  { id: 'heavy',        name: 'HEAVY',        cost: 400, hp: 310, dmg: 22, range: 6.5, rate: 1.05, speed: 2.1,  supply: 3, size: 1.3,  hotkey: '3' },
  { id: 'grenadier',    name: 'GRENADIER',    cost: 320, hp: 100, dmg: 30, range: 9.5, rate: 1.6,  speed: 3.0,  supply: 2, size: 1.02, hotkey: '4' },
  { id: 'flamethrower', name: 'FLAMER',       cost: 280, hp: 115, dmg: 5,  range: 5.2, rate: 0.16, speed: 3.2,  supply: 2, size: 1.04, hotkey: '5' },
  { id: 'sniper',       name: 'SNIPER',       cost: 480, hp: 72,  dmg: 58, range: 16,  rate: 2.4,  speed: 2.6,  supply: 2, size: 0.98, hotkey: '6' },
  { id: 'rpg',          name: 'RPG',          cost: 540, hp: 118, dmg: 50, range: 11,  rate: 2.1,  speed: 2.7,  supply: 3, size: 1.06, hotkey: '7' },
  { id: 'tank',         name: 'TANK',         cost: 520, hp: 380, dmg: 34, range: 7,   rate: 1.35, speed: 1.75, supply: 4, size: 1.5,  hotkey: '8' },
  { id: 'artillery',    name: 'ARTILLERY',    cost: 850, hp: 170, dmg: 62, range: 14,  rate: 2.2,  speed: 1.35, supply: 3, size: 1.22, hotkey: '9', splash: 2.7, crossLane: true }
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
  heavy: 'FRONT',
  tank: 'FRONT',
  rifleman: 'MIDDLE',
  gunner: 'MIDDLE',
  grenadier: 'MIDDLE',
  flamethrower: 'MIDDLE',
  sniper: 'BACK',
  rpg: 'BACK',
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
  rifleman:     { proj: 'bullet',   kind: 'kinetic',   speed: 55,  variance: 0.16, crit: 0.06, hue: 'cyan' },
  gunner:       { proj: 'bullet',   kind: 'kinetic',   speed: 62,  variance: 0.12, crit: 0.05, hue: 'cyan' },
  heavy:        { proj: 'bullet',   kind: 'kinetic',   speed: 58,  variance: 0.14, crit: 0.05, hue: 'amber' },
  grenadier:    { proj: 'grenade',  kind: 'explosive', speed: 17,  splash: 2.0, variance: 0.1,  crit: 0, hue: 'magma' },
  flamethrower: { proj: 'bullet',   kind: 'fire',      speed: 42,  variance: 0.3,  crit: 0.02, hue: 'magma' },
  sniper:       { proj: 'bullet',   kind: 'kinetic',   speed: 110, variance: 0.08, crit: 0.18, hue: 'ice' },
  rpg:          { proj: 'rocket',   kind: 'explosive', speed: 24,  splash: 2.4, variance: 0.1,  crit: 0, hue: 'magma' },
  tank:         { proj: 'rocket',   kind: 'explosive', speed: 21,  splash: 3.0, variance: 0.1,  crit: 0.04, hue: 'amber' },
  artillery:    { proj: 'grenade',  kind: 'explosive', speed: 15,  splash: 4.4, variance: 0.2,  crit: 0.03, hue: 'amber' },
  boss:         { proj: 'rocket',   kind: 'explosive', speed: 18,  splash: 3.4, variance: 0.12, crit: 0, hue: 'violet' }
};

/** Damage-kind resistance table (tank shrugs off kinetic, fears explosive) */
export const RESIST = {
  rifleman:     { kinetic: 1.0,  explosive: 0.9,  fire: 1.05 },
  gunner:       { kinetic: 0.95, explosive: 0.9,  fire: 1.0 },
  heavy:        { kinetic: 0.8,  explosive: 1.2,  fire: 0.95 },
  grenadier:    { kinetic: 1.05, explosive: 0.95, fire: 1.0 },
  flamethrower: { kinetic: 1.1,  explosive: 1.0,  fire: 0.6 },
  sniper:       { kinetic: 1.15, explosive: 1.05, fire: 1.0 },
  rpg:          { kinetic: 1.0,  explosive: 0.9,  fire: 1.0 },
  tank:         { kinetic: 0.55, explosive: 1.2,  fire: 0.85 },
  artillery:    { kinetic: 0.85, explosive: 1.1,  fire: 1.0 },
  warbringer:   { kinetic: 0.7,  explosive: 0.95, fire: 0.9 }
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

/* ---------- HEROES / STRUCTURES / UPGRADES (Milestone 4) ---------- */

/** Autonomous hero commanders — one alive at a time, deploy to a lane */
export const HERO_TYPES = [
  {
    id: 'medic', name: 'FIELD MEDIC', role: 'MIDDLE',
    cost: 260, supply: 4, hp: 430, dmg: 9, range: 10, rate: 1.1, speed: 4.4, size: 1.3,
    cooldown: 20, maxAlive: 1,
    auraRadius: 5.5, auraHeal: 16,
    ultKills: 6, ultName: 'TRIAGE SURGE', ultHeal: 100, ultRadius: 9,
    accent: 'green', hotkey: 'Z'
  },
  {
    id: 'assault', name: 'VANGUARD', role: 'FRONT',
    cost: 300, supply: 5, hp: 660, dmg: 48, range: 11, rate: 0.85, speed: 5.6, size: 1.45,
    cooldown: 24, maxAlive: 1,
    laneShiftAggro: true,
    ultKills: 5, ultName: 'OVERDRIVE', ultDmgMult: 2.2, ultDur: 6,
    accent: 'amber', hotkey: 'X'
  },
  {
    id: 'support', name: 'WARLORD', role: 'BACK',
    cost: 280, supply: 5, hp: 390, dmg: 22, range: 15, rate: 1.0, speed: 3.9, size: 1.35,
    cooldown: 22, maxAlive: 1,
    auraRadius: 6.5, auraBuffDmg: 1.3, auraBuffRate: 1.25,
    ultKills: 7, ultName: 'RALLY CRY', ultBuffDur: 8,
    accent: 'cyan', hotkey: 'C'
  }
];

/** Placeable defensive structures — sandbag/barricade double as cover */
export const STRUCTURE_TYPES = [
  { id: 'sandbag', name: 'SANDBAG WALL', cost: 60, supply: 1, isCover: true, hotkey: 'V' },
  { id: 'barricade', name: 'BARRICADE', cost: 120, supply: 2, isCover: true, hotkey: 'B' },
  {
    id: 'turret', name: 'AUTO TURRET', cost: 220, supply: 3, isCover: false,
    hp: 320, dmg: 15, range: 13, rate: 0.5, w: 1.2, d: 1.2, h: 1.7, hotkey: 'N'
  },
  {
    id: 'mine', name: 'PROXIMITY MINE', cost: 90, supply: 1, isCover: false,
    hp: 50, dmg: 150, radius: 3.4, w: 0.9, d: 0.9, h: 0.3, hotkey: 'M'
  }
];

/** Battle upgrade tree — three branches, applied globally while in combat */
export const UPGRADE_TREE = {
  weapons: [
    { id: 'w1', branch: 'weapons', name: 'HOLLOW POINTS', desc: '+15% unit damage', cost: 150, effect: { dmgMult: 1.15 } },
    { id: 'w2', branch: 'weapons', name: 'RAPID FIRE', desc: '+20% fire rate', cost: 220, effect: { rateMult: 1.2 }, req: 'w1' },
    { id: 'w3', branch: 'weapons', name: 'AP ROUNDS', desc: '+25% dmg · +10% crit', cost: 340, effect: { dmgMult: 1.25, critBonus: 0.10 }, req: 'w2' }
  ],
  armor: [
    { id: 'a1', branch: 'armor', name: 'PLATED HULLS', desc: '+20% max HP', cost: 160, effect: { hpMult: 1.2 } },
    { id: 'a2', branch: 'armor', name: 'REACTIVE ARMOR', desc: '-15% explosive taken', cost: 240, effect: { explosiveResist: 0.85 }, req: 'a1' },
    { id: 'a3', branch: 'armor', name: 'NANO REPAIR', desc: 'Allies regen 2 HP/s', cost: 360, effect: { regen: 2 }, req: 'a2' }
  ],
  logistics: [
    { id: 'l1', branch: 'logistics', name: 'SUPPLY LINES', desc: '+25% income', cost: 140, effect: { incomeMult: 1.25 } },
    { id: 'l2', branch: 'logistics', name: 'FIELD DEPOT', desc: '+8 supply cap', cost: 200, effect: { supplyCapAdd: 8 }, req: 'l1' },
    { id: 'l3', branch: 'logistics', name: 'WAR ECONOMY', desc: '+40% kill rewards', cost: 300, effect: { killRatioMult: 1.4 }, req: 'l2' }
  ]
};

export const HERO_BUFF = { rateBase: 1.25, dmgBase: 1.3 };

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
