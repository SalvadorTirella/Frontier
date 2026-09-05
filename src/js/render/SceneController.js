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

import LaneSystem from '../core/LaneSystem.js';
import { LANE_CONFIG, BATTLE, COVER_DEFS } from '../core/Config.js';

export default class SceneController {
  constructor() {
    this.onTick = null;
    this.fx = [];
    this.pending = [];
    this.units = [];
    this.mode = 'ambient';
    this.fps = 60;
    this.particlesOn = true;
    this.dustRunning = false;
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
    this.laneSystem = new LaneSystem({ count: LANE_CONFIG.count });
    this._buildLanes();
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

  /* ---------------- lanes (Milestone 2) ---------------- */

  /**
   * Builds lane floor lines, per-lane highlight strips, spawn/base
   * markers per lane and the deploy arrow. Purely visual — the
   * tactical data lives in this.laneSystem.
   */
  _buildLanes() {
    const scene = this.scene;
    const lanes = this.laneSystem.lanes;
    const laneRoot = new TransformNode('lanes', scene);
    this.laneRoot = laneRoot;

    // inner boundary lines (subtle energy seams between corridors)
    for (let i = 0; i < lanes.length - 1; i++) {
      const z = (lanes[i].zCenter + lanes[i + 1].zCenter) / 2;
      const line = MeshBuilder.CreateBox(`laneLine${i}`, { width: 58, height: 0.03, depth: 0.09 }, scene);
      line.position.set(0, 0.02, z);
      const m = this._emissiveMat(`laneLineM${i}`, CYAN, 0.5);
      m.alpha = 0.3;
      line.material = m;
      line.parent = laneRoot;
    }

    // per-lane highlight strips (selection / hover feedback)
    this._laneStripMats = [];
    lanes.forEach((lane) => {
      const strip = MeshBuilder.CreateBox(`laneStrip${lane.id}`, { width: 56, height: 0.02, depth: lane.width * 0.9 }, scene);
      strip.position.set(0, 0.015, lane.zCenter);
      const m = this._emissiveMat(`laneStripM${lane.id}`, CYAN, 0.7);
      m.alpha = 0;
      strip.material = m;
      strip.parent = laneRoot;
      this._laneStripMats.push(m);
    });

    // spawn markers per lane (amber = player deploy, red = enemy ingress)
    lanes.forEach((lane) => {
      const pw = lane.width * 0.62;
      const pm = MeshBuilder.CreateBox(`spawnP${lane.id}`, { width: 0.55, height: 0.04, depth: pw }, scene);
      pm.position.set(-BATTLE.spawnX, 0.03, lane.zCenter);
      pm.material = this._emissiveMat(`spawnPM${lane.id}`, AMBER, 0.85);
      pm.parent = laneRoot;
      const em = MeshBuilder.CreateBox(`spawnE${lane.id}`, { width: 0.55, height: 0.04, depth: pw }, scene);
      em.position.set(BATTLE.spawnX, 0.03, lane.zCenter);
      em.material = this._emissiveMat(`spawnEM${lane.id}`, RED, 0.85);
      em.parent = laneRoot;
    });

    // deploy arrow — marks the currently selected lane
    const arrow = MeshBuilder.CreateCylinder('deployArrow', { diameterTop: 0, diameterBottom: 1.1, height: 1.5, tessellation: 3 }, scene);
    arrow.rotation.z = -Math.PI / 2;
    arrow.rotation.y = Math.PI / 2;
    this.deployArrowMat = this._emissiveMat('deployArrowM', AMBER, 1.15);
    arrow.material = this.deployArrowMat;
    arrow.position.set(-BATTLE.spawnX + 2.2, 0.35, lanes[this.laneSystem.middleLane].zCenter);
    arrow.parent = laneRoot;
    this.deployArrow = arrow;
    arrow.isVisible = false;
    this.deployArrowMat.alpha = 0.9;

    this.selectedLane = null;
    this.hoverLane = null;
  }

  /**
   * Highlights the selected lane and moves the deploy arrow.
   * @param {number|null} laneId
   */
  setSelectedLane(laneId) {
    this.selectedLane = laneId;
    if (this.deployArrow) {
      if (laneId === null || laneId === undefined) {
        this.deployArrow.isVisible = false;
      } else {
        const lane = this.laneSystem.getLane(laneId);
        if (lane) {
          this.deployArrow.isVisible = true;
          this.deployArrow.position.z = lane.zCenter;
        }
      }
    }
    this._refreshLaneStrips();
  }

  /**
   * Soft hover preview over a lane.
   * @param {number|null} laneId
   */
  setHoverLane(laneId) {
    if (this.hoverLane === laneId) return;
    this.hoverLane = laneId;
    this._refreshLaneStrips();
  }

  _refreshLaneStrips() {
    if (!this._laneStripMats) return;
    this._laneStripMats.forEach((m, id) => {
      let a = 0;
      if (id === this.selectedLane) a = 0.11;
      else if (id === this.hoverLane) a = 0.055;
      m.alpha = a;
      m.emissiveColor = (id === this.selectedLane ? AMBER : CYAN).scale(id === this.selectedLane ? 0.8 : 0.7);
    });
  }

  /**
   * Ray-casts the screen point against the ground plane (y = 0).
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{x:number, z:number}|null}
   */
  pickGround(clientX, clientY) {
    if (!this.scene || !this.camera || !this.engine) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    const rw = this.engine.getRenderWidth();
    const rh = this.engine.getRenderHeight();
    const px = ((clientX - rect.left) / rect.width) * rw;
    const py = ((clientY - rect.top) / rect.height) * rh;
    const view = this.scene.getViewMatrix();
    const proj = this.scene.getProjectionMatrix();
    const near = Vector3.Unproject(new Vector3(px, py, 0), rw, rh, Matrix.Identity(), view, proj);
    const far = Vector3.Unproject(new Vector3(px, py, 1), rw, rh, Matrix.Identity(), view, proj);
    const dir = far.subtract(near);
    if (Math.abs(dir.y) < 1e-5) return null;
    const t = -near.y / dir.y;
    if (t < 0) return null;
    return { x: near.x + dir.x * t, z: near.z + dir.z * t };
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
    this.dustRunning = true;
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
    const stripeMat = this._emissiveMat(`stripeM${root.uniqueId}`, accent, 0.85);
    stripe.material = stripeMat;
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

    const handle = { root, hpFg, hpMat: fgMat, stripeMat, def, side, id: root.uniqueId, tx: x, tz: z, lerp: 9 };
    this.units.push(handle);
    return handle;
  }

  /* ---------------- heroes / structures / preview (Milestone 4) ---------------- */

  /** Makes a unit's accent stripe glow brighter (upgrade feedback). */
  brightenStripe(handle) {
    if (handle && handle.stripeMat) {
      handle.stripeMat.emissiveColor = handle.stripeMat.emissiveColor.scale(1.22);
    }
  }

  /**
   * Distinctive hero rig: taller hull, base glow ring and an amber
   * ultimate-charge bar above the health bar.
   * @param {object} heroDef HERO_TYPES entry
   * @param {number} x @param {number} z
   */
  addHeroMesh(heroDef, x, z) {
    const scene = this.scene;
    const s = heroDef.size || 1.3;
    const accent = heroDef.accent === 'green' ? HP_GREEN : heroDef.accent === 'amber' ? AMBER : CYAN;
    const root = new TransformNode(`hero-${heroDef.id}`, scene);
    root.position.set(x, 0, z);
    root.rotation.y = Math.PI / 2;

    const hullMat = new StandardMaterial('heroHull', scene);
    hullMat.diffuseColor = new Color3(0.1, 0.16, 0.24);
    hullMat.specularColor = new Color3(0.25, 0.3, 0.35);

    const body = MeshBuilder.CreateBox('heroBody', { width: 1.5 * s, height: 1.1 * s, depth: 2.4 * s }, scene);
    body.position.y = 0.6 * s;
    body.material = hullMat;
    body.parent = root;

    const cab = MeshBuilder.CreateBox('heroCab', { width: 1.1 * s, height: 0.7 * s, depth: 1.2 * s }, scene);
    cab.position.set(0, 1.4 * s, -0.3 * s);
    cab.material = hullMat;
    cab.parent = root;

    const stripe = MeshBuilder.CreateBox('heroStripe', { width: 1.54 * s, height: 0.2 * s, depth: 2.44 * s }, scene);
    stripe.position.y = 1.15 * s;
    const stripeMat = this._emissiveMat(`heroStripeM${root.uniqueId}`, accent, 1.4);
    stripe.material = stripeMat;
    stripe.parent = root;

    // base glow ring
    const ring = MeshBuilder.CreateTorus('heroRing', { diameter: 3.1 * s, tube: 0.07, tessellation: 40 }, scene);
    ring.position.y = 0.1;
    const ringMat = this._emissiveMat(`heroRingM${root.uniqueId}`, accent, 1.2);
    ringMat.alpha = 0.6;
    ring.material = ringMat;
    ring.parent = root;

    // health bar
    const barY = 2.3 * s;
    const hpBg = MeshBuilder.CreateBox('heroHpBg', { width: 2.2, height: 0.14, depth: 0.05 }, scene);
    hpBg.position.set(0, barY, 0);
    const bgMat = new StandardMaterial('heroHpBgM', scene);
    bgMat.diffuseColor = new Color3(0.02, 0.03, 0.05);
    hpBg.material = bgMat;
    hpBg.parent = root;
    const hpFg = MeshBuilder.CreateBox('heroHpFg', { width: 2.2, height: 0.14, depth: 0.07 }, scene);
    hpFg.position.set(0, barY, -0.012);
    const hpMat = this._emissiveMat(`heroHpM${root.uniqueId}`, HP_GREEN, 0.9);
    hpFg.material = hpMat;
    hpFg.parent = root;

    // ultimate charge bar (amber, above health)
    const ultFg = MeshBuilder.CreateBox('heroUltFg', { width: 2.2, height: 0.09, depth: 0.07 }, scene);
    ultFg.position.set(0, barY + 0.24, -0.012);
    const ultMat = this._emissiveMat(`heroUltM${root.uniqueId}`, AMBER, 1.3);
    ultFg.material = ultMat;
    ultFg.parent = root;
    ultFg.scaling.x = 0.001;

    this.shadowGen.addShadowCaster(body);
    this.shadowGen.addShadowCaster(cab);

    const handle = {
      root, hpFg, hpMat, stripeMat, ultFg, hpW: 2.2,
      def: { id: heroDef.id, size: heroDef.size }, side: 'player',
      id: root.uniqueId, tx: x, tz: z, lerp: 9
    };
    this.units.push(handle);
    return handle;
  }

  /** Sets the hero ultimate charge bar width (0..1). */
  setHeroCharge(handle, pct) {
    if (handle && handle.ultFg) {
      const p = Math.max(0, Math.min(1, pct));
      handle.ultFg.scaling.x = Math.max(0.001, p);
      handle.ultFg.position.x = -(1 - p) * (handle.hpW / 2);
    }
  }

  /**
   * Structure mesh per type: turret (barrel + dome), mine (flat disc),
   * sandbag / barricade reuse the cover look.
   * @param {object} s structure runtime object
   */
  addStructureMesh(s) {
    const scene = this.scene;
    const def = s.def;
    const root = new TransformNode(`struct-${s.id}`, scene);
    root.position.set(s.x, 0, s.z);

    if (def.id === 'turret') {
      const mat = new StandardMaterial('turM', scene);
      mat.diffuseColor = new Color3(0.12, 0.18, 0.24);
      mat.specularColor = new Color3(0.2, 0.25, 0.3);
      const base = MeshBuilder.CreateCylinder('turBase', { diameter: 1.3, height: 0.5, tessellation: 16 }, scene);
      base.position.y = 0.25;
      base.material = mat;
      base.parent = root;
      const dome = MeshBuilder.CreateSphere('turDome', { diameter: 0.9 }, scene);
      dome.position.y = 0.85;
      dome.material = mat;
      dome.parent = root;
      const barrel = MeshBuilder.CreateCylinder('turBarrel', { diameter: 0.16, height: 1.2 }, scene);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.95, 0.6);
      barrel.material = mat;
      barrel.parent = root;
      const lamp = MeshBuilder.CreateSphere('turLamp', { diameter: 0.22 }, scene);
      lamp.position.y = 1.35;
      lamp.material = this._emissiveMat(`turLampM${root.uniqueId}`, CYAN, 1.5);
      lamp.parent = root;
      this.shadowGen.addShadowCaster(base);
      this.shadowGen.addShadowCaster(dome);
    } else if (def.id === 'mine') {
      const disc = MeshBuilder.CreateCylinder('mineDisc', { diameter: 1.0, height: 0.18, tessellation: 20 }, scene);
      disc.position.y = 0.09;
      const mat = new StandardMaterial('mineM', scene);
      mat.diffuseColor = new Color3(0.22, 0.14, 0.1);
      disc.material = mat;
      disc.parent = root;
      const led = MeshBuilder.CreateSphere('mineLed', { diameter: 0.18 }, scene);
      led.position.y = 0.24;
      led.material = this._emissiveMat(`mineLedM${root.uniqueId}`, RED, 1.6);
      led.parent = root;
    } else {
      // sandbag / barricade share the cover look
      const cd = COVER_DEFS[def.id] || { w: 2, h: 1, d: 1 };
      const mat = new StandardMaterial(`stM${s.id}`, scene);
      mat.diffuseColor = def.id === 'barricade' ? new Color3(0.14, 0.17, 0.2) : new Color3(0.3, 0.25, 0.15);
      const box = MeshBuilder.CreateBox('stBox', { width: cd.w, height: cd.h, depth: cd.d }, scene);
      box.position.y = cd.h / 2;
      box.material = mat;
      box.parent = root;
      this.shadowGen.addShadowCaster(box);
    }
    return root;
  }

  /** Sinks / darkens a damaged structure. */
  updateStructureDamage(s) {
    const ratio = Math.max(0, s.hp / s.maxHp);
    if (s.handle) s.handle.position.y = -(1 - ratio) * 0.15;
  }

  /** @param {object} s structure runtime object */
  removeStructureMesh(s) {
    if (s.handle) {
      s.handle.dispose();
      s.handle = null;
    }
  }

  /**
   * Ghost preview while placing a structure.
   * @param {number} x @param {number} z @param {boolean} valid
   */
  setPlacementPreview(x, z, valid) {
    if (!this._preview) {
      const box = MeshBuilder.CreateBox('pvBox', { width: 2.2, height: 1.2, depth: 2.2 }, this.scene);
      const bm = this._emissiveMat('pvBoxM', CYAN, 1.0);
      bm.alpha = 0.22;
      box.material = bm;
      const ring = MeshBuilder.CreateTorus('pvRing', { diameter: 3.4, tube: 0.08, tessellation: 40 }, this.scene);
      ring.position.y = 0.12;
      const rm = this._emissiveMat('pvRingM', CYAN, 1.4);
      ring.material = rm;
      this._preview = { box, ring, boxMat: bm, ringMat: rm };
    }
    this._preview.box.position.set(x, 0.6, z);
    this._preview.ring.position.set(x, 0.12, z);
    const color = valid ? HP_GREEN : RED;
    this._preview.boxMat.emissiveColor = color.scale(0.9);
    this._preview.ringMat.emissiveColor = color.scale(1.3);
  }

  clearPlacementPreview() {
    if (this._preview) {
      this._preview.box.dispose();
      this._preview.ring.dispose();
      this._preview = null;
    }
  }

  /**
   * Sets the movement target of a unit. The mesh interpolates
   * smoothly toward it inside the render loop (lane changes and
   * formation reforms become visible glides instead of teleports).
   * @param {object} handle
   * @param {number} x
   * @param {number} z
   * @param {number} [lerp=9] exponential smoothing speed
   */
  moveUnit(handle, x, z, lerp = 9) {
    handle.tx = x;
    handle.tz = z;
    handle.lerp = lerp;
  }

  setUnitHP(handle, pct) {
    const p = Math.max(0, Math.min(1, pct));
    const half = (handle.hpW || 1.7) / 2;
    handle.hpFg.scaling.x = Math.max(0.001, p);
    handle.hpFg.position.x = -(1 - p) * half;
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
        const pl = new PointLight('expL', new Vector3(pos.x, pos.y + 1.2, pos.z), this.scene);
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

  /* ---------------- projectile visuals (Milestone 3) ---------------- */

  /**
   * Creates the mesh for a projectile kind.
   * @param {string} kind bullet|rocket|grenade|missile|shell
   * @param {string} side
   */
  projectileMesh(kind, side) {
    const accent = side === 'player' ? CYAN : RED;
    let mesh;
    switch (kind) {
      case 'rocket':
        mesh = MeshBuilder.CreateBox('rk', { width: 0.2, height: 0.2, depth: 0.72 }, this.scene);
        mesh.material = this._emissiveMat(`rkM${mesh.uniqueId}`, accent, 1.3);
        break;
      case 'grenade':
        mesh = MeshBuilder.CreateSphere('gr', { diameter: 0.3 }, this.scene);
        mesh.material = this._emissiveMat(`grM${mesh.uniqueId}`, AMBER, 1.1);
        break;
      case 'shell':
        mesh = MeshBuilder.CreateSphere('sh', { diameter: 0.34 }, this.scene);
        mesh.material = this._emissiveMat(`shM${mesh.uniqueId}`, AMBER, 1.4);
        break;
      case 'missile':
        mesh = MeshBuilder.CreateBox('ms', { width: 0.16, height: 0.16, depth: 1.0 }, this.scene);
        mesh.material = this._emissiveMat(`msM${mesh.uniqueId}`, accent, 1.5);
        break;
      default: // bullet tracer
        mesh = MeshBuilder.CreateBox('bl', { width: 0.07, height: 0.07, depth: 0.85 }, this.scene);
        mesh.material = this._emissiveMat(`blM${mesh.uniqueId}`, accent, 1.7);
    }
    return mesh;
  }

  /** Smoke puff for rocket / shell trails. */
  smokePuff(pos) {
    if (!this.particlesOn) return;
    const s = MeshBuilder.CreateSphere('smk', { diameter: 0.42 }, this.scene);
    s.position.set(pos.x, pos.y, pos.z);
    const m = new StandardMaterial(`smkM${s.uniqueId}`, this.scene);
    m.diffuseColor = new Color3(0.32, 0.33, 0.36);
    m.emissiveColor = new Color3(0.1, 0.1, 0.12);
    m.alpha = 0.5;
    s.material = m;
    this.fx.push({ kind: 'grow', mesh: s, age: 0, ttl: 0.7, from: 0.5, to: 2.1 });
  }

  /** Glowing trail puff for missiles. */
  glowPuff(pos, side) {
    const s = MeshBuilder.CreateSphere('gpf', { diameter: 0.2 }, this.scene);
    s.position.set(pos.x, pos.y, pos.z);
    s.material = this._emissiveMat(`gpfM${s.uniqueId}`, side === 'player' ? CYAN : RED, 1.2);
    this.fx.push({ kind: 'shrink', mesh: s, age: 0, ttl: 0.28 });
  }

  /** Small spark on bullet / cover impacts. */
  impactSpark(pos, side) {
    const s = MeshBuilder.CreateSphere('spk', { diameter: 0.3 }, this.scene);
    s.position.set(pos.x, pos.y, pos.z);
    s.material = this._emissiveMat(`spkM${s.uniqueId}`, side === 'player' ? CYAN : AMBER, 1.8);
    this.fx.push({ kind: 'shrink', mesh: s, age: 0, ttl: 0.1 });
  }

  /**
   * Instant beam lance between two points.
   * @param {{x,y,z}} a @param {{x,y,z}} b @param {string} side
   */
  beamFX(a, b, side) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.max(0.2, Math.hypot(dx, dy, dz));
    const mesh = MeshBuilder.CreateBox('beamL', { width: 0.14, height: 0.14, depth: 1 }, this.scene);
    mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.scaling.z = len;
    mesh.rotation.y = Math.atan2(dx, dz);
    mesh.rotation.x = -Math.asin(Math.max(-1, Math.min(1, dy / len)));
    mesh.material = this._emissiveMat(`beamLM${mesh.uniqueId}`, side === 'player' ? CYAN : RED, 2.0);
    this.fx.push({ kind: 'fade', mesh, age: 0, ttl: 0.16 });
    this.muzzle(new Vector3(a.x, a.y, a.z), side);
  }

  /**
   * Telegraphed impact zone: pulsing red disc + rotating ring.
   * @param {number} x @param {number} z @param {number} r @param {number} duration
   */
  telegraphArea(x, z, r, duration) {
    const disc = MeshBuilder.CreateCylinder('tgrD', { diameter: r * 2, height: 0.05, tessellation: 36 }, this.scene);
    disc.position.set(x, 0.06, z);
    const mat = this._emissiveMat(`tgrM${disc.uniqueId}`, RED, 1.0);
    mat.alpha = 0.22;
    disc.material = mat;
    const ring = MeshBuilder.CreateTorus('tgrR', { diameter: r * 2, tube: 0.09, tessellation: 44 }, this.scene);
    ring.position.set(x, 0.12, z);
    ring.material = this._emissiveMat(`tgrRM${ring.uniqueId}`, RED, 1.5);
    this.fx.push({ kind: 'telegraph', mesh: disc, ring, mat, age: 0, ttl: duration });
  }

  /**
   * Temporary camera zoom (boss entrance etc). Restores after duration.
   * @param {number} radius @param {number} duration
   */
  cameraZoom(radius, duration) {
    const prev = this.desired.radius;
    this.desired.radius = radius;
    this.pending.push({ t: duration, fn: () => { this.desired.radius = prev; } });
  }

  /* ---------------- cover rendering ---------------- */

  /** @param {object} cover CoverSystem object */
  addCoverMesh(cover) {
    const scene = this.scene;
    const root = new TransformNode(`cover${cover.id}`, scene);
    root.position.set(cover.x, 0, cover.z);

    if (cover.type === 'barricade') {
      const mat = new StandardMaterial(`covM${cover.id}`, scene);
      mat.diffuseColor = new Color3(0.14, 0.17, 0.2);
      mat.specularColor = new Color3(0.12, 0.12, 0.14);
      const box = MeshBuilder.CreateBox('covB', { width: cover.w, height: cover.h, depth: cover.d }, scene);
      box.position.y = cover.h / 2;
      box.material = mat;
      box.parent = root;
      const stripe = MeshBuilder.CreateBox('covS', { width: cover.w + 0.03, height: 0.16, depth: cover.d + 0.03 }, scene);
      stripe.position.y = cover.h * 0.66;
      stripe.material = this._emissiveMat(`covSM${cover.id}`, AMBER, 0.7);
      stripe.parent = root;
      this.shadowGen.addShadowCaster(box);
      cover._mat = mat;
    } else {
      const mat = new StandardMaterial(`covM${cover.id}`, scene);
      mat.diffuseColor = new Color3(0.3, 0.25, 0.15);
      mat.specularColor = new Color3(0.04, 0.04, 0.03);
      const box = MeshBuilder.CreateBox('covB', { width: cover.w, height: cover.h, depth: cover.d }, scene);
      box.position.y = cover.h / 2;
      box.material = mat;
      box.parent = root;
      const top = MeshBuilder.CreateBox('covT', { width: cover.w * 0.9, height: 0.24, depth: cover.d * 0.8 }, scene);
      top.position.y = cover.h + 0.1;
      top.material = mat;
      top.parent = root;
      this.shadowGen.addShadowCaster(box);
      cover._mat = mat;
    }
    return root;
  }

  /** Darkens / sinks a cover piece as it takes damage. */
  updateCoverDamage(cover) {
    const ratio = Math.max(0, cover.hp / cover.maxHp);
    if (cover._mat) {
      cover._mat.diffuseColor = cover._mat.diffuseColor.scale(0.985);
      cover._mat.emissiveColor = new Color3(0.25 * (1 - ratio), 0.02, 0.0);
    }
    if (cover.handle) {
      cover.handle.position.y = -(1 - ratio) * 0.18;
    }
  }

  /** Debris burst when cover is destroyed. */
  destroyCoverFX(cover) {
    this.explode(new Vector3(cover.x, 0.7, cover.z), 0.7, 'red');
    this.smokePuff({ x: cover.x, y: 0.8, z: cover.z });
  }

  /** @param {object} cover */
  removeCoverMesh(cover) {
    if (cover.handle) {
      cover.handle.dispose();
      cover.handle = null;
    }
  }

  /* ---------------- boss rendering ---------------- */

  /**
   * Builds the boss rig: dark hull, pulsing core, spikes, wide HP bar.
   * @param {object} def BOSS_TEMPLATES entry
   * @param {number} x @param {number} z
   */
  addBossMesh(def, x, z) {
    const scene = this.scene;
    const k = (def.size || 3) * 0.62;
    const root = new TransformNode(`boss-${def.id}`, scene);
    root.position.set(x, 0, z);
    root.rotation.y = -Math.PI / 2;

    const hullMat = new StandardMaterial('bossHull', scene);
    hullMat.diffuseColor = new Color3(0.12, 0.06, 0.09);
    hullMat.specularColor = new Color3(0.2, 0.1, 0.14);

    const hull = MeshBuilder.CreateBox('bossBody', { width: 1.5 * k, height: 1.1 * k, depth: 3.2 * k }, scene);
    hull.position.y = 0.85 * k;
    hull.material = hullMat;
    hull.parent = root;

    const dome = MeshBuilder.CreateSphere('bossDome', { diameter: 1.5 * k }, scene);
    dome.position.y = 1.5 * k;
    dome.material = hullMat;
    dome.parent = root;

    const core = MeshBuilder.CreateSphere('bossCore', { diameter: 0.75 * k }, scene);
    core.position.set(0, 1.5 * k, -0.55 * k);
    const coreMat = this._emissiveMat('bossCoreM', RED, 1.6);
    core.material = coreMat;
    core.parent = root;
    this._blinkers = this._blinkers || [];
    this._blinkers.push({ mat: coreMat, base: RED.clone(), speed: 4.2 });

    [[-0.8, 0.7], [0.8, 0.7], [0, -0.9]].forEach(([ox, oz], i) => {
      const spike = MeshBuilder.CreateCylinder(`bossSpk${i}`, { diameterTop: 0, diameterBottom: 0.34 * k, height: 1.1 * k, tessellation: 5 }, scene);
      spike.position.set(ox * k, 2.0 * k, oz * k);
      spike.material = hullMat;
      spike.parent = root;
      this.shadowGen.addShadowCaster(spike);
    });

    [[-1.15], [1.15]].forEach(([ox], i) => {
      const pod = MeshBuilder.CreateBox(`bossPod${i}`, { width: 0.5 * k, height: 0.5 * k, depth: 1.4 * k }, scene);
      pod.position.set(ox * k, 0.55 * k, 0);
      pod.material = hullMat;
      pod.parent = root;
    });

    // wide overhead HP bar
    const barY = 2.9 * k;
    const hpBg = MeshBuilder.CreateBox('bossHpBg', { width: 5.4, height: 0.22, depth: 0.06 }, scene);
    hpBg.position.set(0, barY, 0);
    const bgMat = new StandardMaterial('bossHpBgM', scene);
    bgMat.diffuseColor = new Color3(0.02, 0.03, 0.05);
    bgMat.emissiveColor = new Color3(0.05, 0.03, 0.04);
    hpBg.material = bgMat;
    hpBg.parent = root;
    const hpFg = MeshBuilder.CreateBox('bossHpFg', { width: 5.4, height: 0.22, depth: 0.09 }, scene);
    hpFg.position.set(0, barY, -0.014);
    const fgMat = this._emissiveMat('bossHpM', RED, 1.1);
    hpFg.material = fgMat;
    hpFg.parent = root;

    this.shadowGen.addShadowCaster(hull);
    this.shadowGen.addShadowCaster(dome);

    const handle = { root, hpFg, hpMat: fgMat, hpW: 5.4, def: { id: def.id, size: def.size }, side: 'enemy', id: root.uniqueId, tx: x, tz: z, lerp: 6 };
    this.units.push(handle);
    return handle;
  }

  /* ---------------- quality ---------------- */
  setQuality(cfg) {
    if (!this.engine) return;
    if (cfg.hardwareScaling) this.engine.setHardwareScalingLevel(cfg.hardwareScaling);
    if (this.glow) this.glow.isEnabled = !!cfg.glow;
    if (this.dirLight) this.dirLight.shadowEnabled = !!cfg.shadows;
    this.particlesOn = !!cfg.particles;
    if (this.dust) {
      if (cfg.particles && !this.dustRunning) { this.dust.start(); this.dustRunning = true; }
      if (!cfg.particles && this.dustRunning) { this.dust.stop(); this.dustRunning = false; }
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

    // unit movement interpolation (targets come from the battle sim)
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      const p = u.root.position;
      const kk = 1 - Math.exp(-(u.lerp || 9) * dt);
      p.x += (u.tx - p.x) * kk;
      p.z += (u.tz - p.z) * kk;
    }

    // deploy arrow pulse
    if (this.deployArrow && this.deployArrow.isVisible) {
      this.deployArrow.position.y = 0.35 + Math.sin(t * 3.2) * 0.12;
      this.deployArrowMat.emissiveColor = AMBER.scale(0.95 + 0.35 * Math.sin(t * 3.2));
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
        case 'telegraph':
          f.mat.alpha = 0.16 + 0.14 * (0.5 + 0.5 * Math.sin(f.age * 11));
          f.ring.rotation.y += dt * 1.4;
          if (q >= 1) { f.mesh.dispose(); f.ring.dispose(); this.fx.splice(i, 1); }
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
