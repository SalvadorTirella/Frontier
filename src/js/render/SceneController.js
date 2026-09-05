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

/* ---------- VISUAL BIBLE PALETTE — Frontline: Operación Ironveil ---------- */
const CYAN   = new Color3(0.0, 0.78, 1.0);   // #00C6FF player neon
const ICE    = new Color3(0.30, 0.65, 1.0);  // #4DA6FF ice blue
const AMBER  = new Color3(1.0, 0.67, 0.20);  // #FFAA33 player amber
const RED    = new Color3(1.0, 0.16, 0.16);  // #FF2A2A enemy red
const MAGMA  = new Color3(1.0, 0.40, 0.0);   // #FF6600 magma orange
const PURPLE = new Color3(0.48, 0.12, 0.64); // #7B1FA2 alien core
const STEEL  = new Color3(0.10, 0.12, 0.15); // #1A1F26 player steel
const CARBON = new Color3(0.05, 0.05, 0.06); // #0D0D0D alien carbon
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
    this.smokeRunning = false;
    this.goreLevel = 'NORMAL';
    this._blinkers = [];
    this.floaters = [];
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
    scene.clearColor = new Color4(0.02, 0.027, 0.04, 1); // #05070A deep void
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogStart = 62;
    scene.fogEnd = 180;
    scene.fogColor = new Color3(0.02, 0.027, 0.045);

    this.camera = new ArcRotateCamera('cam', Math.PI * 0.72, 1.05, 40, new Vector3(0, 2, 0), scene);
    this.camera.minZ = 0.5;
    this.camera.maxZ = 900;
    this.camera.fov = 0.92;
    this.desired = { alpha: Math.PI * 0.72, beta: 1.05, radius: 40, tx: 0, ty: 2, tz: 0 };

    // ambient: faint blue bounce
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.5;
    hemi.diffuse = new Color3(0.62, 0.74, 0.95);
    hemi.groundColor = new Color3(0.03, 0.05, 0.1);

    // cold key light from behind the player base — long shadows toward the fortress
    this.dirLight = new DirectionalLight('dir', new Vector3(0.55, -1, 0.18), scene);
    this.dirLight.position = new Vector3(-48, 46, -14);
    this.dirLight.diffuse = new Color3(0.8, 0.88, 1.0);
    this.dirLight.specular = new Color3(0.35, 0.45, 0.6);
    this.dirLight.intensity = 1.2;
    this.shadowGen = new ShadowGenerator(1024, this.dirLight);
    this.shadowGen.useBlurExponentialShadowMap = true;
    this.shadowGen.setDarkness(0.42);

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

    this.glow = new GlowLayer('glow', scene, { intensity: 0.8 });

    this._buildSky();
    this._buildBases();
    this._buildProps();
    this.laneSystem = new LaneSystem({ count: LANE_CONFIG.count });
    this._buildLanes();
    this._buildDust();
    this._buildEnemySmoke();

    this.engine.runRenderLoop(() => {
      const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);
      this._tick(dt);
      this.scene.render();
    });
  }

  /* worn circuit floor: gunmetal base #15191E + hex lattice & traces #1E2A33 */
  _buildGridMaterial() {
    const size = 512;
    const tex = new DynamicTexture('gridTex', size, this.scene, false);
    const ctx = tex.getContext();
    ctx.fillStyle = '#15191e';
    ctx.fillRect(0, 0, size, size);

    // subtle hex lattice
    ctx.strokeStyle = 'rgba(30,42,51,0.6)';
    ctx.lineWidth = 1.4;
    const r = 34;
    const h = r * Math.sqrt(3);
    for (let row = -1; row < size / h + 1; row++) {
      for (let col = -1; col < size / (r * 1.5) + 1; col++) {
        const cx = col * r * 1.5;
        const cy = row * h + (col % 2 ? h / 2 : 0);
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          const px = cx + r * Math.cos(a);
          const py = cy + r * Math.sin(a);
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }

    // circuit traces with node pads
    ctx.strokeStyle = 'rgba(38,54,66,0.9)';
    ctx.lineWidth = 2.6;
    for (let i = 0; i < 26; i++) {
      let x = Math.random() * size;
      let y = Math.random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let sgm = 0; sgm < 3; sgm++) {
        if (Math.random() > 0.5) x += (Math.random() - 0.5) * 130;
        else y += (Math.random() - 0.5) * 130;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(30,42,51,1)';
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }

    // a few live cyan traces + major panel seams
    ctx.strokeStyle = 'rgba(0,198,255,0.14)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      let x = Math.random() * size;
      let y = Math.random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let sgm = 0; sgm < 4; sgm++) {
        if (Math.random() > 0.5) x += (Math.random() - 0.5) * 170;
        else y += (Math.random() - 0.5) * 170;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,198,255,0.16)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i <= 2; i++) {
      const p = i * (size / 2);
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }

    tex.update();
    tex.uScale = 11;
    tex.vScale = 4.5;
    const mat = new StandardMaterial('groundMat', this.scene);
    mat.diffuseTexture = tex;
    mat.diffuseColor = new Color3(0.9, 0.9, 0.92);
    mat.emissiveTexture = tex;
    mat.emissiveColor = new Color3(0.5, 0.5, 0.55);
    mat.specularColor = new Color3(0.07, 0.08, 0.1); // brushed metal sheen
    mat.specularPower = 24;
    return mat;
  }

  /* ---------------- space sky (Visual Bible) ---------------- */
  _buildSky() {
    const scene = this.scene;

    // gradient dome: #020305 horizon → #0A1A33 zenith, stars & blue nebulae
    const sky = MeshBuilder.CreateSphere('sky', { diameter: 520, segments: 20 }, scene);
    sky.applyFog = false;
    sky.infiniteDistance = true;
    const tex = new DynamicTexture('skyTex', { width: 1024, height: 512 }, scene, false);
    const c = tex.getContext();
    const grad = c.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#0a1a33');
    grad.addColorStop(0.45, '#050b18');
    grad.addColorStop(0.75, '#030509');
    grad.addColorStop(1, '#020305');
    c.fillStyle = grad;
    c.fillRect(0, 0, 1024, 512);
    // nebulae (bluish, one faint violet)
    const neb = (x, y, r, col, a) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col.replace('$A', a));
      g.addColorStop(1, col.replace('$A', '0'));
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    };
    neb(260, 110, 190, 'rgba(77,166,255,$A)', '0.10');
    neb(700, 80, 240, 'rgba(0,198,255,$A)', '0.07');
    neb(880, 170, 150, 'rgba(123,31,162,$A)', '0.06');
    neb(480, 60, 120, 'rgba(140,200,255,$A)', '0.08');
    // star field
    for (let i = 0; i < 460; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 340;
      const s = Math.random();
      c.fillStyle = s > 0.92 ? 'rgba(160,225,255,0.95)' : `rgba(235,244,255,${0.25 + Math.random() * 0.65})`;
      const r = s > 0.95 ? 2.2 : s > 0.8 ? 1.5 : 1;
      c.fillRect(x, y, r, r);
    }
    tex.update();
    const skyMat = new StandardMaterial('skyMat', scene);
    skyMat.emissiveTexture = tex;
    skyMat.diffuseColor = Color3.Black();
    skyMat.disableLighting = true;
    skyMat.backFaceCulling = false;
    skyMat.specularColor = Color3.Black();
    sky.material = skyMat;

    // distant ringed planet beyond the fortress
    const planet = MeshBuilder.CreateSphere('planet', { diameter: 36, segments: 20 }, scene);
    planet.position.set(150, 98, -95);
    planet.applyFog = false;
    const pMat = new StandardMaterial('planetMat', scene);
    pMat.diffuseColor = Color3.Black();
    pMat.emissiveColor = new Color3(0.05, 0.1, 0.2);
    pMat.disableLighting = true;
    planet.material = pMat;
    const ringP = MeshBuilder.CreateTorus('planetRing', { diameter: 54, tube: 1.0, tessellation: 48 }, scene);
    ringP.position.copyFrom(planet.position);
    ringP.rotation.x = 1.25;
    ringP.rotation.z = 0.2;
    ringP.applyFog = false;
    const rpMat = this._emissiveMat('planetRingM', ICE, 0.32);
    rpMat.alpha = 0.22;
    ringP.material = rpMat;

    // capital ships in orbit: allied cruiser (cyan drives) & enemy dreadnought (red)
    this._buildShip(-150, 92, -70, 0.7, CYAN, 'cruiser');
    this._buildShip(118, 76, 82, -0.55, RED, 'dreadnought');
  }

  /* distant capital-ship silhouette with glowing drives */
  _buildShip(x, y, z, rotY, glowColor, name) {
    const scene = this.scene;
    const ship = new TransformNode(`ship-${name}`, scene);
    ship.position.set(x, y, z);
    ship.rotation.y = rotY;
    const hullMat = new StandardMaterial(`hull-${name}`, scene);
    hullMat.diffuseColor = new Color3(0.028, 0.032, 0.045);
    hullMat.emissiveColor = new Color3(0.012, 0.016, 0.028);
    hullMat.disableLighting = true;
    const hull = MeshBuilder.CreateBox(`hullM-${name}`, { width: 34, height: 5, depth: 9 }, scene);
    hull.material = hullMat;
    hull.parent = ship;
    const bridge = MeshBuilder.CreateBox(`bridge-${name}`, { width: 12, height: 4, depth: 5 }, scene);
    bridge.position.set(-4, 4, 0);
    bridge.material = hullMat;
    bridge.parent = ship;
    const prow = MeshBuilder.CreateBox(`prow-${name}`, { width: 10, height: 3, depth: 5 }, scene);
    prow.position.set(19, -0.5, 0);
    prow.rotation.y = 0;
    prow.material = hullMat;
    prow.parent = ship;
    // engine drives
    [-3, 0, 3].forEach((dz, i) => {
      const eng = MeshBuilder.CreateBox(`eng-${name}${i}`, { width: 0.6, height: 1.6, depth: 1.6 }, scene);
      eng.position.set(-17.4, 0, dz);
      const em = this._emissiveMat(`engM-${name}${i}`, glowColor, 1.6);
      eng.material = em;
      eng.parent = ship;
      this._blinkers.push({ mat: em, base: glowColor.clone(), speed: 2 + i * 0.4, phase: i });
    });
    ship.getChildMeshes().forEach((m) => { m.applyFog = false; });
    this.floaters.push({ mesh: ship, baseY: y, amp: 1.1, speed: 0.25, phase: x, parent: null });
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
    const span = 58;

    // continuous neon edges between corridors (core line + soft underglow)
    const edgeAt = (z, i, intensity, alpha) => {
      const line = MeshBuilder.CreateBox(`laneLine${i}`, { width: span, height: 0.045, depth: 0.14 }, scene);
      line.position.set(0, 0.025, z);
      const m = this._emissiveMat(`laneLineM${i}`, CYAN, intensity);
      m.alpha = alpha;
      line.material = m;
      line.parent = laneRoot;
      const glow = MeshBuilder.CreateBox(`laneGlow${i}`, { width: span, height: 0.02, depth: 1.15 }, scene);
      glow.position.set(0, 0.012, z);
      const gm = this._emissiveMat(`laneGlowM${i}`, CYAN, 0.55);
      gm.alpha = 0.13;
      glow.material = gm;
      glow.parent = laneRoot;
    };
    for (let i = 0; i < lanes.length - 1; i++) {
      edgeAt((lanes[i].zCenter + lanes[i + 1].zCenter) / 2, i, 1.15, 0.95);
    }
    // outer field edges
    edgeAt(BATTLE.laneMin - 0.55, 'L', 0.8, 0.7);
    edgeAt(BATTLE.laneMax + 0.55, 'R', 0.8, 0.7);

    // low steel barriers between lanes (visual cover, never overhead)
    const steelMat = new StandardMaterial('barrierSteel', scene);
    steelMat.diffuseColor = STEEL.clone();
    steelMat.specularColor = new Color3(0.18, 0.22, 0.26);
    for (let i = 0; i < lanes.length - 1; i++) {
      const z = (lanes[i].zCenter + lanes[i + 1].zCenter) / 2;
      for (let x = -24; x <= 24; x += 5.6) {
        const seg = MeshBuilder.CreateBox(`bar${i}-${x}`, { width: 2.5, height: 0.52, depth: 0.3 }, scene);
        seg.position.set(x, 0.26, z);
        seg.material = steelMat;
        seg.parent = laneRoot;
        const top = MeshBuilder.CreateBox(`barT${i}-${x}`, { width: 2.5, height: 0.045, depth: 0.32 }, scene);
        top.position.set(x, 0.545, z);
        const tm = this._emissiveMat(`barTM${i}-${x}`, CYAN, 0.55);
        tm.alpha = 0.55;
        top.material = tm;
        top.parent = laneRoot;
      }
    }

    // holographic distance markers + midfield line
    [-18, -9, 9, 18].forEach((x, i) => {
      const dash = MeshBuilder.CreateBox(`distDash${i}`, { width: 0.12, height: 0.02, depth: (BATTLE.laneMax - BATTLE.laneMin) + 0.6 }, scene);
      dash.position.set(x, 0.035, 0);
      const dm = this._emissiveMat(`distM${i}`, ICE, 0.7);
      dm.alpha = 0.38;
      dash.material = dm;
      dash.parent = laneRoot;
    });
    const mid = MeshBuilder.CreateBox('midLine', { width: 0.2, height: 0.025, depth: (BATTLE.laneMax - BATTLE.laneMin) + 1.4 }, scene);
    mid.position.set(0, 0.04, 0);
    const mm = this._emissiveMat('midM', AMBER, 0.8);
    mm.alpha = 0.5;
    mid.material = mm;
    mid.parent = laneRoot;

    // ground-level gantry walkways crossing the lanes (visual cover)
    [-9, 9].forEach((x, gi) => {
      const deck = MeshBuilder.CreateBox(`gantry${gi}`, { width: 3.2, height: 0.34, depth: (BATTLE.laneMax - BATTLE.laneMin) + 3 }, scene);
      deck.position.set(x, 0.17, 0);
      deck.material = steelMat;
      deck.parent = laneRoot;
      [-1, 1].forEach((s, ri) => {
        const rail = MeshBuilder.CreateBox(`grail${gi}${ri}`, { width: 3.2, height: 0.06, depth: 0.09 }, scene);
        rail.position.set(x, 0.37, s * ((BATTLE.laneMax - BATTLE.laneMin) / 2 + 1.35));
        const rm = this._emissiveMat(`grailM${gi}${ri}`, CYAN, 0.9);
        rm.alpha = 0.75;
        rail.material = rm;
        rail.parent = laneRoot;
      });
      // grating glow seams
      for (let z = -6; z <= 6; z += 3) {
        const seam = MeshBuilder.CreateBox(`gseam${gi}-${z}`, { width: 3.2, height: 0.02, depth: 0.06 }, scene);
        seam.position.set(x, 0.35, z);
        const sm = this._emissiveMat(`gseamM${gi}-${z}`, ICE, 0.4);
        sm.alpha = 0.3;
        seam.material = sm;
        seam.parent = laneRoot;
      }
    });

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
    this._buildPlayerHub();
    this._buildAlienFortress();
  }

  /* ---- PLAYER: futuristic command hub (steel + cyan energy) ---- */
  _buildPlayerHub() {
    const scene = this.scene;
    const root = new TransformNode('base-player', scene);
    root.position.x = -33;

    const steelMat = new StandardMaterial('hubSteel', scene);
    steelMat.diffuseColor = STEEL.clone();
    steelMat.specularColor = new Color3(0.22, 0.26, 0.3);
    steelMat.specularPower = 30;
    const darkMat = new StandardMaterial('hubDark', scene);
    darkMat.diffuseColor = new Color3(0.055, 0.07, 0.09);
    darkMat.specularColor = new Color3(0.12, 0.14, 0.16);

    // chamfered platform (stacked slabs read as bevels)
    const slab = MeshBuilder.CreateBox('hubSlab', { width: 7, height: 1.1, depth: 21 }, scene);
    slab.position.y = 0.55;
    slab.material = steelMat;
    slab.parent = root;
    const deck = MeshBuilder.CreateBox('hubDeck', { width: 6.2, height: 0.28, depth: 20.2 }, scene);
    deck.position.y = 1.24;
    deck.material = darkMat;
    deck.parent = root;
    // glowing cyan perimeter strips
    [[0, 1.4, 10.15, 6.4, 0.06, 0.1], [0, 1.4, -10.15, 6.4, 0.06, 0.1], [3.15, 1.4, 0, 0.1, 0.06, 20.4], [-3.15, 1.4, 0, 0.1, 0.06, 20.4]].forEach(([x, y, z, w, h, d], i) => {
      const st = MeshBuilder.CreateBox(`hubEdge${i}`, { width: w, height: h, depth: d }, scene);
      st.position.set(x, y, z);
      st.material = this._emissiveMat(`hubEdgeM${i}`, CYAN, 1.1);
      st.parent = root;
    });

    // crystal-energy command tower
    const towerZ = -5.6;
    const glassMat = new StandardMaterial('hubGlass', scene);
    glassMat.diffuseColor = ICE.scale(0.35);
    glassMat.emissiveColor = CYAN.scale(0.22);
    glassMat.alpha = 0.5;
    glassMat.specularColor = new Color3(0.6, 0.8, 1);
    const tower = MeshBuilder.CreateCylinder('hubTower', { diameter: 2.3, height: 7.6, tessellation: 6 }, scene);
    tower.position.set(-0.4, 5.1, towerZ);
    tower.material = glassMat;
    tower.parent = root;
    const core = MeshBuilder.CreateCylinder('hubCore', { diameter: 0.85, height: 8.2, tessellation: 12 }, scene);
    core.position.set(-0.4, 5.4, towerZ);
    const coreMat = this._emissiveMat('hubCoreM', CYAN, 1.55);
    core.material = coreMat;
    core.parent = root;
    this._blinkers.push({ mat: coreMat, base: CYAN.clone(), speed: 2.6, phase: 0.4 });
    const cap = MeshBuilder.CreateSphere('hubCap', { diameter: 1.5, segments: 12 }, scene);
    cap.position.set(-0.4, 9.3, towerZ);
    cap.material = this._emissiveMat('hubCapM', ICE, 1.15);
    cap.parent = root;
    const antenna = MeshBuilder.CreateCylinder('hubAnt', { diameter: 0.12, height: 3.4 }, scene);
    antenna.position.set(-0.4, 11.2, towerZ);
    antenna.material = darkMat;
    antenna.parent = root;
    const tip = MeshBuilder.CreateSphere('hubTip', { diameter: 0.5 }, scene);
    tip.position.set(-0.4, 13, towerZ);
    const tipMat = this._emissiveMat('hubTipM', AMBER, 1.4);
    tip.material = tipMat;
    tip.parent = root;
    this._blinkers.push({ mat: tipMat, base: AMBER.clone(), speed: 3.4, phase: 1.2 });

    // secondary comms block
    const block = MeshBuilder.CreateBox('hubBlock', { width: 2.6, height: 4.4, depth: 3.4 }, scene);
    block.position.set(-0.6, 3.5, 5.8);
    block.material = steelMat;
    block.parent = root;
    const dish = MeshBuilder.CreateCylinder('hubDish', { diameter: 2.2, height: 0.12, tessellation: 20 }, scene);
    dish.position.set(-0.6, 6.1, 5.8);
    dish.rotation.x = Math.PI / 2.4;
    dish.material = this._emissiveMat('hubDishM', CYAN, 0.5);
    dish.material.alpha = 0.75;
    dish.parent = root;

    // deploy ramp toward the lanes (hazard-lit)
    const ramp = MeshBuilder.CreateBox('hubRamp', { width: 5.2, height: 0.22, depth: 5.6 }, scene);
    ramp.position.set(3.4, 0.72, 0);
    ramp.rotation.z = 0.27;
    ramp.material = steelMat;
    ramp.parent = root;
    [-2.7, 2.7].forEach((z, i) => {
      const hz = MeshBuilder.CreateBox(`hubHz${i}`, { width: 5.2, height: 0.05, depth: 0.16 }, scene);
      hz.position.set(3.4, 0.86, z);
      hz.rotation.z = 0.27;
      hz.material = this._emissiveMat(`hubHzM${i}`, AMBER, 0.9);
      hz.parent = root;
    });

    // partial translucent energy shield dome
    const shield = MeshBuilder.CreateSphere('hubShield', { diameter: 21, segments: 24 }, scene);
    shield.position.set(0, 1.1, 0);
    shield.scaling.y = 0.55;
    const shMat = this._emissiveMat('hubShieldM', CYAN, 0.4);
    shMat.alpha = 0.075;
    shield.material = shMat;
    shield.parent = root;
    const shRing = MeshBuilder.CreateTorus('hubShieldRing', { diameter: 21, tube: 0.07, tessellation: 60 }, scene);
    shRing.position.y = 1.1;
    const srMat = this._emissiveMat('hubRingM', CYAN, 0.9);
    srMat.alpha = 0.55;
    shRing.material = srMat;
    shRing.parent = root;

    // holographic BASE HUB label
    this._holoLabel(root, 'BASE HUB', new Vector3(2.2, 8.4, 1.5), CYAN, 7.4);

    this.shadowGen.addShadowCaster(slab);
    this.shadowGen.addShadowCaster(tower);
    this.shadowGen.addShadowCaster(block);
    this.bases.player = { root, sign: -1 };
  }

  /* ---- ENEMY: hostile alien monolith (carbon + purple/red core) ---- */
  _buildAlienFortress() {
    const scene = this.scene;
    const root = new TransformNode('base-enemy', scene);
    root.position.x = 33;

    const carbonMat = new StandardMaterial('fortCarbon', scene);
    carbonMat.diffuseColor = CARBON.clone();
    carbonMat.specularColor = new Color3(0.16, 0.1, 0.2);
    carbonMat.specularPower = 18;
    const plateMat = new StandardMaterial('fortPlate', scene);
    plateMat.diffuseColor = new Color3(0.09, 0.06, 0.08);
    plateMat.specularColor = new Color3(0.2, 0.1, 0.16);

    // base mound + angular monolith stack
    const mound = MeshBuilder.CreateBox('fortMound', { width: 8, height: 2.2, depth: 23 }, scene);
    mound.position.y = 1.1;
    mound.material = carbonMat;
    mound.parent = root;
    const mono1 = MeshBuilder.CreateBox('fortMono1', { width: 5.2, height: 12.5, depth: 9.5 }, scene);
    mono1.position.set(-0.4, 8.4, 0);
    mono1.rotation.y = 0.16;
    mono1.material = carbonMat;
    mono1.parent = root;
    const mono2 = MeshBuilder.CreateBox('fortMono2', { width: 3.4, height: 6.6, depth: 6 }, scene);
    mono2.position.set(-0.8, 17.6, 0);
    mono2.rotation.y = -0.28;
    mono2.material = plateMat;
    mono2.parent = root;
    [[-6.6, 0.3], [6.6, -0.34]].forEach(([z, ry], i) => {
      const wing = MeshBuilder.CreateBox(`fortWing${i}`, { width: 2.6, height: 8.4, depth: 4.4 }, scene);
      wing.position.set(0.2, 6.2, z);
      wing.rotation.y = ry;
      wing.material = plateMat;
      wing.parent = root;
      this.shadowGen.addShadowCaster(wing);
    });

    // exposed violet energy core (front face, facing the lanes)
    const core = MeshBuilder.CreateBox('fortCore', { width: 1.5, height: 6.4, depth: 1.5 }, scene);
    core.position.set(-3.1, 8.6, 0);
    core.rotation.y = 0.16;
    const coreMat = this._emissiveMat('fortCoreM', PURPLE, 1.7);
    core.material = coreMat;
    core.parent = root;
    this._blinkers.push({ mat: coreMat, base: PURPLE.clone(), speed: 2.1, phase: 0 });
    const coreGlow = MeshBuilder.CreateSphere('fortCoreGlow', { diameter: 3.1, segments: 14 }, scene);
    coreGlow.position.set(-3.1, 8.6, 0);
    const cgMat = this._emissiveMat('fortGlowM', PURPLE, 0.9);
    cgMat.alpha = 0.3;
    coreGlow.material = cgMat;
    coreGlow.parent = root;

    // magma vents between armor plates (front face)
    [[4.4, 7.8], [9.4, 7.8], [14.4, 5.4]].forEach(([y, d], i) => {
      const vent = MeshBuilder.CreateBox(`fortVent${i}`, { width: 0.14, height: 0.5, depth: d }, scene);
      vent.position.set(-2.95, y, 0);
      const vm = this._emissiveMat(`fortVentM${i}`, MAGMA, 1.25);
      vm.alpha = 0.9;
      vent.material = vm;
      vent.parent = root;
      this._blinkers.push({ mat: vm, base: MAGMA.clone(), speed: 1.5 + i * 0.3, phase: i * 1.7 });
    });

    // red warning light rows
    for (let i = 0; i < 6; i++) {
      const lamp = MeshBuilder.CreateSphere(`fortLamp${i}`, { diameter: 0.34 }, scene);
      lamp.position.set(-2.75, 3.4 + i * 2.6, (i % 2 ? 1 : -1) * (2.4 + (i % 3)));
      const lm = this._emissiveMat(`fortLampM${i}`, RED, 1.5);
      lamp.material = lm;
      lamp.parent = root;
      this._blinkers.push({ mat: lm, base: RED.clone(), speed: 3.6, phase: i * 1.1 });
    }

    // anti-orbital turrets on the crown
    [-2.4, 2.4].forEach((z, i) => {
      const tb = MeshBuilder.CreateCylinder(`fortTurret${i}`, { diameter: 1.3, height: 1.1, tessellation: 10 }, scene);
      tb.position.set(-0.4, 21.4, z * 0.7);
      tb.material = carbonMat;
      tb.parent = root;
      const bar = MeshBuilder.CreateCylinder(`fortTBar${i}`, { diameter: 0.2, height: 2.6 }, scene);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(-1.5, 21.7, z * 0.7);
      bar.material = plateMat;
      bar.parent = root;
      const tl = MeshBuilder.CreateSphere(`fortTLamp${i}`, { diameter: 0.3 }, scene);
      tl.position.set(-0.4, 22.15, z * 0.7);
      const tlm = this._emissiveMat(`fortTLM${i}`, RED, 1.6);
      tl.material = tlm;
      tl.parent = root;
      this._blinkers.push({ mat: tlm, base: RED.clone(), speed: 4.2, phase: i * 2.2 });
    });

    // reddish defensive shield
    const shield = MeshBuilder.CreateSphere('fortShield', { diameter: 25, segments: 24 }, scene);
    shield.position.y = 1.4;
    shield.scaling.y = 0.62;
    const shMat = this._emissiveMat('fortShieldM', new Color3(0.75, 0.12, 0.4), 0.45);
    shMat.alpha = 0.065;
    shield.material = shMat;
    shield.parent = root;

    // small dart ships circling the battlements
    [-1, 1].forEach((dir, i) => {
      const ship = new TransformNode(`dartShip${i}`, scene);
      ship.position.set(-4.5, 13.5 + i * 2.4, dir * 7.5);
      ship.parent = root;
      const hull = MeshBuilder.CreateBox(`dartHull${i}`, { width: 1.7, height: 0.34, depth: 0.8 }, scene);
      hull.material = carbonMat;
      hull.parent = ship;
      const eng = MeshBuilder.CreateBox(`dartEng${i}`, { width: 0.2, height: 0.2, depth: 0.5 }, scene);
      eng.position.x = 0.95;
      eng.material = this._emissiveMat(`dartEngM${i}`, RED, 1.7);
      eng.parent = ship;
      this.floaters.push({ mesh: ship, baseY: ship.position.y, amp: 0.55, speed: 1.4 + i * 0.5, phase: i * 2.4, parent: root });
    });

    // holo threat label
    this._holoLabel(root, 'XENO STRONGHOLD', new Vector3(-2.4, 24.6, 0), RED, 8.6);

    this.shadowGen.addShadowCaster(mound);
    this.shadowGen.addShadowCaster(mono1);
    this.shadowGen.addShadowCaster(mono2);
    this.bases.enemy = { root, sign: 1 };
  }

  /* floating holographic text label (military monospace) */
  _holoLabel(parent, text, pos, color, width) {
    const scene = this.scene;
    const tex = new DynamicTexture(`holoTex${text.replace(/\s/g, '')}`, { width: 512, height: 96 }, scene, false);
    tex.hasAlpha = true;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 512, 96);
    ctx.font = '700 54px "Share Tech Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const css = `rgb(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)})`;
    ctx.shadowColor = css;
    ctx.shadowBlur = 22;
    ctx.fillStyle = css;
    ctx.fillText(text, 256, 50);
    ctx.shadowBlur = 0;
    ctx.fillText(text, 256, 50);
    tex.update();
    const mat = new StandardMaterial(`holoMat${text.replace(/\s/g, '')}`, scene);
    mat.emissiveTexture = tex;
    mat.diffuseColor = Color3.Black();
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.useAlphaFromDiffuseTexture = false;
    mat.backFaceCulling = false;
    mat.disableLighting = true;
    const plane = MeshBuilder.CreatePlane(`holoPlane${text.replace(/\s/g, '')}`, { width, height: width * (96 / 512) }, scene);
    plane.position.copyFrom(pos);
    plane.rotation.y = Math.PI / 2;
    plane.material = mat;
    plane.parent = parent;
    this.floaters.push({ mesh: plane, baseY: pos.y, amp: 0.16, speed: 1.1, phase: pos.z, parent });
    return plane;
  }

  /* reddish smoke column over the alien fortress */
  _buildEnemySmoke() {
    if (!this.softTex) return;
    const smoke = new ParticleSystem('enemySmoke', 120, this.scene);
    smoke.particleTexture = this.softTex;
    smoke.emitter = new Vector3(33, 9, 0);
    smoke.minEmitBox = new Vector3(-2.5, 0, -2.5);
    smoke.maxEmitBox = new Vector3(2.5, 6, 2.5);
    smoke.direction1 = new Vector3(-0.12, 0.5, -0.1);
    smoke.direction2 = new Vector3(0.12, 0.9, 0.1);
    smoke.minEmitPower = 0.25;
    smoke.maxEmitPower = 0.6;
    smoke.minLifeTime = 3.2;
    smoke.maxLifeTime = 5.5;
    smoke.minSize = 1.1;
    smoke.maxSize = 2.6;
    smoke.color1 = new Color4(0.32, 0.08, 0.07, 0.16);
    smoke.color2 = new Color4(0.12, 0.04, 0.05, 0.0);
    smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    smoke.emitRate = 9;
    smoke.start();
    this.smoke = smoke;
    this.smokeRunning = true;
  }

  _buildProps() {
    this.props = new TransformNode('props', this.scene);
    const crateMat = new StandardMaterial('crate', this.scene);
    crateMat.diffuseColor = STEEL.clone();
    crateMat.specularColor = new Color3(0.1, 0.12, 0.14);
    const crateMatE = new StandardMaterial('crateE', this.scene);
    crateMatE.diffuseColor = new Color3(0.07, 0.06, 0.05);
    crateMatE.specularColor = new Color3(0.06, 0.05, 0.04);

    [[-14, -8, 1.6], [-11.5, -7, 1.1], [-13, -5.5, 0.9], [12, 9, 1.4], [14.5, 8, 1], [10, 10.4, 0.8], [-4, 12, 1.2], [6, -12, 1.5]].forEach(([x, z, s], i) => {
      const c = MeshBuilder.CreateBox(`crate${i}`, { size: s }, this.scene);
      c.position.set(x, s / 2, z);
      c.rotation.y = Math.random() * 0.9;
      c.material = i % 2 ? crateMatE : crateMat;
      c.parent = this.props;
      this.shadowGen.addShadowCaster(c);
      // cyan supply marking on player-side crates
      if (x < 0 && i % 2 === 0) {
        const mark = MeshBuilder.CreateBox(`crateMark${i}`, { width: s * 1.02, height: s * 0.14, depth: s * 1.02 }, this.scene);
        mark.position.set(x, s * 0.72, z);
        mark.rotation.y = c.rotation.y;
        const mm = this._emissiveMat(`crateMarkM${i}`, i % 4 ? CYAN : AMBER, 0.5);
        mm.alpha = 0.5;
        mark.material = mm;
        mark.parent = this.props;
      }
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
    const scene = this.scene;
    const root = new TransformNode(`u-${def.id}-${Math.random().toString(36).slice(2, 7)}`, scene);
    root.position.set(x, 0, z);
    root.rotation.y = side === 'player' ? Math.PI / 2 : -Math.PI / 2;

    if (!this._bodyMats) {
      const mp = new StandardMaterial('bodyP', scene);   // human tactical steel-blue
      mp.diffuseColor = new Color3(0.1, 0.14, 0.19);
      mp.specularColor = new Color3(0.2, 0.26, 0.32);
      mp.specularPower = 26;
      const mpDark = new StandardMaterial('bodyPD', scene);
      mpDark.diffuseColor = new Color3(0.05, 0.07, 0.1);
      mpDark.specularColor = new Color3(0.1, 0.12, 0.15);
      const me = new StandardMaterial('bodyE', scene);   // alien bio-metal carbon
      me.diffuseColor = new Color3(0.05, 0.045, 0.06);
      me.specularColor = new Color3(0.22, 0.1, 0.24);
      me.specularPower = 20;
      const meDark = new StandardMaterial('bodyED', scene);
      meDark.diffuseColor = new Color3(0.09, 0.05, 0.06);
      meDark.specularColor = new Color3(0.16, 0.08, 0.1);
      this._bodyMats = { player: mp, playerDark: mpDark, enemy: me, enemyDark: meDark };
    }
    const bodyMat = this._bodyMats[side];
    const darkMat = this._bodyMats[side === 'player' ? 'playerDark' : 'enemyDark'];
    const accent = side === 'player' ? CYAN : RED;
    const alien = side === 'enemy';

    let barY = 2.3 * s;
    let stripeMat = null;
    let mainMesh = null;

    if (def.id === 'tank') {
      /* armored tank: tracks + hull + turret + barrel */
      [-0.72, 0.72].forEach((ox, i) => {
        const track = MeshBuilder.CreateBox(`trk${i}`, { width: 0.44 * s, height: 0.5 * s, depth: 2.5 * s }, scene);
        track.position.set(ox * s, 0.25 * s, 0);
        track.material = darkMat;
        track.parent = root;
      });
      const hull = MeshBuilder.CreateBox('hull', { width: 1.5 * s, height: 0.62 * s, depth: 2.5 * s }, scene);
      hull.position.y = 0.72 * s;
      hull.material = bodyMat;
      hull.parent = root;
      mainMesh = hull;
      const turret = MeshBuilder.CreateBox('turret', { width: 1.0 * s, height: 0.5 * s, depth: 1.3 * s }, scene);
      turret.position.y = 1.28 * s;
      turret.material = bodyMat;
      turret.parent = root;
      const slit = MeshBuilder.CreateBox('slit', { width: 0.7 * s, height: 0.1 * s, depth: 0.06 }, scene);
      slit.position.set(0, 1.3 * s, 0.66 * s);
      stripeMat = this._emissiveMat(`stripeM${root.uniqueId}`, accent, 1.2);
      slit.material = stripeMat;
      slit.parent = root;
      const barrel = MeshBuilder.CreateCylinder('barrel', { diameter: 0.15 * s, height: 1.7 * s }, scene);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 1.3 * s, 1.4 * s);
      barrel.material = darkMat;
      barrel.parent = root;
      this.shadowGen.addShadowCaster(hull);
      this.shadowGen.addShadowCaster(turret);
      barY = 2.15 * s;
    } else if (def.id === 'artillery') {
      /* artillery: chassis + cab + elevated long barrel */
      const chassis = MeshBuilder.CreateBox('chassis', { width: 1.4 * s, height: 0.5 * s, depth: 2.4 * s }, scene);
      chassis.position.y = 0.45 * s;
      chassis.material = bodyMat;
      chassis.parent = root;
      mainMesh = chassis;
      const cab = MeshBuilder.CreateBox('cab', { width: 1.2 * s, height: 0.62 * s, depth: 0.9 * s }, scene);
      cab.position.set(0, 1.0 * s, -0.65 * s);
      cab.material = darkMat;
      cab.parent = root;
      const stripe = MeshBuilder.CreateBox('stripe', { width: 1.24 * s, height: 0.1 * s, depth: 0.94 * s }, scene);
      stripe.position.set(0, 1.34 * s, -0.65 * s);
      stripeMat = this._emissiveMat(`stripeM${root.uniqueId}`, accent, 0.9);
      stripe.material = stripeMat;
      stripe.parent = root;
      const barrel = MeshBuilder.CreateCylinder('barrel', { diameter: 0.17 * s, height: 2.3 * s }, scene);
      barrel.rotation.x = Math.PI / 2 - 0.52;
      barrel.position.set(0, 1.35 * s, 0.75 * s);
      barrel.material = darkMat;
      barrel.parent = root;
      const brace = MeshBuilder.CreateBox('brace', { width: 0.5 * s, height: 0.5 * s, depth: 0.4 * s }, scene);
      brace.position.set(0, 0.95 * s, 0.3 * s);
      brace.material = bodyMat;
      brace.parent = root;
      this.shadowGen.addShadowCaster(chassis);
      this.shadowGen.addShadowCaster(cab);
      barY = 2.3 * s;
    } else {
      /* infantry: legs + torso + shoulders + helmet with visor + weapon */
      const heavy = def.id === 'gunner' || def.id === 'heavy';
      const legs = MeshBuilder.CreateBox('legs', { width: 0.52 * s, height: 0.55 * s, depth: 0.42 * s }, scene);
      legs.position.y = 0.28 * s;
      legs.material = darkMat;
      legs.parent = root;
      const torso = MeshBuilder.CreateBox('torso', { width: (heavy ? 0.86 : 0.72) * s, height: 0.68 * s, depth: 0.46 * s }, scene);
      torso.position.y = 0.9 * s;
      torso.material = bodyMat;
      torso.parent = root;
      mainMesh = torso;
      const shoulders = MeshBuilder.CreateBox('shoulders', { width: (heavy ? 1.05 : 0.92) * s, height: 0.2 * s, depth: 0.52 * s }, scene);
      shoulders.position.y = 1.3 * s;
      shoulders.material = bodyMat;
      shoulders.parent = root;
      const helmet = MeshBuilder.CreateBox('helmet', { width: 0.44 * s, height: 0.4 * s, depth: 0.46 * s }, scene);
      helmet.position.y = 1.62 * s;
      helmet.material = darkMat;
      helmet.parent = root;
      const visor = MeshBuilder.CreateBox('visor', { width: 0.46 * s, height: 0.1 * s, depth: 0.06 }, scene);
      visor.position.set(0, 1.64 * s, 0.24 * s);
      const visorMat = this._emissiveMat(`visorM${root.uniqueId}`, alien ? RED : CYAN, 1.5);
      visor.material = visorMat;
      visor.parent = root;
      // chest stripe (upgrade feedback + faction accent)
      const stripe = MeshBuilder.CreateBox('stripe', { width: (heavy ? 0.9 : 0.76) * s, height: 0.09 * s, depth: 0.48 * s }, scene);
      stripe.position.y = 1.12 * s;
      stripeMat = this._emissiveMat(`stripeM${root.uniqueId}`, accent, 0.75);
      stripe.material = stripeMat;
      stripe.parent = root;
      // weapon facing +z (advance direction)
      const gun = MeshBuilder.CreateCylinder('gun', { diameter: (heavy ? 0.16 : 0.09) * s, height: (heavy ? 1.15 : 0.95) * s }, scene);
      gun.rotation.x = Math.PI / 2;
      gun.position.set(0.24 * s, 1.0 * s, 0.62 * s);
      gun.material = darkMat;
      gun.parent = root;
      if (alien) {
        // non-human anatomy: dorsal spikes with violet bio-lights
        [-0.16, 0.16].forEach((ox, i) => {
          const spike = MeshBuilder.CreateCylinder(`spk${i}`, { diameterTop: 0, diameterBottom: 0.14 * s, height: 0.6 * s, tessellation: 5 }, scene);
          spike.position.set(ox * s, 1.5 * s + i * 0.18, -0.3 * s);
          spike.rotation.x = -0.5;
          spike.material = bodyMat;
          spike.parent = root;
        });
        const node = MeshBuilder.CreateSphere('bnode', { diameter: 0.16 * s }, scene);
        node.position.set(0, 1.86 * s, -0.34 * s);
        const nm = this._emissiveMat(`bnodeM${root.uniqueId}`, PURPLE, 1.6);
        node.material = nm;
        node.parent = root;
        this._blinkers.push({ mat: nm, base: PURPLE.clone(), speed: 3.2, phase: Math.random() * 4 });
      } else if (heavy) {
        const pack = MeshBuilder.CreateBox('pack', { width: 0.6 * s, height: 0.5 * s, depth: 0.3 * s }, scene);
        pack.position.set(0, 1.05 * s, -0.36 * s);
        pack.material = darkMat;
        pack.parent = root;
      }

      /* ---- class-specific equipment (full roster) ---- */
      if (def.id === 'heavy') {
        // front riot shield with emissive plate
        const shield = MeshBuilder.CreateBox('shield', { width: 0.95 * s, height: 1.05 * s, depth: 0.12 }, scene);
        shield.position.set(0, 0.88 * s, 0.42 * s);
        shield.material = bodyMat;
        shield.parent = root;
        const plate = MeshBuilder.CreateBox('splate', { width: 0.6 * s, height: 0.42 * s, depth: 0.04 }, scene);
        plate.position.set(0, 0.98 * s, 0.5 * s);
        plate.material = this._emissiveMat(`splateM${root.uniqueId}`, accent, 0.55);
        plate.parent = root;
        this.shadowGen.addShadowCaster(shield);
      } else if (def.id === 'sniper') {
        // long rifle: extended barrel + scope with glowing lens
        gun.scaling.y = 2.1;
        gun.position.z = 0.85 * s;
        const scope = MeshBuilder.CreateCylinder('scope', { diameter: 0.11 * s, height: 0.44 * s }, scene);
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0.24 * s, 1.16 * s, 0.72 * s);
        scope.material = darkMat;
        scope.parent = root;
        const lens = MeshBuilder.CreateSphere('lens', { diameter: 0.1 * s }, scene);
        lens.position.set(0.24 * s, 1.16 * s, 0.96 * s);
        lens.material = this._emissiveMat(`lensM${root.uniqueId}`, accent, 1.5);
        lens.parent = root;
      } else if (def.id === 'rpg') {
        // shoulder launcher tube with rear blast cone
        const tube = MeshBuilder.CreateCylinder('tube', { diameter: 0.26 * s, height: 1.35 * s }, scene);
        tube.rotation.x = Math.PI / 2 - 0.12;
        tube.position.set(-0.22 * s, 1.44 * s, 0.32 * s);
        tube.material = darkMat;
        tube.parent = root;
        const cone = MeshBuilder.CreateCylinder('tcone', { diameterTop: 0.36 * s, diameterBottom: 0.24 * s, height: 0.26 * s }, scene);
        cone.rotation.x = Math.PI / 2 - 0.12;
        cone.position.set(-0.22 * s, 1.36 * s, -0.42 * s);
        cone.material = bodyMat;
        cone.parent = root;
        const sight = MeshBuilder.CreateSphere('tsight', { diameter: 0.09 * s }, scene);
        sight.position.set(-0.22 * s, 1.62 * s, 0.6 * s);
        sight.material = this._emissiveMat(`tsightM${root.uniqueId}`, MAGMA, 1.4);
        sight.parent = root;
      } else if (def.id === 'grenadier') {
        // stub launcher angled up + drum magazine
        gun.rotation.x = Math.PI / 2 - 0.42;
        gun.scaling.y = 0.85;
        gun.position.set(0.24 * s, 1.12 * s, 0.5 * s);
        const drum = MeshBuilder.CreateCylinder('drum', { diameter: 0.3 * s, height: 0.26 * s }, scene);
        drum.position.set(0.24 * s, 0.98 * s, 0.42 * s);
        drum.material = bodyMat;
        drum.parent = root;
      } else if (def.id === 'flamethrower') {
        // twin fuel tanks on the back + pilot flame at the wide nozzle
        gun.scaling.x = 1.8;
        gun.scaling.z = 1.8;
        [-0.26, 0.06].forEach((ox, i) => {
          const ftank = MeshBuilder.CreateCylinder(`ftank${i}`, { diameter: 0.26 * s, height: 0.85 * s }, scene);
          ftank.position.set(ox * s, 1.05 * s, -0.38 * s);
          ftank.material = bodyMat;
          ftank.parent = root;
        });
        const pilot = MeshBuilder.CreateSphere('pilot', { diameter: 0.17 * s }, scene);
        pilot.position.set(0.24 * s, 1.0 * s, 1.12 * s);
        const pilotMat = this._emissiveMat(`pilotM${root.uniqueId}`, MAGMA, 1.9);
        pilot.material = pilotMat;
        pilot.parent = root;
        this._blinkers.push({ mat: pilotMat, base: MAGMA.clone(), speed: 7, phase: Math.random() * 3 });
      }
      this.shadowGen.addShadowCaster(torso);
      barY = 2.25 * s;
    }

    // hp bar
    const hpBg = MeshBuilder.CreateBox('hpbg', { width: 1.7, height: 0.13, depth: 0.05 }, scene);
    hpBg.position.set(0, barY, 0);
    const bgMat = new StandardMaterial('hpbgM', scene);
    bgMat.diffuseColor = new Color3(0.02, 0.03, 0.05);
    bgMat.emissiveColor = new Color3(0.03, 0.05, 0.08);
    hpBg.material = bgMat;
    hpBg.parent = root;

    const hpFg = MeshBuilder.CreateBox('hpfg', { width: 1.7, height: 0.13, depth: 0.07 }, scene);
    hpFg.position.set(0, barY, -0.012);
    const fgMat = this._emissiveMat(`hpM${root.uniqueId}`, HP_GREEN, 0.9);
    hpFg.material = fgMat;
    hpFg.parent = root;

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

  /** Kicks a unit's rig backward (fire recoil). */
  recoilUnit(handle) { if (handle) handle.recoil = 1; }

  /** Flashes a unit's scale (hit reaction). */
  hitUnit(handle) { if (handle) handle.hitT = 0.12; }

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
    const color = hue === 'red' ? RED : hue === 'cyan' ? CYAN : hue === 'violet' ? PURPLE : AMBER;

    // white-hot flash core
    const flash = MeshBuilder.CreateSphere('expFlash', { diameter: 1 }, this.scene);
    flash.position.set(pos.x, pos.y + 0.2, pos.z);
    flash.material = this._emissiveMat(`expFM${flash.uniqueId}`, new Color3(1, 0.97, 0.9), 2.2);
    this.fx.push({ kind: 'grow', mesh: flash, age: 0, ttl: 0.12, from: 0.2, to: 1.5 * power });

    const core = MeshBuilder.CreateSphere('expCore', { diameter: 1 }, this.scene);
    core.position.copyFrom(pos);
    core.material = this._emissiveMat(`expM${core.uniqueId}`, color, 1.5);
    this.fx.push({ kind: 'grow', mesh: core, age: 0, ttl: 0.3, from: 0.3, to: 2.6 * power });

    // magma fire ring (Visual Bible: explosions with rings of fire)
    const fire = MeshBuilder.CreateTorus('expFire', { diameter: 1, tube: 0.16, tessellation: 36 }, this.scene);
    fire.position.set(pos.x, 0.3, pos.z);
    fire.material = this._emissiveMat(`expFiM${fire.uniqueId}`, MAGMA, 1.7);
    this.fx.push({ kind: 'growFlat', mesh: fire, age: 0, ttl: 0.3, from: 0.4, to: 2.9 * power });

    const ring = MeshBuilder.CreateTorus('expRing', { diameter: 1, tube: 0.055, tessellation: 40 }, this.scene);
    ring.position.set(pos.x, 0.16, pos.z);
    ring.material = this._emissiveMat(`expRM${ring.uniqueId}`, hue === 'cyan' ? CYAN : AMBER, 1.1);
    this.fx.push({ kind: 'growFlat', mesh: ring, age: 0, ttl: 0.42, from: 0.6, to: 3.6 * power });

    this.smokePuff({ x: pos.x, y: pos.y + 0.4, z: pos.z });

    if (this.particlesOn && this.goreLevel !== 'NONE') {
      const goreMult = this.goreLevel === 'EXTREME' ? 1.8 : 1;
      const n = Math.min(14, Math.round((4 + power * 2) * goreMult));
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
      // EXTREME gore: red bio-splatter shards
      if (this.goreLevel === 'EXTREME') {
        for (let g = 0; g < 5; g++) {
          const sp = MeshBuilder.CreateBox('splat', { size: 0.13 + Math.random() * 0.1 }, this.scene);
          sp.position.set(pos.x, pos.y + 0.4, pos.z);
          sp.material = this._emissiveMat(`splatM${sp.uniqueId}`, RED, 0.9);
          this.fx.push({
            kind: 'debris', mesh: sp, age: 0, ttl: 0.55,
            vel: new Vector3((Math.random() - 0.5) * 8, 2 + Math.random() * 4, (Math.random() - 0.5) * 8),
            spin: new Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10)
          });
        }
      }
    }

    // dynamic explosion light (independent of gore level)
    if (this.particlesOn) {
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
    // white-cyan orbital lance (Visual Bible spec)
    const beam = MeshBuilder.CreateCylinder('beam', { diameter: 3.4, height: 34, tessellation: 20 }, this.scene);
    beam.position.set(pos.x, 17, pos.z);
    const bm = this._emissiveMat(`beamM${beam.uniqueId}`, new Color3(0.62, 0.95, 1.0), 1.6);
    bm.alpha = 0.26;
    beam.material = bm;
    this.fx.push({ kind: 'beam', mesh: beam, age: 0, ttl: 0.5 });
    const beamCore = MeshBuilder.CreateCylinder('beamCore', { diameter: 1.1, height: 34, tessellation: 14 }, this.scene);
    beamCore.position.set(pos.x, 17, pos.z);
    const bcm = this._emissiveMat(`beamCM${beamCore.uniqueId}`, new Color3(0.9, 1, 1), 2.0);
    bcm.alpha = 0.5;
    beamCore.material = bcm;
    this.fx.push({ kind: 'beam', mesh: beamCore, age: 0, ttl: 0.4 });

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

  /** Impact FX level: NONE | NORMAL | EXTREME (gore/debris density). */
  setGore(level) {
    this.goreLevel = ['NONE', 'NORMAL', 'EXTREME'].includes(level) ? level : 'NORMAL';
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
   * @param {string} [hue] optional per-class tracer color name
   */
  projectileMesh(kind, side, hue = null) {
    const hueMap = {
      cyan: CYAN, ice: ICE, amber: AMBER, red: RED, magma: MAGMA, violet: PURPLE, green: HP_GREEN
    };
    const accent = (hue && hueMap[hue]) ? hueMap[hue] : (side === 'player' ? CYAN : RED);
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

  /**
   * Expanding shockwave ring on the ground (boss attacks, big impacts).
   * @param {{x,z}} pos @param {object} color Color3 @param {number} power
   */
  shockwave(pos, color = RED, power = 1) {
    const ring = MeshBuilder.CreateTorus('shock', { diameter: 1, tube: 0.12, tessellation: 48 }, this.scene);
    ring.position.set(pos.x, 0.1, pos.z);
    ring.material = this._emissiveMat(`shockM${ring.uniqueId}`, color, 1.6);
    this.fx.push({ kind: 'growFlat', mesh: ring, age: 0, ttl: 0.5, from: 0.8, to: 7 * power });
    const flash = MeshBuilder.CreateSphere('shockF', { diameter: 1 }, this.scene);
    flash.position.set(pos.x, 0.4, pos.z);
    flash.material = this._emissiveMat(`shockFM${flash.uniqueId}`, color, 2);
    this.fx.push({ kind: 'grow', mesh: flash, age: 0, ttl: 0.25, from: 0.3, to: 2.4 * power });
  }

  /** Purple shockwave reserved for the boss. */
  bossShockwave(pos, power = 1) {
    this.shockwave(pos, PURPLE, power);
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
    if (this.smoke) {
      if (cfg.particles && !this.smokeRunning) { this.smoke.start(); this.smokeRunning = true; }
      if (!cfg.particles && this.smokeRunning) { this.smoke.stop(); this.smokeRunning = false; }
    }
    if (cfg.gore) this.setGore(cfg.gore);
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

    // unit movement interpolation + procedural animation (march, recoil, hit)
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      const p = u.root.position;
      const kk = 1 - Math.exp(-(u.lerp || 9) * dt);
      p.x += (u.tx - p.x) * kk;
      p.z += (u.tz - p.z) * kk;

      const isInfantry = u.def && u.def.size <= 1.3;
      const dist = Math.hypot(u.tx - p.x, u.tz - p.z);
      const moving = dist > 0.12;

      if (u.phase === undefined) u.phase = Math.random() * Math.PI * 2;
      if (u.recoil === undefined) u.recoil = 0;
      if (u.hitT === undefined) u.hitT = 0;

      // marching bob for infantry
      if (isInfantry) {
        const bobAmp = moving ? 0.075 * (u.def.size || 1) : 0.022 * (u.def.size || 1);
        const bobSpeed = moving ? 11 : 2.2;
        u._bob = (u._bob || 0) + dt * bobSpeed;
        p.y = Math.abs(Math.sin(u._bob + u.phase)) * bobAmp;
        u.root.rotation.x = moving ? 0.06 : Math.sin(u._bob * 0.4 + u.phase) * 0.015;
      }

      // fire recoil — kicks the rig backward then recovers
      if (u.recoil > 0) {
        u.recoil = Math.max(0, u.recoil - dt * 5);
        u.root.position.z -= 0; // visual kick applied to child via scale below
        const k = u.recoil;
        u.root.scaling.z = 1 - k * 0.08;
        u.root.scaling.x = 1 + k * 0.05;
      } else if (u.root.scaling.z !== 1) {
        u.root.scaling.z += (1 - u.root.scaling.z) * Math.min(1, dt * 12);
        u.root.scaling.x += (1 - u.root.scaling.x) * Math.min(1, dt * 12);
      }

      // hit reaction — quick scale flash
      if (u.hitT > 0) {
        u.hitT = Math.max(0, u.hitT - dt);
        const s = 1 + u.hitT * 0.35;
        u.root.scaling.y = s;
      } else if (u.root.scaling.y !== 1) {
        u.root.scaling.y += (1 - u.root.scaling.y) * Math.min(1, dt * 14);
      }
    }

    // deploy arrow pulse
    if (this.deployArrow && this.deployArrow.isVisible) {
      this.deployArrow.position.y = 0.35 + Math.sin(t * 3.2) * 0.12;
      this.deployArrowMat.emissiveColor = AMBER.scale(0.95 + 0.35 * Math.sin(t * 3.2));
    }

    // blinking energy lights (fortress core, warning lamps, drives…)
    for (let i = 0; i < this._blinkers.length; i++) {
      const b = this._blinkers[i];
      b.mat.emissiveColor = b.base.scale(0.55 + 0.45 * Math.sin(t * b.speed + (b.phase || 0)));
    }

    // floating elements (holo labels, dart ships, capital ships)
    for (let i = 0; i < this.floaters.length; i++) {
      const f = this.floaters[i];
      f.mesh.position.y = f.baseY + Math.sin(t * f.speed + f.phase) * f.amp;
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
