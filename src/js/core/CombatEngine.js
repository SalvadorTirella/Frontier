/* ============================================================
   CombatEngine — physical projectiles replacing instant hits
   ------------------------------------------------------------
   Projectile classes:
     bullet   — fast homing tracer, kinetic, blocked by LoS cover
     rocket   — medium speed, smoke trail, explosive splash
     grenade  — parabolic arc, ground detonation, explosive splash
     missile  — softly guided, long glowing trail, explosive
     beam     — instant lance (boss / future lasers), delayed hit
     shell    — high-altitude artillery drop (airstrike volleys)
   Damage resolution is delegated to hooks so economy / combo /
   formations stay owned by BattleScreen.
   ============================================================ */
const GRAVITY = 22;
const MAX_PROJECTILES = 140;

export default class CombatEngine {
  /**
   * @param {object} hooks
   *  scene: SceneController
   *  damageEntity(target, dmg, info)
   *  damageCover(cover, dmg)
   *  coverAt(x, z, radius) -> cover|null
   *  blocksLoS(ax, az, bx, bz) -> cover|null
   *  splash(x, z, r, dmg, side, info)   (area damage resolver)
   */
  constructor(hooks) {
    this.hooks = hooks;
    this.projectiles = [];
  }

  clear() {
    this.projectiles.forEach((p) => p.mesh && p.mesh.dispose());
    this.projectiles = [];
  }

  /**
   * Spawns a projectile for one weapon discharge.
   * @param {object} spec { weapon, side, from:{x,y,z}, target, source, dmg }
   */
  fire(spec) {
    const { weapon, side, from, target } = spec;
    if (!weapon || !from) return;
    if (this.projectiles.length > MAX_PROJECTILES) {
      const old = this.projectiles.shift();
      if (old.mesh) old.mesh.dispose();
    }

    const p = {
      kind: weapon.proj,
      dmgKind: weapon.kind,
      side,
      source: spec.source || null,
      target: target || null,
      x: from.x, y: from.y, z: from.z,
      vx: 0, vy: 0, vz: 0,
      speed: weapon.speed,
      dmg: spec.dmg,
      splash: weapon.splash || 0,
      variance: weapon.variance || 0.12,
      crit: weapon.crit || 0,
      age: 0,
      dist: 0,
      trailT: 0,
      struck: false,
      dead: false,
      mesh: null,
      aimCover: null
    };

    switch (p.kind) {
      case 'bullet': {
        // line of sight: LoS cover intercepts the round
        if (target) {
          const cover = this.hooks.blocksLoS(from.x, from.z, target.x, target.z);
          if (cover) p.aimCover = cover;
        }
        this._aimAt(p, this._bulletAim(p), from.y);
        break;
      }
      case 'rocket': {
        const a = this._targetPoint(p);
        this._aimAt(p, a, from.y);
        break;
      }
      case 'grenade': {
        const a = this._targetPoint(p);
        const dx = a.x - from.x;
        const dz = a.z - from.z;
        const T = Math.max(0.35, Math.hypot(dx, dz) / p.speed);
        p.vx = dx / T;
        p.vz = dz / T;
        // ballistic arc: land at y ≈ 0 after T seconds
        p.vy = 0.5 * GRAVITY * T - from.y / T;
        break;
      }
      case 'shell': {
        // dropped from the sky toward a ground point (airstrike)
        const a = spec.point || this._targetPoint(p);
        p.x = a.x + (Math.random() - 0.5) * 4;
        p.z = a.z + (Math.random() - 0.5) * 4;
        p.y = 26;
        const T = 1.05 + Math.random() * 0.25;
        p.vx = (a.x - p.x) / T;
        p.vz = (a.z - p.z) / T;
        p.vy = (0.2 - p.y) / T + 0.5 * GRAVITY * T;
        break;
      }
      case 'missile': {
        const a = this._targetPoint(p);
        const d = Math.max(1, Math.hypot(a.x - from.x, a.z - from.z));
        p.vx = ((a.x - from.x) / d) * p.speed;
        p.vz = ((a.z - from.z) / d) * p.speed;
        p.vy = 1.5;
        break;
      }
      case 'beam': {
        const a = this._targetPoint(p);
        p.bx = a.x; p.bz = a.z; p.by = target ? 0.95 * (target.size || 1) : 1;
        p.ttl = 0.16;
        this.hooks.scene.beamFX(from, { x: p.bx, y: p.by, z: p.bz }, side);
        break;
      }
      default:
        p.kind = 'bullet';
        this._aimAt(p, this._targetPoint(p), from.y);
    }

    if (p.kind !== 'beam') {
      p.mesh = this.hooks.scene.projectileMesh(p.kind, side);
      if (p.mesh) p.mesh.position.set(p.x, p.y, p.z);
    }
    this.projectiles.push(p);
    return p;
  }

  _targetPoint(p) {
    const t = p.target;
    if (t && t.hp > 0) return { x: t.x, y: 0.9 * (t.size || 1), z: t.z };
    return { x: p.lastX ?? p.x, y: 1, z: p.lastZ ?? p.z };
  }

  _bulletAim(p) {
    if (p.aimCover) return { x: p.aimCover.x, y: 1, z: p.aimCover.z };
    return this._targetPoint(p);
  }

  _aimAt(p, a, y) {
    const dx = a.x - p.x;
    const dz = a.z - p.z;
    const d = Math.max(0.001, Math.hypot(dx, dz));
    p.vx = (dx / d) * p.speed;
    p.vz = (dz / d) * p.speed;
    p.lastX = a.x;
    p.lastZ = a.z;
    p.y = y;
  }

  /** Advances every projectile; resolves impacts & detonations. */
  tick(dt) {
    const list = this.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;

      switch (p.kind) {
        case 'bullet':
          this._stepHoming(p, dt, 14);
          break;
        case 'rocket':
          this._stepHoming(p, dt, 5);
          p.trailT -= dt;
          if (p.trailT <= 0) {
            p.trailT = 0.05;
            this.hooks.scene.smokePuff({ x: p.x, y: p.y, z: p.z });
          }
          break;
        case 'missile': {
          // soft guidance toward the live target
          const a = this._targetPoint(p);
          const dx = a.x - p.x;
          const dz = a.z - p.z;
          const d = Math.max(0.001, Math.hypot(dx, dz));
          const turn = Math.min(1, 3.6 * dt);
          p.vx += ((dx / d) * p.speed - p.vx) * turn;
          p.vz += ((dz / d) * p.speed - p.vz) * turn;
          p.vy += (0.6 - p.vy) * Math.min(1, 2 * dt);
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          p.dist += p.speed * dt;
          p.trailT -= dt;
          if (p.trailT <= 0) {
            p.trailT = 0.03;
            this.hooks.scene.glowPuff({ x: p.x, y: p.y, z: p.z }, p.side);
          }
          if (d < 1.4 || (p.target && p.target.hp <= 0 && d < 2.2)) this._detonate(p);
          else if (p.dist > 90) this._expire(p);
          break;
        }
        case 'grenade':
        case 'shell':
          p.vy -= GRAVITY * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          if (p.kind === 'shell') {
            p.trailT -= dt;
            if (p.trailT <= 0) { p.trailT = 0.06; this.hooks.scene.smokePuff({ x: p.x, y: p.y, z: p.z }); }
          }
          if (p.y <= 0.15 && p.age > 0.12) this._detonate(p);
          else if (p.age > 6) this._expire(p);
          break;
        case 'beam':
          if (!p.struck && p.age >= 0.05) {
            p.struck = true;
            if (p.splash > 0) this._detonateAt(p, p.bx, p.bz);
            else this._hitTarget(p);
          }
          if (p.age >= (p.ttl || 0.16)) this._expire(p, true);
          break;
        default:
          this._expire(p, true);
      }

      // bullet / rocket arrival checks
      if (!p.dead && (p.kind === 'bullet' || p.kind === 'rocket')) {
        if (p.aimCover) {
          const c = p.aimCover;
          if (Math.hypot(p.x - c.x, p.z - c.z) < Math.max(c.w, c.d) * 0.5 + 0.3) {
            this.hooks.damageCover(c, p.dmg * 0.6);
            this.hooks.scene.impactSpark({ x: p.x, y: 1, z: p.z }, p.side);
            this._expire(p);
            continue;
          }
        }
        const t = p.target;
        if (t && t.hp > 0) {
          const rr = Math.max(0.85, 0.75 * (t.size || 1));
          if (Math.hypot(p.x - t.x, p.z - t.z) < rr) {
            if (p.kind === 'rocket') this._detonate(p);
            else this._hitTarget(p);
            continue;
          }
        }
        if (p.dist > 70) this._expire(p);
      }

      if (!p.dead && p.mesh) {
        p.mesh.position.set(p.x, p.y, p.z);
        if (p.kind !== 'grenade' && p.kind !== 'shell' && (p.vx || p.vz)) {
          p.mesh.rotation.y = Math.atan2(p.vx, p.vz);
        }
      }
    }
  }

  _stepHoming(p, dt, turnRate) {
    if (p.kind === 'bullet' && !p.aimCover && p.target && p.target.hp > 0) {
      // tracers track the live target
      const dx = p.target.x - p.x;
      const dz = p.target.z - p.z;
      const d = Math.max(0.001, Math.hypot(dx, dz));
      const turn = Math.min(1, turnRate * dt);
      p.vx += ((dx / d) * p.speed - p.vx) * turn;
      p.vz += ((dz / d) * p.speed - p.vz) * turn;
    }
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.dist += p.speed * dt;
  }

  _hitTarget(p) {
    const t = p.target;
    if (t && t.hp > 0) {
      this.hooks.damageEntity(t, p.dmg, {
        kind: p.dmgKind,
        variance: p.variance,
        critChance: p.crit,
        source: p.source,
        splash: false
      });
    }
    this.hooks.scene.impactSpark({ x: p.x, y: 1, z: p.z }, p.side);
    this._expire(p);
  }

  _detonate(p) {
    this._detonateAt(p, p.x, p.z);
  }

  _detonateAt(p, x, z) {
    this.hooks.splash(x, z, Math.max(1.2, p.splash), p.dmg, p.side, {
      kind: p.dmgKind,
      variance: p.variance,
      critChance: p.crit,
      source: p.source,
      splash: true
    });
    this._expire(p);
  }

  _expire(p, keepVisual = false) {
    p.dead = true;
    if (p.mesh && !keepVisual) p.mesh.dispose();
    p.mesh = null;
    const idx = this.projectiles.indexOf(p);
    if (idx >= 0) this.projectiles.splice(idx, 1);
  }
}
