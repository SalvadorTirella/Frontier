/* ============================================================
   UpgradeSystem — battle-long research tree
   ------------------------------------------------------------
   Three branches (weapons / armor / logistics). A purchase is
   recorded once, applies an incremental effect to every living
   unit immediately, and shapes every future spawn via getMods().
   ============================================================ */
import EventBus from './EventBus.js';
import { UPGRADE_TREE } from './Config.js';

const MULT_KEYS = ['dmgMult', 'rateMult', 'hpMult', 'incomeMult', 'killRatioMult', 'explosiveResist'];
const ADD_KEYS = ['supplyCapAdd', 'critBonus', 'regen'];

export default class UpgradeSystem {
  /** @param {object} hooks { battle } */
  constructor(hooks) {
    this.hooks = hooks;
    /** @type {Set<string>} purchased upgrade ids */
    this.purchased = new Set();
  }

  reset() {
    this.purchased.clear();
  }

  node(id) {
    for (const branch of Object.values(UPGRADE_TREE)) {
      const found = branch.find((n) => n.id === id);
      if (found) return found;
    }
    return null;
  }

  /** Branch name (weapons / armor / logistics) owning a node id. */
  _branchOf(id) {
    for (const [name, nodes] of Object.entries(UPGRADE_TREE)) {
      if (nodes.some((n) => n.id === id)) return name;
    }
    return 'unknown';
  }

  isPurchased(id) {
    return this.purchased.has(id);
  }

  /** Purchase gate: not owned, requirement met, credits available. */
  canBuy(id) {
    const node = this.node(id);
    if (!node || this.purchased.has(id)) return false;
    if (node.req && !this.purchased.has(node.req)) return false;
    return this.hooks.battle.credits >= node.cost;
  }

  /**
   * Records the purchase and pushes the incremental effect onto
   * every living player unit. Future spawns read getMods().
   * @returns {object|null} the bought node (null when rejected)
   */
  buy(id) {
    if (!this.canBuy(id)) return null;
    const node = this.node(id);
    this.purchased.add(id);
    this._applyToLiving(node.effect);
    EventBus.emit('upgrade:purchased', { id, name: node.name, branch: this._branchOf(id) });
    EventBus.emit('upgrade:bought', { id, name: node.name });
    return node;
  }

  /** Brightens stripes and scales stats of units already on the field. */
  _applyToLiving(effect) {
    const { battle } = this.hooks;
    battle.entities.forEach((e) => {
      if (e.side !== 'player' || e.hp <= 0 || e.isStructure) return;
      if (effect.dmgMult) e.dmg *= effect.dmgMult;
      if (effect.rateMult) e.rate /= effect.rateMult; // higher rate → shorter interval
      if (effect.hpMult) {
        e.maxHp *= effect.hpMult;
        e.hp *= effect.hpMult;
        battle.ctx.scene.setUnitHP(e.handle, e.hp / e.maxHp);
      }
      if (e.handle) battle.ctx.scene.brightenStripe(e.handle);
    });
  }

  /**
   * Cumulative multipliers from every purchased node — used when a
   * new unit spawns so it inherits the whole tech state.
   */
  getMods() {
    const m = {
      dmgMult: 1, rateMult: 1, hpMult: 1,
      incomeMult: 1, killRatioMult: 1, explosiveResist: 1,
      supplyCapAdd: 0, critBonus: 0, regen: 0
    };
    this.purchased.forEach((id) => {
      const node = this.node(id);
      if (!node) return;
      Object.entries(node.effect).forEach(([k, v]) => {
        if (MULT_KEYS.includes(k)) m[k] *= v;
        else if (ADD_KEYS.includes(k)) m[k] += v;
      });
    });
    return m;
  }
}
