/* ============================================================
   BattleScreen — real-time auto-battle simulation & director
   ============================================================ */
import EventBus from '../core/EventBus.js';
import HUD from './HUD.js';
import AudioFX from '../utils/AudioUtils.js';
import SaveManager from '../core/SaveManager.js';
import modalManager from './ModalManager.js';
import { BABYLON } from '../render/SceneController.js';
const { Vector3 } = BABYLON || {};
import { rand, clamp, weightedPick, pad2 } from '../utils/DOMUtils.js';
import {
  UNIT_TYPES, ABILITY, ECONOMY, BASES, BATTLE, waveDef, BASE_W, BASE_H,
  ROLE_BY_UNIT, FORMATION, LANE_SWITCH,
  WEAPONS, RESIST, CRIT_MULT, HEADSHOT,
  HERO_TYPES, STRUCTURE_TYPES, UPGRADE_TREE
} from '../core/Config.js';
import FormationSystem from '../core/FormationSystem.js';
import CombatEngine from '../core/CombatEngine.js';
import CoverSystem from '../core/CoverSystem.js';
import BossSystem from '../core/BossSystem.js';
import HeroSystem from '../core/HeroSystem.js';
import StructureSystem from '../core/StructureSystem.js';
import UpgradeSystem from '../core/UpgradeSystem.js';

export default class BattleScreen {
  constructor() {
    this.hud = new HUD();
    this.running = false;
    this.paused = false;
    this.entities = [];
  }

  init(el, ctx) {
    this.el = el;
    this.ctx = ctx;
    this.hud.init(el);
    EventBus.on('buy:unit', ({ id }) => this._buy(id));
    EventBus.on('ability:use', () => this._useAbility());

    /* lane control (Milestone 2) */
    EventBus.on('lane:select', ({ id }) => this._selectLane(id));
    EventBus.on('lane:shift', ({ dir }) => this._shiftLane(dir));
    EventBus.on('lane:hover', ({ id }) => {
      this.ctx.scene.setHoverLane(id);
      this.hud.setHoverLane(id);
    });
    EventBus.on('formation:reformed', () => {}); // hook for future SFX/VFX
    EventBus.on('boss:entrance', ({ name }) => {
      AudioFX.sfx('roar');
      AudioFX.sfx('alarm');
      AudioFX.startMusic('boss');
      this.hud.showBanner(`⚠ ${name}`, 'CENTER LANE — PRIORITY TARGET', 'banner-danger');
    });
    // boss:defeated → victory flow is handled inside BossSystem._die()

    /* heroes / structures / upgrades (Milestone 4) */
    EventBus.on('hero:deploy', ({ id }) => this._deployHero(id));
    EventBus.on('structure:select', ({ id }) => { if (this.structureSys) this.structureSys.select(id); });
    EventBus.on('structure:placing', ({ id }) => this.hud.setStructurePlacing(id));
    EventBus.on('upgrades:toggle', () => this._toggleUpgrades());
    EventBus.on('upgrade:buy', ({ id }) => this._buyUpgrade(id));

    const canvas = ctx.scene.canvas;
    if (canvas) {
      canvas.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        if (this.structureSys) this.structureSys.cancel();
      });
      canvas.addEventListener('pointerdown', (ev) => {
        if (!this.running || this.paused || this.ending || !this.lanes) return;
        const p = this.ctx.scene.pickGround(ev.clientX, ev.clientY);
        if (!p) return;
        // placement mode takes priority over lane selection
        if (this.structureSys && this.structureSys.placingId) {
          this.structureSys.tryPlace(p.x, p.z);
          return;
        }
        if (Math.abs(p.x) < BATTLE.spawnX + 5) {
          this._selectLane(this.lanes.getNearestLane(p.z).id);
        }
      });
      let hoverT = 0;
      canvas.addEventListener('pointermove', (ev) => {
        const now = performance.now();
        if (now - hoverT < 90) return;
        hoverT = now;
        if (!this.running || this.paused || !this.lanes) return;
        const p = this.ctx.scene.pickGround(ev.clientX, ev.clientY);
        // structure placement preview
        if (this.structureSys && this.structureSys.placingId) {
          if (p) {
            const ok = this.structureSys.validate(p.x, p.z).ok;
            this.ctx.scene.setPlacementPreview(p.x, p.z, ok);
          }
          return;
        }
        if (p && Math.abs(p.x) < BATTLE.spawnX + 5) {
          const id = this.lanes.getNearestLane(p.z).id;
          this.ctx.scene.setHoverLane(id);
          this.hud.setHoverLane(id);
        } else {
          this.ctx.scene.setHoverLane(null);
          this.hud.setHoverLane(null);
        }
      });
      canvas.addEventListener('pointerleave', () => {
        this.ctx.scene.setHoverLane(null);
        this.hud.setHoverLane(null);
      });
    }
  }

  /* ================= lifecycle ================= */
  start() {
    const scene = this.ctx.scene;
    scene.clearUnits();
    scene.restoreBase('player');
    scene.restoreBase('enemy');
    scene.setMode('battle');

    this.entities = [];
    this.eid = 0;

    /* lanes & formations (Milestone 2) */
    this.lanes = scene.laneSystem;
    this.formation = new FormationSystem(this.lanes);
    this.unitCapEff = Math.min(BATTLE.unitCap, this.formation.totalSlots());
    this.selectedLane = this.lanes.middleLane;
    this.switchT = LANE_SWITCH.interval;
    scene.setSelectedLane(this.selectedLane);
    this.hud.setLaneCount(this.lanes.laneCount, this.lanes.lanes.map((l) => l.letter));
    this.hud.setSelectedLane(this.selectedLane);

    /* cinematic combat (Milestone 3): cover, projectiles, boss */
    this.cover = new CoverSystem(scene);
    this.cover.generate(this._coverLayout());
    this.combat = new CombatEngine({
      scene,
      damageEntity: (t, d, i) => this._damageEntity(t, d, i),
      damageCover: (c, d) => this._damageCoverRouted(c, d),
      coverAt: (x, z, r) => this.cover.getCoverAt(x, z, r),
      blocksLoS: (ax, az, bx, bz) => this.cover.blocksLoS(ax, az, bx, bz),
      splash: (x, z, r, d, side, i) => this._splash(x, z, r, d, side, i)
    });
    this.bossSys = new BossSystem({ battle: this, scene, combat: this.combat, lanes: this.lanes });
    this.timeScale = 1;
    this.cineT = 0;
    this.bossPending = 0;
    this.hud.setBoss(null);

    /* heroes / structures / upgrades (Milestone 4) */
    this.heroSys = new HeroSystem({ battle: this, scene, formation: this.formation, lanes: this.lanes });
    this.structureSys = new StructureSystem({ battle: this, scene, combat: this.combat, cover: this.cover, lanes: this.lanes });
    this.upgradeSys = new UpgradeSystem({ battle: this });
    this.upgradesOpen = false;
    this.hud.setUpgradePanel(false);
    this._refreshUpgradePanel();

    this.credits = ECONOMY.start;
    this.supplyUsed = 0;
    this.deployedCount = {};
    UNIT_TYPES.forEach((u) => { this.deployedCount[u.id] = 0; this.hud.setReserve(u.id, 0); });
    this.kills = 0;
    this.losses = 0;
    this.earned = 0;
    this.combo = 0;
    this.comboT = 0;
    this.bestCombo = 0;
    this.time = 0;
    this.waveIdx = -1;
    this.waveState = 'intermission';
    this.interT = 2.4;
    this.spawnQueue = [];
    this.waveT = 0;
    this.abilityCd = 0;
    this.baseHP = { player: BASES.player.hp, enemy: BASES.enemy.hp };
    this.baseFxT = 0;
    this.uiAcc = 0;
    this.floatBudget = 0;
    this.floatTimer = 0;
    this.ending = false;
    this._endToken = null;
    this.paused = false;
    this.running = true;

    this.hud.setVisible(true);
    this.hud.setCredits(this.credits, false);
    this.hud.setSupply(0, this.supplyCapEff);
    this.hud.setWave(1, BATTLE.finalWave);
    this.hud.setHostiles(0);
    this.hud.setBaseHP('player', 100);
    this.hud.setBaseHP('enemy', 100);
    this.hud.setCombo(0, 0);
    this.hud.setAbility(1, true);
    this.hud.showBanner('OPERATION IRONVEIL', 'WAVE 1 IMMINENT — REQUISITION OPEN', 'banner-ally');
    AudioFX.startMusic('battle');
  }

  pause() { this.paused = true; }

  resume() { this.paused = false; }

  abort() {
    this.running = false;
    this.ending = false;
    this._endToken = null;
    this.timeScale = 1;
    this.cineT = 0;
    this.bossPending = 0;
    if (this.combat) this.combat.clear();
    if (this.cover) this.cover.clear();
    if (this.bossSys) this.bossSys.reset();
    if (this.structureSys) this.structureSys.reset();
    if (this.heroSys) this.heroSys.reset();
    if (this.upgradeSys) this.upgradeSys.reset();
    if (this.formation) this.formation.clear();
    this.upgradesOpen = false;
    this.hud.setUpgradePanel(false);
    this.hud.setStructurePlacing(null);
    this.ctx.scene.setSelectedLane(null);
    this.ctx.scene.setHoverLane(null);
    this.hud.setHoverLane(null);
    this.hud.setBoss(null);
    this.ctx.scene.clearUnits();
    this.ctx.scene.restoreBase('player');
    this.ctx.scene.restoreBase('enemy');
    this.ctx.scene.setMode('ambient');
    this.hud.setVisible(false);
    AudioFX.startMusic('menu');
  }

  getSnapshot() {
    return {
      wave: Math.max(1, this.waveIdx + 1),
      kills: this.kills,
      credits: this.credits,
      losses: this.losses
    };
  }

  /** Effective supply cap including logistics upgrades. */
  get supplyCapEff() {
    const add = this.upgradeSys ? this.upgradeSys.getMods().supplyCapAdd : 0;
    return ECONOMY.supplyCap + add;
  }

  /* ================= main tick ================= */
  tick(dt) {
    if (!this.running || this.paused || this.ending) return;
    this.time += dt;

    /* cinematic slow-motion (boss entrance) */
    if (this.cineT > 0) {
      this.cineT -= dt;
      if (this.cineT <= 0) this.timeScale = 1;
    }
    const sdt = dt * this.timeScale;

    /* economy (logistics upgrades boost income) */
    const mods = this.upgradeSys.getMods();
    const income = (ECONOMY.income + Math.max(0, this.waveIdx) * ECONOMY.incomePerWave) * mods.incomeMult;
    this.credits += income * sdt;
    this.earned += income * sdt;

    /* combo decay */
    if (this.combo > 0) {
      this.comboT -= sdt;
      if (this.comboT <= 0) { this.combo = 0; this.hud.setCombo(0, 0); }
      else this.hud.setCombo(this.combo, this.comboT / BATTLE.comboWindow);
    }

    /* ability cooldown */
    if (this.abilityCd > 0) {
      this.abilityCd = Math.max(0, this.abilityCd - sdt);
      this.hud.setAbility(this.abilityCd / ABILITY.cooldown, this.abilityCd === 0);
    }

    /* wave director */
    this._direct(sdt);

    /* entities */
    this._updateEntities(sdt);

    /* projectiles & boss */
    this.combat.tick(sdt);
    this.bossSys.tick(sdt);

    /* heroes, structures & nano-repair (Milestone 4) */
    this.heroSys.tick(sdt);
    this.structureSys.tick(sdt);
    if (mods.regen > 0) this._applyRegen(mods.regen * sdt);

    /* base fx throttle */
    this.baseFxT = Math.max(0, this.baseFxT - dt);
    this.floatTimer -= dt;
    if (this.floatTimer <= 0) { this.floatTimer = 0.5; this.floatBudget = 9; }

    /* HUD refresh ~8Hz */
    this.uiAcc += dt;
    if (this.uiAcc >= 0.12) {
      this.uiAcc = 0;
      this.hud.setCredits(this.credits, false);
      this.hud.setSupply(this.supplyUsed, this.supplyCapEff);
      this.hud.setHostiles(this.entities.filter((e) => e.side === 'enemy').length);
      this.hud.updateShop(Math.floor(this.credits), this.supplyCapEff - this.supplyUsed);
      this._refreshCommandRail();
      this.hud.setStructAfford(STRUCTURE_TYPES.map((s) => ({ id: s.id, affordable: this.credits >= s.cost })));
      if (this.upgradesOpen) this._refreshUpgradePanel();
    }
  }

  /** Nano-repair: heal living player units up to max HP. */
  _applyRegen(amount) {
    for (const e of this.entities) {
      if (e.side !== 'player' || e.hp <= 0 || e.isStructure || e.hp >= e.maxHp) continue;
      e.hp = Math.min(e.maxHp, e.hp + amount);
      this.ctx.scene.setUnitHP(e.handle, e.hp / e.maxHp);
    }
  }

  _direct(dt) {
    /* boss drop countdown (final wave) */
    if (this.bossPending > 0) {
      this.bossPending -= dt;
      if (this.bossPending <= 0 && !this.bossSys.active) {
        this.bossSys.spawn('warbringer', this.lanes.middleLane);
      }
    }

    if (this.waveState === 'intermission') {
      this.interT -= dt;
      if (this.interT <= 0) this._startWave(this.waveIdx + 1);
      return;
    }
    if (this.waveState === 'spawning') {
      this.waveT += dt;
      while (this.spawnQueue.length && this.waveT >= this.spawnQueue[0].t) {
        const s = this.spawnQueue.shift();
        this._spawnEnemy(s.typeId, s.laneId);
      }
      const enemiesAlive = this.entities.some((e) => e.side === 'enemy');
      if (!this.spawnQueue.length && !enemiesAlive) this._waveCleared();
    }
    /* 'final' — no more spawns; victory via HQ demolition */
  }

  _startWave(i) {
    this.waveIdx = i;
    const def = waveDef(i);
    this.spawnQueue = [];
    this.waveT = 0;
    let budget = def.budget;
    let t = 1.0;
    const isFinalWave = i === BATTLE.finalWave - 1;
    const affordable = () => UNIT_TYPES.filter((u) => u.cost <= budget);
    while (affordable().length && this.spawnQueue.length < 60) {
      const pool = affordable();
      const type = weightedPick(pool, (u) => {
        if (u.id === 'rifleman') return 5;
        if (u.id === 'gunner') return 3;
        if (u.id === 'tank') return def.heavy * 4;
        return def.heavy * 2.4;
      });
      budget -= type.cost;
      // deterministic lane distribution (final wave masses the center)
      const nLanes = this.lanes ? this.lanes.laneCount : 1;
      let laneId = (this.spawnQueue.length + i) % nLanes;
      if (isFinalWave && nLanes > 1 && Math.random() < 0.5) laneId = Math.floor(nLanes / 2);
      this.spawnQueue.push({ t, typeId: type.id, laneId });
      t += def.interval * rand(0.65, 1.3);
    }
    this.waveState = 'spawning';
    this.hud.setWave(i + 1, BATTLE.finalWave);
    const isFinal = i === BATTLE.finalWave - 1;
    if (isFinal) this.bossPending = 3.2; // the Warbringer drops mid-wave
    this.hud.showBanner(
      isFinal ? 'FINAL WAVE' : `WAVE ${pad2(i + 1)}`,
      isFinal ? 'MAXIMUM THREAT — BREAK THEIR HQ' : `${this.spawnQueue.length} HOSTILES INBOUND — HOLD THE LINE`,
      isFinal ? 'banner-danger' : ''
    );
    AudioFX.sfx('wave');
    AudioFX.sfx('radio');
    if (isFinal) AudioFX.sfx('alarm');
    // music escalates with each wave
    AudioFX.setMusicIntensity(i / Math.max(1, BATTLE.finalWave - 1));
  }

  _waveCleared() {
    const cleared = this.waveIdx + 1;
    if (cleared >= BATTLE.finalWave) {
      this.waveState = 'final';
      this.hud.showBanner('WAVES CLEARED', 'ASSAULT THE ENEMY HQ — FINISH IT', 'banner-ally');
    } else {
      this.waveState = 'intermission';
      this.interT = 3.4;
      this.credits += ECONOMY.waveBonus;
      this.earned += ECONOMY.waveBonus;
      this.hud.announce(`WAVE BONUS  +${ECONOMY.waveBonus} CR`, 'announce-ally');
      this.hud.gainFlash();
      AudioFX.sfx('buy');
    }
  }

  /* ================= entities ================= */
  _spawnEnemy(typeId, laneId) {
    if (this.entities.length >= this.unitCapEff) return;
    const def = UNIT_TYPES.find((u) => u.id === typeId);
    const wv = waveDef(this.waveIdx);
    this._addEntity(def, 'enemy', laneId, {
      hp: def.hp * wv.hpScale,
      dmg: def.dmg * wv.dmgScale
    });
  }

  /**
   * Spawns a unit into a lane and assigns its formation slot.
   * @param {object} def unit type definition
   * @param {'player'|'enemy'} side
   * @param {number} laneId target lane
   * @param {object} [mods] stat overrides (wave scaling)
   */
  _addEntity(def, side, laneId, mods = {}) {
    const role = ROLE_BY_UNIT[def.id] || 'MIDDLE';
    const pos = this.lanes.getSpawnPosition(side, laneId, role);
    const handle = this.ctx.scene.addUnitMesh(def, side, pos.x, pos.z);
    // player units inherit the current tech state; enemies use wave scaling only
    const up = side === 'player' ? this.upgradeSys.getMods() : { hpMult: 1, dmgMult: 1, rateMult: 1 };
    const e = {
      id: ++this.eid,
      def,
      side,
      role,
      laneId,
      size: def.size,
      hp: (mods.hp ?? def.hp) * up.hpMult,
      dmg: (mods.dmg ?? def.dmg) * up.dmgMult,
      range: def.range,
      rate: def.rate / up.rateMult,
      speed: def.speed,
      cd: rand(0.1, 0.55),
      x: pos.x,
      z: pos.z,
      formJitter: rand(-FORMATION.jitterX, FORMATION.jitterX),
      laneShifting: false,
      shiftT: 0,
      value: def.cost,
      supply: def.supply,
      handle
    };
    e.maxHp = e.hp;
    this.formation.assignSlot(e, laneId, role);
    this.ctx.scene.setUnitHP(handle, 1);
    this.entities.push(e);
    return e;
  }

  /**
   * Can `e` shoot `o`? Same lane, connected (adjacent) lane, or
   * cross-lane capability (artillery).
   */
  _laneCompat(e, o) {
    if (o.laneId === e.laneId) return true;
    if (e.def.crossLane) return true;
    return this.lanes.getValidTransitions(e.laneId).includes(o.laneId);
  }

  _updateEntities(dt) {
    const scene = this.ctx.scene;
    const anchors = this.formation.computeAnchors(this.entities);

    for (const e of this.entities) {
      if (e.isBoss) continue; // BossSystem drives the boss
      e.cd -= dt;
      if (e.shiftT > 0) {
        e.shiftT -= dt;
        if (e.shiftT <= 0) e.laneShifting = false;
      }
      const dir = e.side === 'player' ? 1 : -1;

      // target acquisition: nearest live hostile in range AND in a reachable lane
      let target = null;
      let bestD = Infinity;
      for (const o of this.entities) {
        if (o.side === e.side || o.hp <= 0) continue;
        const dx = o.x - e.x, dz = o.z - e.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= bestD) continue;
        if (d2 > e.range * e.range) continue;
        if (!this._laneCompat(e, o)) continue;
        bestD = d2;
        target = o;
      }

      if (target) {
        if (e.cd <= 0) {
          e.cd = e.rate;
          this._fire(e, target);
        }
        continue;
      }

      // march toward the formation slot; the front line pushes the anchor
      const t = this.formation.getFormationTarget(e, anchors);
      const limit = dir > 0 ? BATTLE.baseX - 1.6 : -(BATTLE.baseX - 1.6);
      const atWall = dir > 0 ? e.x >= limit : e.x <= limit;

      if (atWall && ((dir > 0 && t.x >= e.x) || (dir < 0 && t.x <= e.x))) {
        // front rank grinding on the enemy base
        if (e.cd <= 0) {
          e.cd = e.rate;
          this._hitBase(e);
        }
        continue;
      }

      const dx = t.x - e.x;
      const dz = t.z - e.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.06) {
        const step = Math.min(e.speed * dt, dist);
        e.x += (dx / dist) * step;
        e.z += (dz / dist) * step;
        scene.moveUnit(e.handle, e.x, e.z, e.laneShifting ? 4.2 : 9);
      }
    }
    this.entities = this.entities.filter((e) => e.hp > 0);

    // passive lane rebalancing
    this.switchT -= dt;
    if (this.switchT <= 0) {
      this.switchT = LANE_SWITCH.interval;
      this._autoLaneShift();
    }
  }

  /* ================= lane control ================= */

  _selectLane(id) {
    if (!this.lanes) return;
    const lane = this.lanes.getLane(id);
    if (!lane || this.selectedLane === id) return;
    this.selectedLane = id;
    this.hud.setSelectedLane(id);
    this.ctx.scene.setSelectedLane(id);
    AudioFX.sfx('click');
  }

  _shiftLane(dirStep) {
    if (!this.lanes) return;
    const n = this.lanes.laneCount;
    this._selectLane((this.selectedLane + dirStep + n) % n);
  }

  /**
   * Passive lane-change ability: infantry (MIDDLE role) re-routes
   * itself when its lane is overpopulated or another lane is left
   * undefended against incoming hostiles. One move per side per tick.
   */
  _autoLaneShift() {
    if (!this.lanes || this.lanes.laneCount < 2) return;
    for (const side of ['player', 'enemy']) {
      const allies = this.entities.filter((e) => e.side === side && e.hp > 0);
      const counts = {};
      this.lanes.lanes.forEach((l) => { counts[l.id] = 0; });
      allies.forEach((e) => { counts[e.laneId] = (counts[e.laneId] || 0) + 1; });

      const enemySide = side === 'player' ? 'enemy' : 'player';
      const threats = {};
      this.entities.forEach((e) => {
        if (e.side === enemySide && e.hp > 0) threats[e.laneId] = (threats[e.laneId] || 0) + 1;
      });

      const movable = allies.filter(
        (e) => LANE_SWITCH.roles.includes(e.role) && !e.laneShifting && e.laneId !== undefined
      );
      if (!movable.length) continue;

      let pick = null;
      let toLane = null;

      // 1) answer an undefended lane under threat
      for (const lane of this.lanes.lanes) {
        const undefended = (threats[lane.id] || 0) > 0 && (counts[lane.id] || 0) === 0;
        if (!undefended) continue;
        const donor = movable.find((e) => (counts[e.laneId] || 0) >= 2 && this.lanes.getValidTransitions(e.laneId).includes(lane.id));
        if (donor) { pick = donor; toLane = lane.id; break; }
      }

      // 2) relieve an overpopulated lane
      if (!pick) {
        for (const lane of this.lanes.lanes) {
          if ((counts[lane.id] || 0) < LANE_SWITCH.over) continue;
          const best = this.lanes.leastPopulatedNeighbour(lane.id, counts);
          if (best === null) continue;
          if ((counts[best] || 0) > (counts[lane.id] || 0) - LANE_SWITCH.relief) continue;
          const cand = movable.find((e) => e.laneId === lane.id);
          if (cand) { pick = cand; toLane = best; break; }
        }
      }

      if (pick && toLane !== null && toLane !== pick.laneId) {
        const from = pick.laneId;
        this.formation.assignSlot(pick, toLane, pick.role); // releases + reforms both lanes
        pick.laneShifting = true;
        pick.shiftT = 1.6;
        EventBus.emit('lane:changed', { side, unit: pick.def.name, from, to: toLane });
        if (side === 'player') {
          const letter = this.lanes.getLane(toLane).letter;
          this.hud.announce(`${pick.def.name} → LANE ${letter}`, 'announce-ally');
        }
      }
    }
  }

  /** Discharges the unit's weapon through the CombatEngine (projectiles). */
  _fire(e, target) {
    const scene = this.ctx.scene;
    const w = WEAPONS[e.def.id] || WEAPONS.rifleman;
    const dir = e.side === 'player' ? 1 : -1;
    const from = { x: e.x + dir * 1.25 * e.size, y: 0.95 * e.size + 0.35, z: e.z };
    scene.muzzle(new Vector3(from.x, from.y, from.z), e.side);
    scene.recoilUnit(e.handle);
    // per-class discharge sound (aliens get an organic layer)
    const perClass = { rifleman: 'rifle', gunner: 'heavy', heavy: 'heavy', sniper: 'sniper', flamethrower: 'flame', grenadier: 'grenade', rpg: 'rpg', tank: 'tank', artillery: 'cannon' };
    AudioFX.sfx(e.side === 'enemy' && Math.random() < 0.22 ? 'alien' : (perClass[e.def.id] || 'shot'));
    this.combat.fire({ weapon: w, side: e.side, from, target, source: e, dmg: e.dmg });
  }

  _hitBase(e) {
    const targetSide = e.side === 'player' ? 'enemy' : 'player';
    const scene = this.ctx.scene;
    const wallX = targetSide === 'enemy' ? BATTLE.baseX : -BATTLE.baseX;
    scene.tracer(
      new Vector3(e.x, 0.95 * e.size, e.z),
      new Vector3(wallX, rand(1, 3.5), clamp(e.z, -8, 8)),
      e.side
    );
    AudioFX.sfx('shot');
    this.hitBaseDirect(targetSide, e.dmg);
  }

  /** Raw base damage with throttled impact FX (units & boss). */
  hitBaseDirect(targetSide, dmg) {
    const scene = this.ctx.scene;
    if (this.baseFxT <= 0) {
      this.baseFxT = 0.3;
      scene.damageBaseFX(targetSide);
      if (targetSide === 'player') scene.shake(0.7);
    }
    this._damageBase(targetSide, dmg);
  }

  /**
   * Full damage pipeline: variance → kind resistance → cover →
   * crit → headshot. Bosses route through BossSystem.takeDamage.
   * @param {object} t target entity
   * @param {number} dmg raw damage
   * @param {object} [info] { kind, variance, critChance, source, splash }
   */
  _damageEntity(t, dmg, info = {}) {
    if (!t || t.hp <= 0) return;
    const kind = info.kind || 'kinetic';
    let d = dmg * rand(1 - (info.variance ?? 0.12), 1 + (info.variance ?? 0.12));
    const resistTable = RESIST[t.def.id];
    if (resistTable && resistTable[kind]) d *= resistTable[kind];

    // cover: full reduction vs kinetic, 40% vs explosive splash
    if (this.cover) {
      const c = this.cover.getCoverAt(t.x, t.z, 1.5);
      if (c) d *= 1 - c.coverValue * (info.splash ? 0.4 : 1);
    }

    // structures route straight to the StructureSystem (no crits)
    if (t.isStructure) {
      this.structureSys.damageStructure(t, d);
      return;
    }

    // armor research: reactive plating shrugs off explosives
    if (t.side === 'player' && kind === 'explosive') {
      d *= this.upgradeSys.getMods().explosiveResist;
    }

    // crit & headshot
    let cls = '';
    if (info.critChance && Math.random() < info.critChance) {
      d *= CRIT_MULT;
      cls = 'dmg-crit';
      this._wordFloat(t, 'CRITICAL!', 'dmg-word-crit');
    }
    if (info.source && info.source.role === 'BACK' && t.role === 'FRONT' && Math.random() < HEADSHOT.chance) {
      d *= HEADSHOT.mult;
      cls = 'dmg-crit';
      this._wordFloat(t, 'HEADSHOT!', 'dmg-word-head');
    }

    if (t.isBoss) {
      this.bossSys.takeDamage(d);
      return;
    }

    t.hp -= d;
    this.ctx.scene.setUnitHP(t.handle, t.hp / t.maxHp);
    this.ctx.scene.hitUnit(t.handle);
    if (Math.random() < 0.3) AudioFX.sfx(t.def && t.def.size >= 1.4 ? 'hitMetal' : 'hit');

    if (this.floatBudget > 0) {
      this.floatBudget--;
      const p = this.ctx.scene.project(new Vector3(t.x, 2.3 * t.size, t.z));
      if (p.x > 20 && p.x < BASE_W - 20 && p.y > 20 && p.y < BASE_H - 20) {
        this.hud.float(p.x + rand(-14, 14), p.y, Math.round(d), cls || (d > 45 ? 'dmg-crit' : ''));
      }
    }
    AudioFX.sfx('hit');

    if (t.hp <= 0) this._killEntity(t, info.source);
  }

  /** Big floating word above a unit (CRITICAL! / HEADSHOT!). */
  _wordFloat(t, text, cls) {
    if (this.floatBudget <= 0) return;
    this.floatBudget--;
    const p = this.ctx.scene.project(new Vector3(t.x, 2.9 * t.size, t.z));
    if (p.x > 30 && p.x < BASE_W - 30 && p.y > 30 && p.y < BASE_H - 30) {
      this.hud.float(p.x, p.y - 16, text, cls);
    }
  }

  /**
   * Area damage resolver (explosive projectiles, mortar strikes).
   * @param {number} x @param {number} z @param {number} r radius
   * @param {number} dmg @param {string} side shooter's side
   * @param {object} info damage info forwarded to _damageEntity
   */
  _splash(x, z, r, dmg, side, info = {}) {
    const scene = this.ctx.scene;
    scene.explode(new Vector3(x, 0.7, z), 0.7 + r * 0.28, side === 'player' ? 'cyan' : 'amber');
    AudioFX.sfx('explode');
    if (r >= 3) scene.shake(0.5);

    const copy = [...this.entities];
    for (const o of copy) {
      if (o.side === side || o.hp <= 0) continue;
      const rr = r + (o.size || 1) * 0.4;
      const dx = o.x - x, dz = o.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr) continue;
      const falloff = 1 - 0.55 * Math.min(1, Math.sqrt(d2) / r);
      this._damageEntity(o, dmg * falloff, info);
    }

    // explosive damage chips away at cover pieces in the blast
    if (this.cover) {
      [...this.cover.covers].forEach((c) => {
        if (Math.hypot(c.x - x, c.z - z) <= r + 1) this._damageCoverRouted(c, dmg * 0.8);
      });
    }
    // splash also wrecks non-cover structures (turrets / mines)
    if (this.structureSys) {
      [...this.structureSys.structures].forEach((s) => {
        if (s.def.isCover) return; // already handled through its cover
        if (Math.hypot(s.x - x, s.z - z) <= r + 1) this.structureSys.damageStructure(s, dmg * 0.8);
      });
    }
  }

  /** Routes cover damage: structure-linked covers go to the StructureSystem. */
  _damageCoverRouted(c, dmg) {
    if (c.structureRef) this.structureSys.damageStructure(c.structureRef, dmg);
    else this.cover.damageCover(c, dmg);
  }

  _killEntity(t) {
    if (t.isBoss) return; // boss death is fully handled by BossSystem
    const scene = this.ctx.scene;
    const big = t.size >= 1.4;
    // aliens burst with bioluminescent violet; humans with red/amber
    scene.explode(new Vector3(t.x, 0.75, t.z), 0.85 + t.size * 0.35, t.side === 'enemy' ? 'violet' : 'red');
    if (t.side === 'enemy') {
      AudioFX.sfx('alienDie');
      if (big) AudioFX.sfx('boomBig');
    } else {
      AudioFX.sfx(big ? 'boomBig' : 'explode');
    }
    if (big || Math.abs(t.x) > 22) scene.shake(0.55);
    this.formation.releaseSlot(t); // survivors glide into the freed slots
    scene.removeUnit(t.handle);
    const idx = this.entities.indexOf(t);
    if (idx >= 0) this.entities.splice(idx, 1);

    if (t.side === 'enemy') {
      this.combo += 1;
      this.comboT = BATTLE.comboWindow;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const mult = 1 + Math.min(this.combo - 1, 20) * 0.06;
      const reward = Math.round(t.value * ECONOMY.killRatio * mult * this.upgradeSys.getMods().killRatioMult);
      this.credits += reward;
      this.earned += reward;
      this.kills += 1;
      this.heroSys.onPlayerKill(); // feeds deployed hero ultimates
      this.hud.setCombo(this.combo, 1);
      if (this.combo >= 2 && this.combo % 2 === 0) AudioFX.sfx('combo');
      const p = scene.project(new Vector3(t.x, 2.6, t.z));
      if (p.x > 20 && p.x < BASE_W - 20) this.hud.float(p.x, p.y - 18, `+${reward}`, 'dmg-gain');
      this.hud.gainFlash();
    } else {
      this.losses += 1;
      this.supplyUsed = Math.max(0, this.supplyUsed - (t.supply ?? t.def.supply ?? 0));
      if (t.isHero) {
        this.heroSys.onDeath(t.heroDef.id);
      } else {
        this.deployedCount[t.def.id] = Math.max(0, (this.deployedCount[t.def.id] || 0) - 1);
        this.hud.setReserve(t.def.id, this.deployedCount[t.def.id]);
      }
    }
  }

  _damageBase(side, dmg) {
    this.baseHP[side] -= dmg;
    const max = BASES[side].hp;
    this.hud.setBaseHP(side, (this.baseHP[side] / max) * 100);
    if (this.baseHP[side] <= 0 && !this.ending) {
      this.baseHP[side] = 0;
      this._endBattle(side === 'enemy');
    }
  }

  /* ================= player actions ================= */
  _buy(id) {
    if (!this.running || this.paused || this.ending) return;
    const def = UNIT_TYPES.find((u) => u.id === id);
    if (!def) return;
    if (this.credits < def.cost) { this.hud.flashError(id, 'funds'); return; }
    if (this.supplyUsed + def.supply > this.supplyCapEff) { this.hud.flashError(id, 'supply'); return; }
    if (this.entities.length >= this.unitCapEff) { modalManager.toast('UNIT CAP REACHED — FIELD SATURATED', 'warn'); return; }

    this.credits -= def.cost;
    this.supplyUsed += def.supply;
    this.deployedCount[id] = (this.deployedCount[id] || 0) + 1;
    this._addEntity(def, 'player', this.selectedLane);
    this.hud.setReserve(id, this.deployedCount[id]);
    this.hud.setCredits(this.credits);
    this.hud.updateShop(Math.floor(this.credits), this.supplyCapEff - this.supplyUsed);
    this.hud.pulseCard(id);
    AudioFX.sfx('buy');
    AudioFX.sfx('deploy');
  }

  /* ================= heroes (Milestone 4) ================= */

  _deployHero(id) {
    if (!this.running || this.paused || this.ending) return;
    const def = HERO_TYPES.find((h) => h.id === id);
    if (!def) return;
    if (!this.heroSys.canDeploy(id)) { AudioFX.sfx('error'); return; }
    if (this.credits < def.cost) { modalManager.toast('INSUFFICIENT CREDITS', 'warn'); return; }
    if (this.supplyUsed + def.supply > this.supplyCapEff) { modalManager.toast('SUPPLY CAP REACHED', 'warn'); return; }
    if (this.entities.length >= this.unitCapEff) { modalManager.toast('UNIT CAP REACHED', 'warn'); return; }

    this.credits -= def.cost;
    this.supplyUsed += def.supply;
    this._addHero(def, this.selectedLane);
    this.hud.setCredits(this.credits);
    AudioFX.sfx('deploy');
    AudioFX.sfx('combo');
    this.hud.announce(`${def.name} DEPLOYED — LANE ${this.lanes.getLane(this.selectedLane).letter}`, 'announce-ally');
  }

  _addHero(def, laneId) {
    const scene = this.ctx.scene;
    const role = def.role;
    const pos = this.lanes.getSpawnPosition('player', laneId, role);
    const handle = scene.addHeroMesh(def, pos.x, pos.z);
    const mods = this.upgradeSys.getMods();
    const e = {
      id: ++this.eid,
      def: { id: def.id, size: def.size },
      heroDef: def,
      isHero: true,
      side: 'player',
      role,
      laneId,
      size: def.size,
      hp: def.hp * mods.hpMult,
      dmg: def.dmg * mods.dmgMult,
      range: def.range,
      rate: def.rate / mods.rateMult,
      speed: def.speed,
      cd: 0.3,
      x: pos.x,
      z: pos.z,
      formJitter: 0,
      laneShifting: false,
      shiftT: 0,
      value: def.cost,
      supply: def.supply,
      handle
    };
    e.maxHp = e.hp;
    this.formation.assignSlot(e, laneId, role);
    scene.setUnitHP(handle, 1);
    this.entities.push(e);
    this.heroSys.markDeployed(def.id, e);
    return e;
  }

  /* ================= structures (Milestone 4) ================= */

  /** Spending hook used by StructureSystem; returns false when blocked. */
  spendFor(cost, supply) {
    if (this.credits < cost) { modalManager.toast('INSUFFICIENT CREDITS', 'warn'); return false; }
    if (this.supplyUsed + supply > this.supplyCapEff) { modalManager.toast('SUPPLY CAP REACHED', 'warn'); return false; }
    this.credits -= cost;
    this.supplyUsed += supply;
    this.hud.setCredits(this.credits);
    AudioFX.sfx('buy');
    return true;
  }

  /* ================= upgrades (Milestone 4) ================= */

  _toggleUpgrades() {
    this.upgradesOpen = !this.upgradesOpen;
    this.hud.setUpgradePanel(this.upgradesOpen);
    if (this.upgradesOpen) this._refreshUpgradePanel();
    AudioFX.sfx('click');
  }

  _buyUpgrade(id) {
    if (!this.running || this.paused || this.ending) return;
    const node = this.upgradeSys.node(id);
    if (!node) return;
    if (this.upgradeSys.isPurchased(id)) { AudioFX.sfx('error'); return; }
    if (node.req && !this.upgradeSys.isPurchased(node.req)) {
      AudioFX.sfx('error');
      modalManager.toast('RESEARCH LOCKED — REQUIRES PREVIOUS NODE', 'warn');
      return;
    }
    if (this.credits < node.cost) {
      AudioFX.sfx('error');
      modalManager.toast(`INSUFFICIENT CREDITS — NEED ${node.cost}`, 'warn');
      this.hud.gainFlash();
      return;
    }
    this.credits -= node.cost;
    this.upgradeSys.buy(id);
    this.hud.setCredits(this.credits);
    this.hud.setSupply(this.supplyUsed, this.supplyCapEff);
    this._refreshUpgradePanel();
    this._refreshCommandRail();
    AudioFX.sfx('combo');
    modalManager.toast(`${node.name} ONLINE`, 'ok');
    this.hud.announce(`RESEARCH COMPLETE — ${node.name}`, 'announce-ally');
  }

  _refreshUpgradePanel() {
    const nodes = [];
    Object.values(UPGRADE_TREE).forEach((branch) => {
      branch.forEach((n) => {
        nodes.push({
          id: n.id,
          branch: n.branch,
          name: n.name,
          desc: n.desc,
          cost: n.cost,
          purchased: this.upgradeSys.isPurchased(n.id),
          locked: n.req && !this.upgradeSys.isPurchased(n.req),
          affordable: this.credits >= n.cost
        });
      });
    });
    this.hud.renderUpgrades(nodes);
  }

  /** Updates hero chips + structure affordability on the command rail. */
  _refreshCommandRail() {
    HERO_TYPES.forEach((h) => {
      const st = this.heroSys.state[h.id];
      this.hud.setHero(h.id, {
        alive: st.alive,
        cdPct: st.alive ? 0 : st.cooldown / h.cooldown,
        ultPct: st.alive ? st.charge / h.ultKills : 0,
        affordable: this.credits >= h.cost
      });
    });
  }

  _useAbility() {
    if (!this.running || this.paused || this.ending) return;
    if (this.abilityCd > 0) { AudioFX.sfx('error'); return; }
    this.abilityCd = ABILITY.cooldown;
    this.hud.setAbility(1, false);

    const enemies = this.entities.filter((e) => e.side === 'enemy' && e.hp > 0);
    let pos;
    if (enemies.length) {
      const cx = enemies.reduce((s, e) => s + e.x, 0) / enemies.length;
      const cz = enemies.reduce((s, e) => s + e.z, 0) / enemies.length;
      pos = new Vector3(clamp(cx, -BATTLE.spawnX, BATTLE.spawnX), 0, clamp(cz, BATTLE.laneMin, BATTLE.laneMax));
    } else {
      pos = new Vector3(14, 0, 0);
    }
    this.ctx.scene.airstrikeFX(pos);
    AudioFX.sfx('airstrike');
    this.ctx.scene.shake(1.3);

    // physical shell volley — each shell detonates on impact
    const shellWeapon = {
      proj: 'shell', kind: 'explosive', speed: 10,
      splash: ABILITY.radius * 0.5, variance: 0.15, crit: 0
    };
    for (let i = 0; i < 5; i++) {
      this.combat.fire({
        weapon: shellWeapon,
        side: 'player',
        from: { x: pos.x, y: 26, z: pos.z },
        point: { x: pos.x + rand(-2.6, 2.6), z: pos.z + rand(-2.6, 2.6) },
        target: null,
        source: null,
        dmg: ABILITY.dmg * 0.42
      });
    }
  }

  /* ================= cinematic control ================= */

  /** Brief slow-motion window (boss entrance). */
  beginCinematic(dur) {
    this.cineT = dur;
    this.timeScale = 0.22;
  }

  /** Victory triggered by boss elimination. */
  bossVictory() {
    this._endBattle(true, 'WARBRINGER ELIMINATED — SECTOR SECURED');
  }

  /** Deterministic cover layout: pieces sit on lane boundaries. */
  _coverLayout() {
    const lanes = this.lanes.lanes;
    const zs = [];
    for (let i = 0; i < lanes.length - 1; i++) zs.push((lanes[i].zCenter + lanes[i + 1].zCenter) / 2);
    if (!zs.length) zs.push(0);
    return [-14, -7, 0, 7, 14].map((x, i) => ({
      type: i % 2 === 0 ? 'sandbag' : 'barricade',
      x: x + rand(-0.6, 0.6),
      z: zs[i % zs.length] + rand(-0.35, 0.35)
    }));
  }

  /* ================= end of battle ================= */
  _endBattle(victory, victoryLabel) {
    if (this.ending) return;
    this.ending = true;
    const scene = this.ctx.scene;
    this.timeScale = 1;
    this.cineT = 0;

    if (victory) {
      scene.collapseBase('enemy');
      scene.shake(1.4);
      this.hud.announce(victoryLabel || 'ENEMY HQ DEMOLISHED', 'announce-ally');
      AudioFX.sfx('victory');
      AudioFX.startMusic('victory');
    } else {
      scene.collapseBase('player');
      scene.shake(1.4);
      this.hud.announce('BASE LOST', 'announce-danger');
      AudioFX.sfx('defeat');
      AudioFX.startMusic('defeat');
    }

    const wavesCleared = victory ? BATTLE.finalWave : clamp(this.waveIdx, 0, BATTLE.finalWave);
    const xp = this.kills * 8 + wavesCleared * 120 + (victory ? 500 : 0) + this.bestCombo * 15;
    const stats = {
      victory,
      kills: this.kills,
      losses: this.losses,
      deployed: Object.values(this.deployedCount).reduce((s, v) => s + v, 0) + this.losses,
      earned: Math.round(this.earned),
      bestCombo: this.bestCombo,
      wavesCleared,
      time: this.time,
      xp
    };
    const rankInfo = SaveManager.recordBattle(stats, victory);
    stats.rankUp = rankInfo.rankUp;
    stats.rank = rankInfo.rank;

    const token = (this._endToken = Symbol('end'));
    setTimeout(() => {
      if (this._endToken !== token) return; // mission was restarted/aborted meanwhile
      this.running = false;
      this.ending = false;
      EventBus.emit('battle:end', stats);
    }, 1900);
  }
}
