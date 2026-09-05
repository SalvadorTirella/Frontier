/* ============================================================
   StructureSystem — placeable defensive structures
   ------------------------------------------------------------
   sandbag / barricade register as CoverObjects (damage soak + LoS)
   turret  → auto-fires through the CombatEngine
   mine    → proximity detonation (area damage)
   Placement: HUD select → canvas preview → click to place.
   ============================================================ */
import EventBus from './EventBus.js';
import { STRUCTURE_TYPES, COVER_DEFS, BATTLE, WEAPONS } from './Config.js';
import { rand } from '../utils/DOMUtils.js';

const TURRET_WEAPON = { proj: 'bullet', kind: 'kinetic', speed: 52, variance: 0.15, crit: 0.06 };

export default class StructureSystem {
  /** @param {object} hooks { battle, scene, combat, cover, lanes } */
  constructor(hooks) {
    this.hooks = hooks;
    /** @type {object[]} live structures */
    this.structures = [];
    this.sid = 0;
    /** @type {string|null} structure type currently being placed */
    this.placingId = null;
  }

  reset() {
    [...this.structures].forEach((s) => this._teardown(s));
    this.structures = [];
    this.placingId = null;
    this.hooks.scene.clearPlacementPreview();
  }

  getDef(id) {
    return STRUCTURE_TYPES.find((s) => s.id === id);
  }

  select(id) {
    this.placingId = this.placingId === id ? null : id;
    if (!this.placingId) this.hooks.scene.clearPlacementPreview();
    EventBus.emit('structure:placing', { id: this.placingId });
  }

  cancel() {
    if (this.placingId) {
      this.placingId = null;
      this.hooks.scene.clearPlacementPreview();
      EventBus.emit('structure:placing', { id: null });
    }
  }

  /**
   * Spatial validation for a placement point.
   * @returns {{ok:boolean, reason?:string}}
   */
  validate(x, z) {
    const def = this.getDef(this.placingId);
    if (!def) return { ok: false, reason: 'none' };
    const maxX = BATTLE.spawnX - 3;
    if (Math.abs(x) > maxX) return { ok: false, reason: 'OUT OF BOUNDS' };
    if (z < BATTLE.laneMin - 0.5 || z > BATTLE.laneMax + 0.5) return { ok: false, reason: 'OUT OF BOUNDS' };
    const w = (def.isCover ? COVER_DEFS[def.id].w : def.w) || 1.4;
    const d = (def.isCover ? COVER_DEFS[def.id].d : def.d) || 1.4;
    for (const s of this.structures) {
      const sw = (s.def.isCover ? COVER_DEFS[s.def.id].w : s.def.w) || 1.4;
      const sd = (s.def.isCover ? COVER_DEFS[s.def.id].d : s.def.d) || 1.4;
      if (Math.abs(x - s.x) < (w + sw) / 2 + 0.4 && Math.abs(z - s.z) < (d + sd) / 2 + 0.4) {
        return { ok: false, reason: 'OBSTRUCTED' };
      }
    }
    return { ok: true };
  }

  /**
   * Attempts to place the selected structure at (x, z).
   * Credits / supply are spent through the battle hook.
   * @returns {boolean} true when placed
   */
  tryPlace(x, z) {
    const def = this.getDef(this.placingId);
    if (!def) return false;
    const v = this.validate(x, z);
    if (!v.ok) return false;
    if (!this.hooks.battle.spendFor(def.cost, def.supply)) return false;

    const s = {
      id: ++this.sid,
      def,
      side: 'player',
      x, z,
      hp: def.isCover ? COVER_DEFS[def.id].hp : def.hp,
      maxHp: def.isCover ? COVER_DEFS[def.id].hp : def.hp,
      size: 1,
      laneId: this.hooks.lanes.getNearestLane(z).id,
      cd: rand(0.2, 0.6),
      isStructure: true,
      handle: null,
      cover: null
    };
    s.handle = this.hooks.scene.addStructureMesh(s);
    this.structures.push(s);

    // cover-type structures join the CoverSystem (soak + LoS)
    if (def.isCover) {
      const cd = COVER_DEFS[def.id];
      s.cover = {
        id: `sc-${s.id}`, type: def.id, x, z,
        w: cd.w, d: cd.d, h: cd.h,
        hp: s.hp, maxHp: s.maxHp,
        coverValue: cd.coverValue, blocksLoS: cd.blocksLoS,
        handle: s.handle, _mat: null, structureRef: s
      };
      this.hooks.cover.registerCover(s.cover);
    }

    EventBus.emit('structure:placed', { id: def.id });
    this.hooks.scene.clearPlacementPreview();
    this.placingId = null;
    EventBus.emit('structure:placing', { id: null });
    return true;
  }

  /** Per-frame: turret fire + mine proximity. */
  tick(dt) {
    const { battle, combat, scene } = this.hooks;
    for (let i = this.structures.length - 1; i >= 0; i--) {
      const s = this.structures[i];
      if (s.hp <= 0) continue;

      if (s.def.id === 'turret') {
        s.cd -= dt;
        if (s.cd <= 0) {
          const target = this._nearestEnemy(s);
          if (target) {
            s.cd = s.def.rate;
            combat.fire({
              weapon: TURRET_WEAPON,
              side: 'player',
              from: { x: s.x, y: s.def.h + 0.2, z: s.z },
              target,
              source: s,
              dmg: s.def.dmg
            });
            scene.muzzle({ x: s.x, y: s.def.h + 0.2, z: s.z }, 'player');
          } else {
            s.cd = 0.25;
          }
        }
      } else if (s.def.id === 'mine') {
        const r2 = s.def.radius * s.def.radius;
        const hit = battle.entities.some((e) => {
          if (e.side !== 'enemy' || e.hp <= 0) return false;
          return (e.x - s.x) ** 2 + (e.z - s.z) ** 2 <= r2;
        });
        if (hit) {
          battle._splash(s.x, s.z, s.def.radius, s.def.dmg, 'player', {
            kind: 'explosive', variance: 0.12, critChance: 0, source: s, splash: true
          });
          this.damageStructure(s, s.maxHp); // consume the mine
        }
      }
    }
  }

  _nearestEnemy(s) {
    const { battle } = this.hooks;
    let best = null;
    let bd = s.def.range * s.def.range;
    battle.entities.forEach((e) => {
      if (e.side !== 'enemy' || e.hp <= 0) return;
      const d2 = (e.x - s.x) ** 2 + (e.z - s.z) ** 2;
      if (d2 < bd) { bd = d2; best = e; }
    });
    return best;
  }

  /** Applies damage; tears the structure down at 0 hp. */
  damageStructure(s, dmg) {
    if (!s || s.hp <= 0) return;
    s.hp -= dmg;
    if (s.cover) s.cover.hp = Math.max(0, s.hp);
    if (s.hp <= 0) {
      this._teardown(s);
      this.structures = this.structures.filter((x) => x !== s);
      EventBus.emit('structure:destroyed', { id: s.def.id });
    } else if (s.handle) {
      this.hooks.scene.updateStructureDamage(s);
    }
  }

  _teardown(s) {
    const { scene, cover } = this.hooks;
    scene.explode({ x: s.x, y: 0.8, z: s.z }, 0.9, 'red');
    if (s.cover) {
      const idx = cover.covers.indexOf(s.cover);
      if (idx >= 0) cover.covers.splice(idx, 1);
    }
    scene.removeStructureMesh(s);
  }
}
