/* ============================================================
   HeroSystem — autonomous hero commanders
   ------------------------------------------------------------
   Each hero is a special entity (isHero) inside BattleScreen.
   - auras fire every second on allies within auraRadius
       medic   → heals
       support → damage / fire-rate buff
   - assault re-routes itself to the most threatened lane
   - ultimates charge on player kills and fire automatically
   - on death the hero enters a deploy cooldown
   ============================================================ */
import EventBus from './EventBus.js';
import { HERO_TYPES, BATTLE } from './Config.js';
import { rand } from '../utils/DOMUtils.js';

export default class HeroSystem {
  /** @param {object} hooks { battle, scene, formation, lanes } */
  constructor(hooks) {
    this.hooks = hooks;
    /** @type {Record<string, object>} per-hero runtime state */
    this.state = {};
    this.reset();
  }

  reset() {
    this.state = {};
    HERO_TYPES.forEach((h) => {
      this.state[h.id] = {
        alive: false,
        entity: null,
        cooldown: 0,
        charge: 0,
        auraT: 0,
        ultActiveT: 0
      };
    });
  }

  getDef(id) {
    return HERO_TYPES.find((h) => h.id === id);
  }

  /** Deploy gate: alive count, cooldown, supply/cap handled by battle. */
  canDeploy(id) {
    const def = this.getDef(id);
    const st = this.state[id];
    if (!def || !st) return false;
    if (st.alive) return false;
    if (st.cooldown > 0) return false;
    const aliveCount = this.hooks.battle.entities.filter((e) => e.isHero && e.heroDef.id === id).length;
    return aliveCount < def.maxAlive;
  }

  /** Called by battle right after the hero entity is created. */
  markDeployed(id, entity) {
    const st = this.state[id];
    if (!st) return;
    st.alive = true;
    st.entity = entity;
    st.charge = 0;
    st.auraT = 0.5;
    EventBus.emit('hero:deployed', { id });
  }

  /** Called by battle when the hero entity dies. */
  onDeath(id) {
    const def = this.getDef(id);
    const st = this.state[id];
    if (!st) return;
    st.alive = false;
    st.entity = null;
    st.cooldown = def ? def.cooldown : 15;
    st.charge = 0;
    EventBus.emit('hero:down', { id });
  }

  /** Every player kill feeds the ultimates of all deployed heroes. */
  onPlayerKill() {
    HERO_TYPES.forEach((h) => {
      const st = this.state[h.id];
      if (st && st.alive) {
        st.charge += 1;
        if (st.charge >= h.ultKills) this._fireUltimate(h, st);
      }
    });
  }

  _fireUltimate(def, st) {
    const e = st.entity;
    const { battle, scene } = this.hooks;
    st.charge = 0;
    st.ultActiveT = 1.2;

    switch (def.id) {
      case 'medic': {
        // heal every ally in a wide radius
        battle.entities.forEach((o) => {
          if (o.side !== 'player' || o.hp <= 0) return;
          const d2 = (o.x - e.x) ** 2 + (o.z - e.z) ** 2;
          if (d2 <= def.ultRadius * def.ultRadius) {
            o.hp = Math.min(o.maxHp, o.hp + def.ultHeal);
            scene.setUnitHP(o.handle, o.hp / o.maxHp);
          }
        });
        scene.explode({ x: e.x, y: 1, z: e.z }, 1.8, 'cyan');
        battle.hud.announce(`${def.ultName} — MASS HEAL`, 'announce-ally');
        break;
      }
      case 'assault': {
        // self overdrive: big damage for a window
        e.buff = { dmgMult: def.ultDmgMult, rateMult: 1.4, t: def.ultDur };
        scene.explode({ x: e.x, y: 1, z: e.z }, 1.6, 'amber');
        battle.hud.announce(`${def.ultName} — DAMAGE SURGE`, 'announce-ally');
        break;
      }
      case 'support': {
        // rally: buff every ally for a window
        battle.entities.forEach((o) => {
          if (o.side !== 'player' || o.hp <= 0 || o.isHero) return;
          o.buff = { dmgMult: 1.5, rateMult: 1.35, t: def.ultBuffDur };
        });
        scene.explode({ x: e.x, y: 1, z: e.z }, 1.7, 'cyan');
        battle.hud.announce(`${def.ultName} — FORCES RALLIED`, 'announce-ally');
        break;
      }
    }
    EventBus.emit('hero:ultimate', { id: def.id, name: def.ultName });
  }

  /** Per-frame: cooldowns, auras, ultimate charge bars, assault routing. */
  tick(dt) {
    const { battle, scene, formation, lanes } = this.hooks;

    HERO_TYPES.forEach((def) => {
      const st = this.state[def.id];
      if (!st) return;

      if (!st.alive) {
        if (st.cooldown > 0) st.cooldown = Math.max(0, st.cooldown - dt);
        return;
      }

      const e = st.entity;
      if (!e || e.hp <= 0) return;

      // ultimate charge bar above the hero mesh
      if (e.handle) scene.setHeroCharge(e.handle, Math.min(1, st.charge / def.ultKills));

      // aura (once per second)
      st.auraT -= dt;
      if (st.auraT <= 0 && def.auraRadius) {
        st.auraT = 1.0;
        this._applyAura(def, e);
      }

      // assault: hunt the most threatened lane
      if (def.laneShiftAggro && !e.laneShifting && Math.random() < dt * 0.3) {
        this._routeAssault(def, e, lanes, formation);
      }
    });
  }

  _applyAura(def, e) {
    const { battle, scene } = this.hooks;
    const r2 = def.auraRadius * def.auraRadius;
    let affected = 0;
    battle.entities.forEach((o) => {
      if (o.side !== 'player' || o.hp <= 0 || o === e) return;
      const d2 = (o.x - e.x) ** 2 + (o.z - e.z) ** 2;
      if (d2 > r2) return;
      affected++;
      if (def.auraHeal) {
        o.hp = Math.min(o.maxHp, o.hp + def.auraHeal);
        scene.setUnitHP(o.handle, o.hp / o.maxHp);
      }
      if (def.auraBuffDmg) {
        o.buff = { dmgMult: def.auraBuffDmg, rateMult: def.auraBuffRate || 1, t: 1.4 };
      }
    });
    if (affected && def.auraHeal && Math.random() < 0.5) {
      scene.muzzle({ x: e.x, y: 1.6, z: e.z }, 'player');
    }
  }

  _routeAssault(def, e, lanes, formation) {
    const { battle } = this.hooks;
    // find the lane with the most enemies and fewest allies
    const threat = {};
    const ally = {};
    lanes.lanes.forEach((l) => { threat[l.id] = 0; ally[l.id] = 0; });
    battle.entities.forEach((o) => {
      if (o.hp <= 0 || o.laneId === undefined) return;
      if (o.side === 'enemy') threat[o.laneId] = (threat[o.laneId] || 0) + 1;
      else ally[o.laneId] = (ally[o.laneId] || 0) + 1;
    });
    let best = null;
    let bestScore = -Infinity;
    lanes.lanes.forEach((l) => {
      const score = threat[l.id] * 2 - ally[l.id];
      if (score > bestScore) { bestScore = score; best = l.id; }
    });
    if (best !== null && best !== e.laneId) {
      formation.assignSlot(e, best, def.role);
      e.laneShifting = true;
      e.shiftT = 1.4;
      battle.hud.announce(`${def.name} → LANE ${lanes.getLane(best).letter}`, 'announce-ally');
    }
  }
}
