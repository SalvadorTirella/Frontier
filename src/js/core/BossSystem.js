/* ============================================================
   BossSystem — phase-driven boss with telegraphed attacks
   ------------------------------------------------------------
   - spawns on the final wave, center lane
   - health phases at 100% / 66% / 33% change behaviour:
       cannon → heavy rocket duels
       mortar → telegraphed ground strikes (visible impact zone)
       lance  → beam sweeps + enrage speed
   - cinematic entrance: slow-mo, camera zoom, shake (SceneController)
   - death pays a heavy reward and triggers the victory condition
   ============================================================ */
import EventBus from './EventBus.js';
import { BOSS_TEMPLATES, WEAPONS, BATTLE } from './Config.js';
import { rand } from '../utils/DOMUtils.js';
import AudioFX from '../utils/AudioUtils.js';

export default class BossSystem {
  /**
   * @param {object} hooks { battle, scene, combat, lanes }
   */
  constructor(hooks) {
    this.hooks = hooks;
    this.boss = null;
    this.strikes = [];
  }

  get active() { return !!this.boss; }

  /**
   * Spawns the boss with a cinematic entrance.
   * @param {string} templateId key of BOSS_TEMPLATES
   * @param {number} laneId
   */
  spawn(templateId, laneId) {
    if (this.boss) return;
    const def = BOSS_TEMPLATES[templateId];
    if (!def) return;
    const lane = this.hooks.lanes.getLane(laneId);
    const z = lane ? lane.zCenter : 0;
    const x = BATTLE.spawnX + 3;

    const boss = {
      isBoss: true,
      id: `boss-${templateId}`,
      def,
      side: 'enemy',
      role: 'FRONT',
      laneId,
      x, z,
      size: def.size,
      hp: def.hp,
      maxHp: def.hp,
      value: def.reward,
      dmg: def.dmg,
      supply: 0,
      phaseIdx: 0,
      atkCd: 2.0,
      handle: null
    };
    boss.handle = this.hooks.scene.addBossMesh(def, x, z);
    this.boss = boss;
    this.hooks.battle.entities.push(boss);
    this.hooks.battle.hud.setBoss(def.name, 1);

    // cinematic entrance: slow-mo + zoom + shake + shockwave
    this.hooks.battle.beginCinematic(1.7);
    this.hooks.scene.cameraZoom(24, 1.7);
    this.hooks.scene.shake(1.0);
    this.hooks.scene.bossShockwave({ x, z }, 1.6);
    EventBus.emit('boss:entrance', { name: def.name });
  }

  /** Advances movement, phases, attacks and pending strikes. */
  tick(dt) {
    const boss = this.boss;

    // telegraphed strikes resolve independently of boss life
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t -= dt;
      if (s.t <= 0) {
        this.hooks.battle._splash(s.x, s.z, s.r, s.dmg, 'enemy', {
          kind: 'explosive', variance: 0.1, critChance: 0, source: boss, splash: true
        });
        this.strikes.splice(i, 1);
      }
    }

    if (!boss || boss.hp <= 0) return;
    const { battle, scene, combat } = this.hooks;
    const def = boss.def;

    // phase from remaining health
    const ratio = boss.hp / boss.maxHp;
    let idx = 0;
    def.phases.forEach((ph, i) => { if (ratio <= ph.at) idx = i; });
    if (idx !== boss.phaseIdx) {
      boss.phaseIdx = idx;
      scene.shake(0.8);
      scene.bossShockwave({ x: boss.x, z: boss.z }, 1.2);
      AudioFX.sfx('phase');
      AudioFX.sfx('roar');
      EventBus.emit('boss:phase', { name: def.name, phase: idx + 1 });
      battle.hud.announce(`WARBRINGER — PHASE ${idx + 1}`, 'announce-danger');
    }
    const phase = def.phases[boss.phaseIdx];

    // relentless advance toward the player base
    const targetX = -(BATTLE.baseX - 4);
    if (boss.x > targetX) {
      boss.x -= def.speed * phase.move * dt;
      scene.moveUnit(boss.handle, boss.x, boss.z, 6);
    }

    // attacks
    boss.atkCd -= dt;
    if (boss.atkCd > 0) return;
    const players = battle.entities.filter((e) => e.side === 'player' && e.hp > 0 && !e.isBoss);
    const muzzle = { x: boss.x - 2.4 * def.size * 0.5, y: 2.2, z: boss.z };

    switch (phase.attack) {
      case 'cannon': {
        const t = this._nearest(players, boss);
        if (t) {
          combat.fire({ weapon: WEAPONS.boss, side: 'enemy', from: muzzle, target: t, source: boss, dmg: boss.dmg });
        } else {
          battle.hitBaseDirect('player', boss.dmg * 0.8, boss.x, boss.z);
        }
        boss.atkCd = phase.rate;
        break;
      }
      case 'mortar': {
        // telegraphed impact zone on the densest player cluster
        let px = -12, pz = 0;
        if (players.length) {
          const t = players[Math.floor(Math.random() * players.length)];
          px = t.x + rand(-1.5, 1.5);
          pz = t.z + rand(-1.5, 1.5);
        }
        const r = 3.3;
        scene.telegraphArea(px, pz, r, 1.15);
        AudioFX.sfx('telegraph');
        this.strikes.push({ x: px, z: pz, r, t: 1.15, dmg: boss.dmg * 0.95 });
        boss.atkCd = phase.rate * 1.15;
        break;
      }
      case 'lance': {
        const t = this._nearest(players, boss);
        if (t) {
          AudioFX.sfx('beam');
          combat.fire({
            weapon: { proj: 'beam', kind: 'explosive', splash: 2.3, variance: 0.1, crit: 0 },
            side: 'enemy',
            from: { x: boss.x - 2, y: 3.4, z: boss.z },
            target: t,
            source: boss,
            dmg: boss.dmg * 0.8
          });
        }
        // enrage: secondary cannon shot
        const t2 = this._nearest(players, boss);
        if (t2) combat.fire({ weapon: WEAPONS.boss, side: 'enemy', from: muzzle, target: t2, source: boss, dmg: boss.dmg * 0.7 });
        boss.atkCd = phase.rate;
        break;
      }
      default:
        boss.atkCd = 1;
    }
  }

  _nearest(players, boss) {
    let best = null;
    let bd = Infinity;
    for (const p of players) {
      const d = (p.x - boss.x) * (p.x - boss.x) + (p.z - boss.z) * (p.z - boss.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /**
   * Applies already-resolved damage to the boss.
   * @param {number} dmg
   */
  takeDamage(dmg) {
    const boss = this.boss;
    if (!boss) return;
    boss.hp -= dmg;
    const ratio = Math.max(0, boss.hp / boss.maxHp);
    this.hooks.scene.setUnitHP(boss.handle, ratio);
    this.hooks.battle.hud.setBoss(boss.def.name, ratio);
    if (boss.hp <= 0) this._die();
  }

  _die() {
    const boss = this.boss;
    if (!boss) return;
    const { battle, scene } = this.hooks;

    scene.explode({ x: boss.x, y: 1.6, z: boss.z }, 2.6, 'amber');
    scene.explode({ x: boss.x + 1.5, y: 0.8, z: boss.z - 1 }, 1.6, 'red');
    scene.explode({ x: boss.x - 1.2, y: 1, z: boss.z + 1.2 }, 1.8, 'amber');
    scene.shake(1.6);

    // heavy reward
    battle.credits += boss.def.reward;
    battle.earned += boss.def.reward;
    battle.kills += 1;
    battle.hud.gainFlash();
    const p = scene.project({ x: boss.x, y: 4, z: boss.z });
    if (p) battle.hud.float(p.x, p.y, `+${boss.def.reward}`, 'dmg-gain');

    const idx = battle.entities.indexOf(boss);
    if (idx >= 0) battle.entities.splice(idx, 1);
    scene.removeUnit(boss.handle);
    battle.hud.setBoss(null);
    this.boss = null;
    this.strikes = [];

    EventBus.emit('boss:defeated', { name: boss.def.name });
    battle.hud.announce(`${boss.def.name} ELIMINATED`, 'announce-ally');
    battle.bossVictory();
  }

  /** Wipes state (battle abort / restart). */
  reset() {
    if (this.boss) {
      const idx = this.hooks.battle.entities.indexOf(this.boss);
      if (idx >= 0) this.hooks.battle.entities.splice(idx, 1);
      if (this.boss.handle) this.hooks.scene.removeUnit(this.boss.handle);
    }
    this.boss = null;
    this.strikes = [];
  }
}
