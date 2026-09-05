/* ============================================================
   FormationSystem — role-based formation slots per lane
   ------------------------------------------------------------
   Roles:  FRONT  (heavy / tanks)      → lead the advance
           MIDDLE (riflemen, gunners)  → core infantry line
           BACK   (artillery, RPG)     → fire support, rear
   Each role keeps an ordered slot list per (side, lane). The
   formation target of a unit is derived from the lane's anchor
   (the live front line) plus a role depth and a lateral column
   offset. When a unit dies, slots are re-indexed and surviving
   units glide to their new positions (smooth, no snapping).
   ============================================================ */
import EventBus from './EventBus.js';
import { BATTLE, FORMATION } from './Config.js';

export const ROLES = ['FRONT', 'MIDDLE', 'BACK'];

export default class FormationSystem {
  /**
   * @param {import('./LaneSystem.js').default} laneSystem
   */
  constructor(laneSystem) {
    this.lanes = laneSystem;
    /** @type {Record<string, Record<number, Record<string, any[]>>>} */
    this.groups = { player: {}, enemy: {} };
    this._ensureGroups();
  }

  _ensureGroups() {
    ['player', 'enemy'].forEach((side) => {
      this.groups[side] = {};
      this.lanes.lanes.forEach((lane) => {
        this.groups[side][lane.id] = { FRONT: [], MIDDLE: [], BACK: [] };
      });
    });
  }

  /** Wipes every slot (battle reset / abort). */
  clear() {
    this._ensureGroups();
  }

  _list(side, laneId, role) {
    const laneGroups = this.groups[side][laneId];
    if (!laneGroups) return null;
    return laneGroups[role] || null;
  }

  /**
   * Assigns an entity to a slot in (lane, role). Releases any
   * previous slot first and reforms both affected lanes.
   * @param {object} entity
   * @param {number} laneId
   * @param {string} role FRONT | MIDDLE | BACK
   * @returns {number} slot index
   */
  assignSlot(entity, laneId, role) {
    const prevLane = entity.laneId;
    const prevRole = entity.role;
    if (prevLane !== undefined && (prevLane !== laneId || prevRole !== role)) {
      const old = this._list(entity.side, prevLane, prevRole);
      if (old) {
        const idx = old.indexOf(entity);
        if (idx >= 0) old.splice(idx, 1);
        this.reform(entity.side, prevLane, true);
      }
    }
    const list = this._list(entity.side, laneId, role);
    if (!list) return 0;
    if (!list.includes(entity)) list.push(entity);
    const wasTransition = prevLane !== undefined;
    entity.laneId = laneId;
    entity.role = role;
    entity.slotIndex = list.indexOf(entity);
    // silent on fresh spawns; audible when a live unit changes lane/role
    this.reform(entity.side, laneId, !wasTransition);
    return entity.slotIndex;
  }

  /**
   * Frees the entity's slot and reflows the lane formation.
   * @param {object} entity
   */
  releaseSlot(entity) {
    if (entity.laneId === undefined) return;
    const list = this._list(entity.side, entity.laneId, entity.role);
    if (list) {
      const idx = list.indexOf(entity);
      if (idx >= 0) list.splice(idx, 1);
    }
    const side = entity.side;
    const laneId = entity.laneId;
    entity.laneId = undefined;
    this.reform(side, laneId); // emits formation:reformed — survivors close ranks
  }

  /**
   * Re-indexes every slot of a lane so survivors close the gaps.
   * Targets are recomputed from indices every frame, so units
   * interpolate smoothly toward their new slots.
   * @param {'player'|'enemy'} side
   * @param {number} laneId
   * @param {boolean} [silent] skip the event (used during assign)
   */
  reform(side, laneId, silent = false) {
    const laneGroups = this.groups[side][laneId];
    if (!laneGroups) return;
    ROLES.forEach((role) => {
      laneGroups[role].forEach((e, i) => { e.slotIndex = i; });
    });
    if (!silent) EventBus.emit('formation:reformed', { side, laneId });
  }

  /**
   * Computes the per-(side, lane) front-line anchor from live entities.
   * The anchor is the most advanced row actually present in the lane
   * (FRONT first, then MIDDLE, then BACK), so lanes without tanks
   * still march: the lead row chases the forward lead point.
   * Player = max X, enemy = min X. Pure function — no drift.
   * @param {object[]} entities live entity list
   * @returns {Record<string, Record<number, {x:number, role:string}>>}
   */
  computeAnchors(entities) {
    const anchors = { player: {}, enemy: {} };
    const roleX = { player: {}, enemy: {} };
    this.lanes.lanes.forEach((lane) => {
      anchors.player[lane.id] = { x: -BATTLE.spawnX, role: 'FRONT' };
      anchors.enemy[lane.id] = { x: BATTLE.spawnX, role: 'FRONT' };
      roleX.player[lane.id] = {};
      roleX.enemy[lane.id] = {};
    });
    for (const e of entities) {
      if (e.hp <= 0 || e.laneId === undefined) continue;
      const prev = roleX[e.side][e.laneId][e.role];
      roleX[e.side][e.laneId][e.role] = prev === undefined
        ? e.x
        : (e.side === 'player' ? Math.max(prev, e.x) : Math.min(prev, e.x));
    }
    this.lanes.lanes.forEach((lane) => {
      ['player', 'enemy'].forEach((side) => {
        for (const role of ROLES) {
          const v = roleX[side][lane.id][role];
          if (v !== undefined) {
            anchors[side][lane.id] = { x: v, role };
            break;
          }
        }
      });
    });
    return anchors;
  }

  /**
   * Desired world position of an entity inside its formation.
   * X = lane anchor + forward lead − relative role depth (+ jitter).
   * Depth is measured relative to the anchor row so the lead row
   * always chases the forward lead point and the formation marches.
   * Z = lane center + centered column offset for its slot index.
   * @param {object} entity
   * @param {Record<string, Record<number, {x:number, role:string}>>} anchors
   * @returns {{x:number, z:number}}
   */
  getFormationTarget(entity, anchors) {
    const lane = this.lanes.getLane(entity.laneId) || this.lanes.getLane(this.lanes.middleLane);
    const dir = entity.side === 'player' ? 1 : -1;
    const anchor = anchors[entity.side][entity.laneId] ?? { x: dir > 0 ? -BATTLE.spawnX : BATTLE.spawnX, role: 'FRONT' };
    const depth = FORMATION.depth[entity.role] ?? FORMATION.depth.MIDDLE;
    const anchorDepth = FORMATION.depth[anchor.role] ?? 0;
    const relDepth = depth - anchorDepth;

    let x = anchor.x + dir * FORMATION.leadPush - dir * relDepth + (entity.formJitter || 0);
    const wallLimit = BATTLE.baseX - 1.1;
    if (x > wallLimit) x = wallLimit;
    if (x < -wallLimit) x = -wallLimit;

    const list = this._list(entity.side, entity.laneId, entity.role);
    const n = list ? list.length : 1;
    const idx = list ? Math.max(0, list.indexOf(entity)) : 0;
    const offset = (idx - (n - 1) / 2) * FORMATION.colSpacing;
    const maxOff = Math.max(0.4, lane.width / 2 - 0.55);
    const z = lane.zCenter + Math.max(-maxOff, Math.min(maxOff, offset));

    return { x, z };
  }

  /**
   * Total formation slots available across all lanes (for unit cap).
   * @returns {number}
   */
  totalSlots() {
    return this.lanes.laneCount * FORMATION.slotsPerLane;
  }
}
