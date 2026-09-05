/* ============================================================
   LaneSystem — tactical lane topology for the battlefield
   ------------------------------------------------------------
   Lanes run parallel to the advance axis (X). Each lane is a
   straight corridor delimited in Z. Topology is linear by
   default (a lane connects to its neighbours) but custom
   topologies (branches/merges) can be injected as a matrix of
   connections, supporting 1..N lanes.
   ============================================================ */
import { BATTLE, FORMATION } from './Config.js';

/**
 * @typedef {Object} Lane
 * @property {number}   id          lane index (0..count-1)
 * @property {number}   zCenter     world Z of the lane center line
 * @property {number}   width       corridor width in world units
 * @property {boolean}  isOpen      whether units may enter/remain in the lane
 * @property {number[]} connections ids of lanes a unit may transition into
 * @property {string}   letter      human-readable label (A, B, C, ...)
 */

/**
 * @typedef {Object} LaneSystemConfig
 * @property {number}        [count=3]     number of parallel lanes (1..5+)
 * @property {number[][]}    [connections] optional custom adjacency matrix
 */

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export default class LaneSystem {
  /**
   * @param {LaneSystemConfig} [config]
   */
  constructor(config = {}) {
    /** @type {Lane[]} */
    this.lanes = [];
    this.configure(config.count || 3, config.connections || null);
  }

  /**
   * Rebuilds the lane topology. Evenly distributes lanes across
   * [BATTLE.laneMin, BATTLE.laneMax].
   * @param {number} count
   * @param {number[][]|null} [connections] custom adjacency matrix
   */
  configure(count, connections = null) {
    const n = Math.max(1, Math.min(8, Math.round(count)));
    const span = BATTLE.laneMax - BATTLE.laneMin;
    const width = span / n;
    this.lanes = [];
    for (let i = 0; i < n; i++) {
      this.lanes.push({
        id: i,
        zCenter: BATTLE.laneMin + width * (i + 0.5),
        width,
        isOpen: true,
        connections: [],
        letter: LETTERS[i] || String(i + 1)
      });
    }
    if (connections) {
      // custom topology (branches / merges)
      this.lanes.forEach((lane, i) => {
        lane.connections = (connections[i] || []).filter((id) => id >= 0 && id < n && id !== i);
      });
    } else {
      // default linear topology: connect to immediate neighbours
      this.lanes.forEach((lane) => {
        if (lane.id > 0) lane.connections.push(lane.id - 1);
        if (lane.id < n - 1) lane.connections.push(lane.id + 1);
      });
    }
  }

  /** @returns {number} amount of lanes in the current topology */
  get laneCount() {
    return this.lanes.length;
  }

  /** @returns {number} id of the central lane */
  get middleLane() {
    return Math.floor(this.lanes.length / 2);
  }

  /**
   * @param {number} id
   * @returns {Lane|undefined}
   */
  getLane(id) {
    return this.lanes[id];
  }

  /**
   * Deterministic spawn position for a unit.
   * @param {'player'|'enemy'} side
   * @param {number} laneId
   * @param {string} [role] formation role — back rows spawn slightly deeper
   * @returns {{x:number, z:number}}
   */
  getSpawnPosition(side, laneId, role = 'MIDDLE') {
    const lane = this.lanes[laneId] || this.lanes[this.middleLane];
    const dir = side === 'player' ? -1 : 1;
    const depth = (FORMATION.depth && FORMATION.depth[role]) || 0;
    const x = dir * (BATTLE.spawnX + depth * 0.3);
    return { x, z: lane.zCenter };
  }

  /**
   * Nearest lane to a world Z coordinate.
   * @param {number} z
   * @returns {Lane}
   */
  getNearestLane(z) {
    let best = this.lanes[0];
    let bestD = Infinity;
    for (const lane of this.lanes) {
      const d = Math.abs(lane.zCenter - z);
      if (d < bestD) { bestD = d; best = lane; }
    }
    return best;
  }

  /**
   * Lane whose corridor contains the given Z (or nearest if outside).
   * @param {number} z
   * @returns {Lane}
   */
  getLaneAt(z) {
    for (const lane of this.lanes) {
      if (Math.abs(z - lane.zCenter) <= lane.width / 2) return lane;
    }
    return this.getNearestLane(z);
  }

  /**
   * Lane ids the given lane may transition into (open lanes only).
   * @param {number} laneId
   * @returns {number[]}
   */
  getValidTransitions(laneId) {
    const lane = this.lanes[laneId];
    if (!lane) return [];
    return lane.connections.filter((id) => this.lanes[id] && this.lanes[id].isOpen);
  }

  /**
   * Opens/closes a lane (reserved for future map events).
   * @param {number} laneId
   * @param {boolean} open
   */
  setOpen(laneId, open) {
    const lane = this.lanes[laneId];
    if (lane) lane.isOpen = !!open;
  }

  /**
   * Cheapest connected lane given a population map.
   * @param {number} laneId
   * @param {Record<number, number>} counts units per lane
   * @returns {number|null} lane id or null
   */
  leastPopulatedNeighbour(laneId, counts) {
    const options = this.getValidTransitions(laneId);
    if (!options.length) return null;
    let best = null;
    let bestC = Infinity;
    for (const id of options) {
      const c = counts[id] || 0;
      if (c < bestC) { bestC = c; best = id; }
    }
    return best;
  }
}
