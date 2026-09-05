/* ============================================================
   CoverSystem — destructible cover objects & line-of-sight
   ------------------------------------------------------------
   CoverObject: { id, type, x, z, w, d, h, hp, maxHp, coverValue,
                  blocksLoS, handle }
   - coverValue (0..1) reduces incoming damage for units nearby
   - blocksLoS cover intercepts kinetic projectiles
   - explosive projectiles only suffer 40% of the reduction
   ============================================================ */
import EventBus from './EventBus.js';
import { COVER_DEFS } from './Config.js';

export default class CoverSystem {
  /** @param {object} scene SceneController instance (mesh rendering) */
  constructor(scene) {
    this.scene = scene;
    /** @type {object[]} */
    this.covers = [];
    this.cid = 0;
  }

  /**
   * Builds the battlefield cover layout.
   * @param {{type:string, x:number, z:number}[]} layout
   */
  generate(layout) {
    this.clear();
    layout.forEach((spot) => {
      const def = COVER_DEFS[spot.type];
      if (!def) return;
      const cover = {
        id: ++this.cid,
        type: spot.type,
        x: spot.x,
        z: spot.z,
        w: def.w,
        d: def.d,
        h: def.h,
        hp: def.hp,
        maxHp: def.hp,
        coverValue: def.coverValue,
        blocksLoS: def.blocksLoS,
        handle: null
      };
      cover.handle = this.scene.addCoverMesh(cover);
      this.covers.push(cover);
    });
  }

  clear() {
    this.covers.forEach((c) => this.scene.removeCoverMesh(c));
    this.covers = [];
  }

  /** @param {object} obj */
  registerCover(obj) {
    if (!this.covers.includes(obj)) this.covers.push(obj);
  }

  /**
   * Nearest cover whose (expanded) AABB contains the point.
   * @param {number} x @param {number} z @param {number} radius
   * @returns {object|null}
   */
  getCoverAt(x, z, radius = 1.4) {
    let best = null;
    let bestD = Infinity;
    for (const c of this.covers) {
      if (c.hp <= 0) continue;
      const ex = c.w / 2 + radius;
      const ez = c.d / 2 + radius;
      if (Math.abs(x - c.x) > ex || Math.abs(z - c.z) > ez) continue;
      const d = (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  /**
   * 2D segment-vs-AABB test against every LoS-blocking cover.
   * @returns {object|null} the blocking cover, if any
   */
  blocksLoS(ax, az, bx, bz) {
    for (const c of this.covers) {
      if (!c.blocksLoS || c.hp <= 0) continue;
      const minX = c.x - c.w / 2, maxX = c.x + c.w / 2;
      const minZ = c.z - c.d / 2, maxZ = c.z + c.d / 2;
      if (this._segHitsBox(ax, az, bx, bz, minX, minZ, maxX, maxZ)) return c;
    }
    return null;
  }

  _segHitsBox(x1, z1, x2, z2, minX, minZ, maxX, maxZ) {
    let tmin = 0;
    let tmax = 1;
    const dx = x2 - x1;
    const dz = z2 - z1;
    for (const [p, d, lo, hi] of [[x1, dx, minX, maxX], [z1, dz, minZ, maxZ]]) {
      if (Math.abs(d) < 1e-8) {
        if (p < lo || p > hi) return false;
      } else {
        let t1 = (lo - p) / d;
        let t2 = (hi - p) / d;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return false;
      }
    }
    return true;
  }

  /**
   * Applies damage to a cover piece; destroys it at 0 hp.
   * @param {object} obj @param {number} dmg
   */
  damageCover(obj, dmg) {
    if (!obj || obj.hp <= 0) return;
    obj.hp -= dmg;
    if (obj.hp <= 0) {
      obj.hp = 0;
      this.destroyCover(obj);
    } else {
      this.scene.updateCoverDamage(obj);
    }
  }

  /** @param {object} obj */
  destroyCover(obj) {
    this.scene.destroyCoverFX(obj);
    this.scene.removeCoverMesh(obj);
    this.covers = this.covers.filter((c) => c !== obj);
    EventBus.emit('cover:destroyed', { id: obj.id, type: obj.type });
  }
}
