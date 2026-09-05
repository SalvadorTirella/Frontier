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
  ROLE_BY_UNIT, FORMATION, LANE_SWITCH
} from '../core/Config.js';
import FormationSystem from '../core/FormationSystem.js';

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

    const canvas = ctx.scene.canvas;
    if (canvas) {
      canvas.addEventListener('pointerdown', (ev) => {
        if (!this.running || this.paused || this.ending || !this.lanes) return;
        const p = this.ctx.scene.pickGround(ev.clientX, ev.clientY);
        if (p && Math.abs(p.x) < BATTLE.spawnX + 5) {
          this._selectLane(this.lanes.getNearestLane(p.z).id);
        }
      });
      let hoverT = 0;
      canvas.addEventListener('pointermove', (ev) => {
        const now = performance.now();
        if (now - hoverT < 110) return;
        hoverT = now;
        if (!this.running || this.paused || !this.lanes) return;
        const p = this.ctx.scene.pickGround(ev.clientX, ev.clientY);
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
    this.hud.setSupply(0, ECONOMY.supplyCap);
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
    if (this.formation) this.formation.clear();
    this.ctx.scene.setSelectedLane(null);
    this.ctx.scene.setHoverLane(null);
    this.hud.setHoverLane(null);
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

  /* ================= main tick ================= */
  tick(dt) {
    if (!this.running || this.paused || this.ending) return;
    this.time += dt;

    /* economy */
    const income = ECONOMY.income + Math.max(0, this.waveIdx) * ECONOMY.incomePerWave;
    this.credits += income * dt;
    this.earned += income * dt;

    /* combo decay */
    if (this.combo > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) { this.combo = 0; this.hud.setCombo(0, 0); }
      else this.hud.setCombo(this.combo, this.comboT / BATTLE.comboWindow);
    }

    /* ability cooldown */
    if (this.abilityCd > 0) {
      this.abilityCd = Math.max(0, this.abilityCd - dt);
      this.hud.setAbility(this.abilityCd / ABILITY.cooldown, this.abilityCd === 0);
    }

    /* wave director */
    this._direct(dt);

    /* entities */
    this._updateEntities(dt);

    /* base fx throttle */
    this.baseFxT = Math.max(0, this.baseFxT - dt);
    this.floatTimer -= dt;
    if (this.floatTimer <= 0) { this.floatTimer = 0.5; this.floatBudget = 9; }

    /* HUD refresh ~8Hz */
    this.uiAcc += dt;
    if (this.uiAcc >= 0.12) {
      this.uiAcc = 0;
      this.hud.setCredits(this.credits, false);
      this.hud.setSupply(this.supplyUsed, ECONOMY.supplyCap);
      this.hud.setHostiles(this.entities.filter((e) => e.side === 'enemy').length);
      this.hud.updateShop(Math.floor(this.credits), ECONOMY.supplyCap - this.supplyUsed);
    }
  }

  _direct(dt) {
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
    this.hud.showBanner(
      isFinal ? 'FINAL WAVE' : `WAVE ${pad2(i + 1)}`,
      isFinal ? 'MAXIMUM THREAT — BREAK THEIR HQ' : `${this.spawnQueue.length} HOSTILES INBOUND — HOLD THE LINE`,
      isFinal ? 'banner-danger' : ''
    );
    AudioFX.sfx('wave');
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
    const e = {
      id: ++this.eid,
      def,
      side,
      role,
      laneId,
      size: def.size,
      hp: mods.hp ?? def.hp,
      dmg: mods.dmg ?? def.dmg,
      range: def.range,
      rate: def.rate,
      speed: def.speed,
      cd: rand(0.1, 0.55),
      x: pos.x,
      z: pos.z,
      formJitter: rand(-FORMATION.jitterX, FORMATION.jitterX),
      laneShifting: false,
      shiftT: 0,
      value: def.cost,
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

  _fire(e, target) {
    const scene = this.ctx.scene;
    const dir = e.side === 'player' ? 1 : -1;
    const a = new Vector3(e.x + dir * 1.25 * e.size, 0.95 * e.size, e.z);
    const b = new Vector3(target.x, 0.95 * target.size, target.z);
    scene.tracer(a, b, e.side);
    scene.muzzle(a, e.side);
    AudioFX.sfx(e.def.id === 'tank' || e.def.id === 'artillery' ? 'cannon' : 'shot');

    const dmg = e.dmg * rand(0.85, 1.18);
    if (e.def.splash) {
      scene.explode(new Vector3(target.x, 0.7, target.z), 0.85);
      this._damageEntity(target, dmg, e);
      for (const o of this.entities) {
        if (o.side === e.side || o === target || o.hp <= 0) continue;
        const dx = o.x - target.x, dz = o.z - target.z;
        if (dx * dx + dz * dz <= e.def.splash * e.def.splash) this._damageEntity(o, dmg * 0.7, e);
      }
    } else {
      this._damageEntity(target, dmg, e);
    }
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
    if (this.baseFxT <= 0) {
      this.baseFxT = 0.3;
      scene.damageBaseFX(targetSide);
      if (targetSide === 'player') scene.shake(0.7);
    }
    this._damageBase(targetSide, e.dmg);
  }

  _damageEntity(t, dmg, source) {
    if (t.hp <= 0) return;
    t.hp -= dmg;
    this.ctx.scene.setUnitHP(t.handle, t.hp / t.maxHp);

    if (this.floatBudget > 0) {
      this.floatBudget--;
      const p = this.ctx.scene.project(new Vector3(t.x, 2.3 * t.size, t.z));
      if (p.x > 20 && p.x < BASE_W - 20 && p.y > 20 && p.y < BASE_H - 20) {
        this.hud.float(p.x + rand(-14, 14), p.y, Math.round(dmg), dmg > 45 ? 'dmg-crit' : '');
      }
    }
    AudioFX.sfx('hit');

    if (t.hp <= 0) this._killEntity(t, source);
  }

  _killEntity(t) {
    const scene = this.ctx.scene;
    scene.explode(new Vector3(t.x, 0.75, t.z), 0.85 + t.size * 0.35, t.side === 'enemy' ? 'amber' : 'red');
    AudioFX.sfx('explode');
    if (t.size >= 1.4 || Math.abs(t.x) > 22) scene.shake(0.55);
    this.formation.releaseSlot(t); // survivors glide into the freed slots
    scene.removeUnit(t.handle);
    const idx = this.entities.indexOf(t);
    if (idx >= 0) this.entities.splice(idx, 1);

    if (t.side === 'enemy') {
      this.combo += 1;
      this.comboT = BATTLE.comboWindow;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const mult = 1 + Math.min(this.combo - 1, 20) * 0.06;
      const reward = Math.round(t.value * ECONOMY.killRatio * mult);
      this.credits += reward;
      this.earned += reward;
      this.kills += 1;
      this.hud.setCombo(this.combo, 1);
      if (this.combo >= 2 && this.combo % 2 === 0) AudioFX.sfx('combo');
      const p = scene.project(new Vector3(t.x, 2.6, t.z));
      if (p.x > 20 && p.x < BASE_W - 20) this.hud.float(p.x, p.y - 18, `+${reward}`, 'dmg-gain');
      this.hud.gainFlash();
    } else {
      this.losses += 1;
      this.supplyUsed = Math.max(0, this.supplyUsed - t.def.supply);
      this.deployedCount[t.def.id] = Math.max(0, (this.deployedCount[t.def.id] || 0) - 1);
      this.hud.setReserve(t.def.id, this.deployedCount[t.def.id]);
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
    if (this.supplyUsed + def.supply > ECONOMY.supplyCap) { this.hud.flashError(id, 'supply'); return; }
    if (this.entities.length >= this.unitCapEff) { modalManager.toast('UNIT CAP REACHED — FIELD SATURATED', 'warn'); return; }

    this.credits -= def.cost;
    this.supplyUsed += def.supply;
    this.deployedCount[id] = (this.deployedCount[id] || 0) + 1;
    this._addEntity(def, 'player', this.selectedLane);
    this.hud.setReserve(id, this.deployedCount[id]);
    this.hud.setCredits(this.credits);
    this.hud.updateShop(Math.floor(this.credits), ECONOMY.supplyCap - this.supplyUsed);
    this.hud.pulseCard(id);
    AudioFX.sfx('buy');
    AudioFX.sfx('deploy');
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

    const r2 = ABILITY.radius * ABILITY.radius;
    [...enemies].forEach((e) => {
      const dx = e.x - pos.x, dz = e.z - pos.z;
      if (dx * dx + dz * dz <= r2) this._damageEntity(e, ABILITY.dmg * rand(0.9, 1.1), null);
    });
  }

  /* ================= end of battle ================= */
  _endBattle(victory) {
    if (this.ending) return;
    this.ending = true;
    const scene = this.ctx.scene;

    if (victory) {
      scene.collapseBase('enemy');
      scene.shake(1.4);
      this.hud.announce('ENEMY HQ DEMOLISHED', 'announce-ally');
      AudioFX.sfx('victory');
    } else {
      scene.collapseBase('player');
      scene.shake(1.4);
      this.hud.announce('BASE LOST', 'announce-danger');
      AudioFX.sfx('defeat');
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
