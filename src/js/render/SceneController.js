/* ============================================================
   SceneController — Babylon.js render engine & battle stage
   ============================================================ */
/* Babylon.js is loaded as a pinned UMD build via <script> (index.html)
   to keep the application bundle lean; we consume the BABYLON global. */
const BABYLON = window.BABYLON;

function pick() {
  if (!BABYLON) return {};
  const {
    Engine, Scene, ArcRotateCamera, Vector3, Color3, Color4, Matrix,
    HemisphericLight, DirectionalLight, PointLight,
    MeshBuilder, StandardMaterial, GlowLayer, ShadowGenerator,
    ParticleSystem, DynamicTexture, TransformNode
  } = BABYLON;
  return {
    Engine, Scene, ArcRotateCamera, Vector3, Color3, Color4, Matrix,
    HemisphericLight, DirectionalLight, PointLight,
    MeshBuilder, StandardMaterial, GlowLayer, ShadowGenerator,
    ParticleSystem, DynamicTexture, TransformNode
  };
}

const B = pick();
const {
  Engine, Scene, ArcRotateCamera, Vector3, Color3, Color4, Matrix,
  HemisphericLight, DirectionalLight, PointLight,
  MeshBuilder, StandardMaterial, GlowLayer, ShadowGenerator,
  ParticleSystem, DynamicTexture, TransformNode
} = B;

export { BABYLON };

const CYAN = new Color3(0, 0.78, 1);
const AMBER = new Color3(1, 0.84, 0);
const RED = new Color3(1, 0.28, 0.16);
const HP_GREEN = new Color3(0.24, 1, 0.55);

export default class SceneController {
  constructor() {
    this.onTick = null;
    this.fx = [];
    this.pending = [];
    this.units = [];
    this.mode = 'ambient';
    this.fps = 60;
    this.particlesOn = true;
    this.ok = false;
  }

  init(canvas) {
    try {
      this.engine = new Engine(canvas, true, { antialias: true, stencil: true, powerPreference: 'high-performance' });
      this.scene = new Scene(this.engine);
      this._buildWorld();
      this._buildFXTexture();
      this.ok = true;
      return true;
    } catch (err) {
      console.error('[Scene] engine init failed', err);
      return false;
    }
  }

  /* ---------------- world ---------------- */
  _buildWorld() {
    const scene = this.scene;
    scene.clearColor = new Color4(0.008, 0.016, 0.032, 1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0075;
    scene.fogColor = new Color3(0.012, 0.024, 0.05);

    this.camera = new ArcRotateCamera('cam', Math.PI * 0.72, 1.05, 40, new Vector3(0, 2, 0), scene);
    this.camera.minZ = 0.5;
    this.camera.fov = 0.92;
    this.desired = { alpha: Math.PI * 0.72, beta: 1.05, radius: 40, tx: 0, ty: 2, tz: 0 };

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.55;
    hemi.groundColor = new Color3(0.02, 0.05, 0.1);

    this.dirLight = new DirectionalLight('dir', new Vector3(-0.5, -1, 0.35), scene);
    this.dirLight.position = new Vector3(-25, 40, -15);
    this.dirLight.intensity = 1.25;
    this.shadowGen = new ShadowGenerator(1024, this.dirLight);
    this.shadowGen.useBlurExponentialShadowMap = true;
    this.shadowGen.setDarkness(0.35);

    // floor
    const under = MeshBuilder.CreateGround('under', { width: 200, height: 120 }, scene);
    under.position.y = -0.06;
    const underMat = new StandardMaterial('underMat', scene);
    underMat.diffuseColor = new Color3(0.008, 0.014, 0.028);
    underMat.specularColor = Color3.Black();
    under.material = underMat;

    const ground = MeshBuilder.CreateGround('ground', { width: 110, height: 44, subdivisions: 2 }, scene);
    ground.material = this._buildGridMaterial();
    ground.receiveShadows = true;

    // lane boundary strips
    [-11, 11].forEach((z, i) => {
      const strip = MeshBuilder.CreateBox(`strip${i}`, { width: 70, height: 0.06, depth: 0.22 }, scene);
      strip.position.set(0, 0.03, z);
      const m = this._emissiveMat(`stripM${i}`, i === 0 ? CYAN : RED, 0.55);
      m.alpha = 0.5;
      strip.material = m;
    });

    this.glow = new GlowLayer('glow', scene, { intensity: 0.65 });

    this._buildBases();
    this._buildProps();
    this._buildDust();

    this.engine.runRenderLoop(() => {
      const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);
      this._tick(dt);
      this.scene.render();
    });
  }

  /* holographic grid floor, drawn procedurally (no external assets) */
  _buildGridMaterial() {
    const size = 512;
    const tex = new DynamicTexture('gridTex', size, this.scene, false);
    const ctx = tex.getContext();
    ctx.fillStyle = '#050b16';
    ctx.fillRect(0, 0, size, size);
    const minor = size / 8;
    ctx.strokeStyle = 'rgba(0,150,210,0.30)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 8; i++) {
      const p = i * minor;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,198,255,0.7)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      const p = i * (size / 2);
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }
    tex.update();
    tex.uScale = 12;
    tex.vScale = 5;
    const mat = new StandardMaterial('groundMat', this.scene);
    mat.diffuseTexture = tex;
    mat.diffuseColor = new Color3(0.22, 0.22, 0.22);
    mat.emissiveTexture = tex;
    mat.emissiveColor = new Color3(0.5, 0.5, 0.5);
    mat.specularColor = Color3.Black();
    return mat;
  }

  _emissiveMat(name, color, intensity = 1, alpha = 1) {
    const m = new StandardMaterial(name, this.scene);
    m.disableLighting = true;
    m.emissiveColor = color.scale ? color.scale(intensity) : color;
    m.specularColor = Color3.Black();
    if (alpha < 1) m.alpha = alpha;
    return m;
  }

  _buildBases() {
    this.bases = {};
    ['player', 'enemy'].forEach((side) => {
      const sign = side === 'player' ? -1 : 1;
      const accent = side === 'player' ? CYAN : RED;
      const root = new TransformNode(`base-${side}`, this.scene);
      root.position.x = sign * 33;

      const wallMat = new StandardMaterial(`wall-${side}`, this.scene);
      wallMat.diffuseColor = side === 'player' ? new Color3(0.1, 0.16, 0.22) : new Color3(0.2, 0.1, 0.08);
      wallMat.specularColor = new Color3(0.1, 0.1, 0.1);

      const wall = MeshBuilder.CreateBox(`bwall-${side}`, { width: 3, height: 5.4, depth: 19 }, this.scene);
      wall.material = wallMat;
      wall.position.y = 2.7;
      wall.parent = root;

      [-8.2, 8.2].forEach((z, i) => {
        const tower = MeshBuilder.CreateBox(`btow-${side}${i}`, { width: 3.6, height: 7.4, depth: 3.6 }, this.scene);
        tower.position.set(0, 3.7, z);
        tower.material = wallMat;
        tower.parent = root;
        const win = MeshBuilder.CreateBox(`bwin-${side}${i}`, { width: 3.7, height: 0.5, depth: 3.7 }, this.scene);
        win.position.set(0, 6.1, z);
        win.material = this._emissiveMat(`bwinM-${side}${i}`, accent, 0.9);
        win.parent = root;
        this.shadowGen.addShadowCaster(tower);
      });

      const gate = MeshBuilder.CreateBox(`bgate-${side}`, { width: 3.2, height: 0.35, depth: 6 }, this.scene);
      gate.position.set(0, 0.6, 0);
      gate.material = this._emissiveMat(`bgateM-${side}`, accent, 0.7);
      gate.parent = root;

      const antenna = MeshBuilder.CreateCylinder(`bant-${side}`, { diameter: 0.16, height: 4.4 }, this.scene);
      antenna.position.set(0, 9.4, 8.2);
      antenna.material = wallMat;
      antenna.parent = root;
      const tip = MeshBuilder.CreateSphere(`btip-${side}`, { diameter: 0.55 }, this.scene);
      tip.position.set(0, 11.6, 8.2);
      tip.material = this._emissiveMat(`btipM-${side}`, accent, 1.4);
      tip.parent = root;
      this._blinkers = this._blinkers || [];
      this._blinkers.push({ mat: tip.material, base: accent.clone(), speed: side === 'player' ? 2.4 : 3.1 });

      this.shadowGen.addShadowCaster(wall);
      this.bases[side] = { root, sign };
    });
  }

  _buildProps() {
    this.props = new TransformNode('props', this.scene);
    const crateMat = new StandardMaterial('crate', this.scene);
    crateMat.diffuseColor = new Color3(0.13, 0.17, 0.14);
    crateMat.specularColor = new Color3(0.05, 0.05, 0.05);

    [[-14, -8, 1.6], [-11.5, -7, 1.1], [-13, -5.5, 0.9], [12, 9, 1.4], [14.5, 8, 1], [10, 10.4, 0.8], [-4, 12, 1.2], [6, -12, 1.5]].forEach(([x, z, s], i) => {
      const c = MeshBuilder.CreateBox(`crate${i}`, { size: s }, this.scene);
      c.position.set(x, s / 2, z);
      c.rotation.y = Math.random() * 0.9;
      c.material = crateMat;
      c.parent = this.props;
      this.shadowGen.addShadowCaster(c);
    });

    // radar tower
    const radarRoot = new TransformNode('radar', this.scene);
    radarRoot.position.set(-20, 0, 10);
    radarRoot.parent = this.props;
    const pole = MeshBuilder.CreateCylinder('radarPole', { diameter: 0.5, height: 6 }, this.scene);
    pole.position.y = 3;
    pole.material = crateMat;
    pole.parent = radarRoot;
    this.radarDish = new TransformNode('dish', this.scene);
    this.radarDish.position.y = 6.4;
    this.radarDish.parent = radarRoot;
    const dish = MeshBuilder.CreateCylinder('dishMesh', { diameter: 3.2, height: 0.14, tessellation: 24 }, this.scene);
    dish.rotation.x = Math.PI / 2.6;
    dish.material = this._emissiveMat('dishM', CYAN, 0.35);
    dish.material.alpha = 0.75;
    dish.parent = this.radarDish;

    // holo platform ring
    const ring = MeshBuilder.CreateTorus('holoRing', { diameter: 13, tube: 0.08, tessellation: 64 }, this.scene);
    ring.position.y = 0.1;
    const ringMat = this._emissiveMat('ringM', CYAN, 0.8);
    ringMat.alpha = 0.55;
    ring.material = ringMat;
    ring.parent = this.props;
    this.holoRing = ring;

    // holo pillars
    this.holoPillars = [];
    [[-8, 7], [8, -7], [0, -9]].forEach(([x, z], i) => {
      const p = MeshBuilder.CreateBox(`holo${i}`, { width: 0.9, height: 4.6, depth: 0.9 }, this.scene);
      p.position.set(x, 2.3, z);
      const m = this._emissiveMat(`holoM${i}`, i === 1 ? AMBER : CYAN, 0.6);
      m.alpha = 0.16;
      p.material = m;
      p.parent = this.props;
      this.holoPillars.push({ mesh: p, mat: m, phase: i * 2.1 });
    });
  }

  _buildDust() {
    const tex = new DynamicTexture('softDot', 64, this.scene, false);
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(200,235,255,0.95)');
    g.addColorStop(1, 'rgba(200,235,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    tex.update();
    this.softTex = tex;

    this.dust = new ParticleSystem('dust', 140, this.scene);
    this.dust.particleTexture = tex;
    this.dust.emitter = new Vector3(0, 1, 0);
    this.dust.minEmitBox = new Vector3(-42, 0, -16);
    this.dust.maxEmitBox = new Vector3(42, 6, 16);
    this.dust.direction1 = new Vector3(-0.1, 0.25, 0);
    this.dust.direction2 = new Vector3(0.1, 0.6, 0);
    this.dust.minEmitPower = 0.1;
    this.dust.maxEmitPower = 0.4;
    this.dust.minLifeTime = 4;
    this.dust.maxLifeTime = 8;
    this.dust.minSize = 0.08;
    this.dust.maxSize = 0.26;
    this.dust.color1 = new Color4(0.4, 0.75, 1, 0.1);
    this.dust.color2 = new Color4(0.4, 0.75, 1, 0.02);
    this.dust.blendMode = ParticleSystem.BLENDMODE_ONEONE;
    this.dust.emitRate = 26;
    this.dust.start();
  }

  /* ---------------- modes ---------------- */
  setMode(mode) {
    this.mode = mode;
    if (mode === 'battle') {
      Object.assign(this.desired, { alpha: -Math.PI / 2, beta: 1.03, radius: 45, tx: 0, ty: 1.2, tz: 0 });
      this.props && this.props.setEnabled(false);
    } else {
      this.desired.alpha = this.camera.alpha;
      Object.assign(this.desired, { beta: 1.05, radius: 40, tx: 0, ty: 2, tz: 0 });
      this.props && this.props.setEnabled(true);
    }
  }

  /* ---------------- units ---------------- */
  addUnitMesh(def, side, x, z) {
    const s = def.size || 1;
    const root = new TransformNode(`u-${def.id}-${Math.random().toString(36).slice(2, 7)}`, this.scene);
    root.position.set(x, 0, z);
    root.rotation.y = side === 'player' ? Math.PI / 2 : -Math.PI / 2;

    if (!this._bodyMats) {
      const mp = new StandardMaterial('bodyP', this.scene);
      mp.diffuseColor = new Color3(0.09, 0.15, 0.2);
      mp.specularColor = new Color3(0.15, 0.2, 0.25);
      const me = new StandardMaterial('bodyE', this.scene);
      me.diffuseColor = new Color3(0.2, 0.1, 0.07);
      me.specularColor = new Color3(0.2, 0.1, 0.1);
      this._bodyMats = { player: mp, enemy: me };
    }
    const bodyMat = this._bodyMats[side];
    const accent = side === 'player' ? CYAN : RED;

    const bw = 1.35 * s, bh = 0.85 * s, bd = 2.1 * s;
    const body = MeshBuilder.CreateBox('body', { width: bw, height: bh, depth: bd }, this.scene);
    body.position.y = bh / 2 + 0.06;
    body.material = bodyMat;
    body.parent = root;

    const stripe = MeshBuilder.CreateBox('stripe', { width: bw + 0.04, height: 0.14 * s, depth: bd * 0.55 }, this.scene);
    stripe.position.y = bh + 0.02;
    stripe.material = this._emissiveMat(`stripeM${root.uniqueId}`, accent, 0.85);
    stripe.parent = root;

    const turret = MeshBuilder.CreateBox('turret', { width: bw * 0.62, height: 0.4 * s, depth: bd * 0.5 }, this.scene);
    turret.position.y = bh + 0.26 * s;
    turret.material = bodyMat;
    turret.parent = root;

    const barrelLen = def.id === 'artillery' ? 1.9 * s : def.id === 'tank' ? 1.5 * s : 1.0 * s;
    const barrel = MeshBuilder.CreateCylinder('barrel', { diameter: 0.14 * s, height: barrelLen }, this.scene);
    barrel.rotation.x = Math.PI / 2;
    if (def.id === 'artillery') barrel.rotation.x = Math.PI / 2 - 0.5;
    barrel.position.set(0, bh + 0.3 * s, bd * 0.3 + barrelLen / 2 - 0.15);
    barrel.material = bodyMat;
    barrel.parent = root;

    // hp bar
    const barY = bh + 0.95 * s + 0.35;
    const hpBg = MeshBuilder.CreateBox('hpbg', { width: 1.7, height: 0.13, depth: 0.05 }, this.scene);
    hpBg.position.set(0, barY, 0);
    const bgMat = new StandardMaterial('hpbgM', this.scene);
    bgMat.diffuseColor = new Color3(0.02, 0.03, 0.05);
    bgMat.emissiveColor = new Color3(0.03, 0.05, 0.08);
    hpBg.material = bgMat;
    hpBg.parent = root;

    const hpFg = MeshBuilder.CreateBox('hpfg', { width: 1.7, height: 0.13, depth: 0.07 }, this.scene);
    hpFg.position.set(0, barY, -0.012);
    const fgMat = this._emissiveMat(`hpM${root.uniqueId}`, HP_GREEN, 0.9);
    hpFg.material = fgMat;
    hpFg.parent = root;

    this.shadowGen.addShadowCaster(body);
    this.shadowGen.addShadowCaster(turret);

    const handle = { root, hpFg, hpMat: fgMat, def, side, id: root.uniqueId };
    this.units.push(handle);
    return handle;
  }

  moveUnit(handle, x, z) {
    handle.root.position.x = x;
    handle.root.position.z = z;
  }

  setUnitHP(handle, pct) {
    const p = Math.max(0, Math.min(1, pct));
    handle.hpFg.scaling.x = Math.max(0.001, p);
    handle.hpFg.position.x = -(1 - p) * 0.85;
    handle.hpMat.emissiveColor = new Color3(
      0.24 + (1 - p) * 0.76,
      1 - (1 - p) * 0.72,
      0.55 - (1 - p) * 0.4
    ).scale(0.9);
  }

  removeUnit(handle) {
    this.units = this.units.filter((u) => u !== handle);
    handle.root.dispose();
  }

  clearUnits() {
    [...this.units].forEach((u) => u.root.dispose());
    this.units = [];
  }

  /* ---------------- FX ---------------- */
  tracer(a, b, side) {
    const line = MeshBuilder.CreateLines('tr', { points: [a, b] }, this.scene);
    line.color = side === 'player' ? new Color3(0.35, 0.95, 1) : new Color3(1, 0.5, 0.22);
    this.fx.push({ kind: 'fade', mesh: line, age: 0, ttl: 0.09 });
  }

  muzzle(pos, side) {
    const s = MeshBuilder.CreateSphere('muz', { diameter: 0.34 }, this.scene);
    s.position.copyFrom(pos);
    s.material = this._emissiveMat(`muzM${s.uniqueId}`, side === 'player' ? CYAN : AMBER, 1.6);
    this.fx.push({ kind: 'shrink', mesh: s, age: 0, ttl: 0.07 });
  }

  explode(pos, power = 1, hue = 'amber') {
    const color = hue === 'red' ? RED : hue === 'cyan' ? CYAN : AMBER;

    const core = MeshBuilder.CreateSphere('expCore', { diameter: 1 }, this.scene);
    core.position.copyFrom(pos);
    core.material = this._emissiveMat(`expM${core.uniqueId}`, color, 1.5);
    this.fx.push({ kind: 'grow', mesh: core, age: 0, ttl: 0.3, from: 0.3, to: 2.6 * power });

    const ring = MeshBuilder.CreateTorus('expRing', { diameter: 1, tube: 0.055, tessellation: 40 }, this.scene);
    ring.position.set(pos.x, 0.16, pos.z);
    ring.material = this._emissiveMat(`expRM${ring.uniqueId}`, hue === 'cyan' ? CYAN : AMBER, 1.1);
    this.fx.push({ kind: 'growFlat', mesh: ring, age: 0, ttl: 0.42, from: 0.6, to: 3.6 * power });

    if (this.particlesOn) {
      const n = Math.min(10, 4 + Math.round(power * 2));
      for (let i = 0; i < n; i++) {
        const d = MeshBuilder.CreateBox('deb', { size: 0.16 + Math.random() * 0.12 }, this.scene);
        d.position.copyFrom(pos);
        d.position.y += 0.3;
        d.material = this._emissiveMat(`debM${d.uniqueId}`, Math.random() > 0.4 ? AMBER : RED, 1.2);
        this.fx.push({
          kind: 'debris', mesh: d, age: 0, ttl: 0.75,
          vel: new Vector3((Math.random() - 0.5) * 11, 3.5 + Math.random() * 6.5, (Math.random() - 0.5) * 11),
          spin: new Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8)
        });
      }
      const lights = this.fx.filter((f) => f.kind === 'light').length;
      if (lights < 2) {
        const pl = new PointLight('expL', pos.add(new Vector3(0, 1.2, 0)), this.scene);
        pl.diffuse = color;
        pl.intensity = 6 * power;
        pl.range = 16;
        this.fx.push({ kind: 'light', light: pl, age: 0, ttl: 0.24, from: 6 * power });
      }
    }
  }

  airstrikeFX(pos) {
    const beam = MeshBuilder.CreateCylinder('beam', { diameter: 3.4, height: 34, tessellation: 20 }, this.scene);
    beam.position.set(pos.x, 17, pos.z);
    const bm = this._emissiveMat(`beamM${beam.uniqueId}`, CYAN, 1.2);
    bm.alpha = 0.22;
    beam.material = bm;
    this.fx.push({ kind: 'beam', mesh: beam, age: 0, ttl: 0.5 });

    this.pending.push({ t: 0.12, fn: () => this.explode(pos, 2.6) });
    this.pending.push({ t: 0.24, fn: () => this.explode(pos.add(new Vector3(1.8, 0, 1.2)), 1.7) });
    this.pending.push({ t: 0.34, fn: () => this.explode(pos.add(new Vector3(-1.6, 0, -1.4)), 1.7) });
  }

  damageBaseFX(side) {
    const b = this.bases[side];
    if (!b) return;
    const x = b.sign * 30.5;
    this.explode(new Vector3(x, 1.5, (Math.random() - 0.5) * 10), 1.15, side === 'player' ? 'red' : 'amber');
  }

  collapseBase(side) {
    const b = this.bases[side];
    if (!b) return;
    const x = b.sign * 32;
    for (let i = 0; i < 5; i++) {
      this.pending.push({
        t: i * 0.12,
        fn: () => this.explode(new Vector3(x + (Math.random() - 0.5) * 3, 1 + Math.random() * 4, (Math.random() - 0.5) * 14), 2.2)
      });
    }
    this.pending.push({ t: 0.7, fn: () => { b.root.setEnabled(false); } });
  }

  restoreBase(side) {
    const b = this.bases[side];
    if (b) b.root.setEnabled(true);
  }

  shake(amount = 1) {
    if (document.body.classList.contains('no-shake')) return;
    this.shakeAmp = Math.min(1.4, (this.shakeAmp || 0) + 0.35 * amount);
  }

  project(v) {
    const t = Vector3.Project(
      v,
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(1280, 720)
    );
    return { x: t.x, y: t.y };
  }

  /* ---------------- quality ---------------- */
  setQuality(cfg) {
    if (!this.engine) return;
    if (cfg.hardwareScaling) this.engine.setHardwareScalingLevel(cfg.hardwareScaling);
    if (this.glow) this.glow.isEnabled = !!cfg.glow;
    if (this.dirLight) this.dirLight.shadowEnabled = !!cfg.shadows;
    this.particlesOn = !!cfg.particles;
    if (this.dust) {
      if (cfg.particles && this.dust.isStopped()) this.dust.start();
      if (!cfg.particles && !this.dust.isStopped()) this.dust.stop();
    }
  }

  /* ---------------- frame loop ---------------- */
  _tick(dt) {
    this.fps = this.fps * 0.94 + this.engine.getFps() * 0.06;
    const t = performance.now() / 1000;

    // camera
    if (this.mode === 'ambient') this.desired.alpha += dt * 0.045;
    const k = Math.min(1, dt * 2.4);
    this.camera.alpha += (this.desired.alpha - this.camera.alpha) * k;
    this.camera.beta += (this.desired.beta - this.camera.beta) * k;
    this.camera.radius += (this.desired.radius - this.camera.radius) * k;
    let ox = 0, oy = 0;
    if (this.shakeAmp && this.shakeAmp > 0.004) {
      ox = (Math.random() - 0.5) * this.shakeAmp;
      oy = (Math.random() - 0.5) * this.shakeAmp * 0.7;
      this.shakeAmp *= Math.pow(0.03, dt); // fast decay
    } else this.shakeAmp = 0;
    this.camera.target.x += (this.desired.tx + ox - this.camera.target.x) * Math.min(1, dt * 6);
    this.camera.target.y += (this.desired.ty + oy - this.camera.target.y) * Math.min(1, dt * 6);
    this.camera.target.z += (this.desired.tz - this.camera.target.z) * Math.min(1, dt * 6);

    // ambient life
    if (this.mode === 'ambient' && this.props && this.props.isEnabled()) {
      if (this.radarDish) this.radarDish.rotation.y += dt * 1.6;
      if (this.holoRing) { this.holoRing.rotation.y -= dt * 0.25; }
      this.holoPillars.forEach((p) => {
        p.mat.alpha = 0.12 + 0.08 * (0.5 + 0.5 * Math.sin(t * 1.8 + p.phase));
        p.mesh.position.y = 2.3 + Math.sin(t * 1.2 + p.phase) * 0.18;
      });
    }
    if (this._blinkers) {
      this._blinkers.forEach((b) => {
        const f = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * b.speed * Math.PI));
        b.mat.emissiveColor = b.base.scale(f * 1.4);
      });
    }

    // pending scheduled fx
    for (let i = this.pending.length - 1; i >= 0; i--) {
      this.pending[i].t -= dt;
      if (this.pending[i].t <= 0) {
        const p = this.pending.splice(i, 1)[0];
        p.fn();
      }
    }

    // fx
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.age += dt;
      const q = Math.min(1, f.age / f.ttl);
      switch (f.kind) {
        case 'fade':
          if (q >= 1) { f.mesh.dispose(); this.fx.splice(i, 1); }
          break;
        case 'shrink':
          f.mesh.scaling.setAll(Math.max(0.01, 1 - q));
          if (q >= 1) { f.mesh.dispose(); this.fx.splice(i, 1); }
          break;
        case 'grow': {
          const s = f.from + (f.to - f.from) * (1 - Math.pow(1 - q, 3));
          f.mesh.scaling.setAll(s);
          f.mesh.material.alpha = 1 - q;
          if (q >= 1) { f.mesh.dispose(); this.fx.splice(i, 1); }
          break;
        }
        case 'growFlat': {
          const s = f.from + (f.to - f.from) * (1 - Math.pow(1 - q, 2));
          f.mesh.scaling.x = s; f.mesh.scaling.z = s;
          f.mesh.material.alpha = 0.9 * (1 - q);
          if (q >= 1) { f.mesh.dispose(); this.fx.splice(i, 1); }
          break;
        }
        case 'beam':
          f.mesh.material.alpha = 0.22 * (1 - q);
          f.mesh.scaling.x = 1 + q * 0.6; f.mesh.scaling.z = 1 + q * 0.6;
          if (q >= 1) { f.mesh.dispose(); this.fx.splice(i, 1); }
          break;
        case 'debris':
          f.mesh.position.addInPlace(f.vel.scale(dt));
          f.vel.y -= 24 * dt;
          f.mesh.rotation.x += f.spin.x * dt;
          f.mesh.rotation.y += f.spin.y * dt;
          f.mesh.material.alpha = 1 - q;
          if (q >= 1 || f.mesh.position.y < -0.2) { f.mesh.dispose(); this.fx.splice(i, 1); }
          break;
        case 'light':
          f.light.intensity = f.from * (1 - q);
          if (q >= 1) { f.light.dispose(); this.fx.splice(i, 1); }
          break;
        default: this.fx.splice(i, 1);
      }
    }

    if (this.onTick) this.onTick(dt, this.fps);
  }

  resize() {
    this.engine && this.engine.resize();
  }

  dispose() {
    try {
      this.engine && this.engine.dispose();
    } catch (e) { /* noop */ }
  }
}
