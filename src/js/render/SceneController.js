/* ============================================================
   SceneController — Babylon.js render engine (MILESTONE 2)
   Corredor vertical retrato · 3 carriles rectos · sin obstáculos
   aéreos · cámara isométrica vertical · glow vía QualityManager
   ============================================================ */
import { LANES, BASE_W, BASE_H } from '../core/Config.js';

/* Babylon.js se carga como build UMD vía <script> (index.html). */
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

/* ---------- remapeo sim → mundo (retrato) ----------
   La simulación avanza sobre su eje X y reparte carriles sobre Z.
   El mundo retrato avanza sobre Z (jugador +Z abajo → enemigo -Z arriba)
   y los 3 carriles corren sobre X. Cuantizamos el carril para que las
   unidades se alineen limpiamente en las 3 pistas. La lógica de daño /
   objetivos vive en la simulación (coordenadas de sim) y no se altera. */
const LANE_XS = LANES.xs;
function laneX(simZ) {
  if (simZ <= -2.2) return LANE_XS[0];
  if (simZ < 2.2) return LANE_XS[1];
  return LANE_XS[2];
}
function W(sx, sy, sz) {
  return new Vector3(laneX(sz), sy, -sx);
}
function Wv(v) {
  return new Vector3(laneX(v.z), v.y, -v.x);
}

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

  /* ---------------- mundo vertical ---------------- */
  _buildWorld() {
    const scene = this.scene;
    scene.clearColor = new Color4(0.02, 0.031, 0.059, 1); // #05080F profundo
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.006;
    scene.fogColor = new Color3(0.02, 0.031, 0.059);

    // Cámara isométrica vertical: detrás del jugador (+Z, abajo) mirando
    // hacia el enemigo (-Z, arriba). fov vertical amplio para el corredor.
    this.camera = new ArcRotateCamera('cam', 0, 0.62, 54, new Vector3(0, 0, 0), scene);
    this.camera.minZ = 0.5;
    this.camera.fov = 1.0;
    this.desired = { alpha: 0, beta: 0.62, radius: 54, tx: 0, ty: 0, tz: 0 };

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.6;
    hemi.groundColor = new Color3(0.02, 0.04, 0.09);

    this.dirLight = new DirectionalLight('dir', new Vector3(0.35, -1, -0.5), scene);
    this.dirLight.position = new Vector3(18, 44, 20);
    this.dirLight.intensity = 1.2;
    this.shadowGen = new ShadowGenerator(1024, this.dirLight);
    this.shadowGen.useBlurExponentialShadowMap = true;
    this.shadowGen.setDarkness(0.35);

    // suelo base (muy oscuro, se funde con el fondo)
    const under = MeshBuilder.CreateGround('under', { width: 220, height: 220 }, scene);
    under.position.y = -0.06;
    const underMat = new StandardMaterial('underMat', scene);
    underMat.diffuseColor = new Color3(0.012, 0.02, 0.04);
    underMat.specularColor = Color3.Black();
    under.material = underMat;

    // suelo del corredor (rejilla holográfica orientada vertical)
    const ground = MeshBuilder.CreateGround('ground', { width: 30, height: 72, subdivisions: 2 }, scene);
    ground.material = this._buildGridMaterial();
    ground.receiveShadows = true;

    this.glow = new GlowLayer('glow', scene, { intensity: 0.7 });

    this._buildLanes();
    this._buildBases();
    this._buildProps();
    this._buildDust();

    this.engine.runRenderLoop(() => {
      const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);
      this._tick(dt);
      this.scene.render();
    });
  }

  /* rejilla procedural orientada al corredor vertical */
  _buildGridMaterial() {
    const size = 512;
    const tex = new DynamicTexture('gridTex', size, this.scene, false);
    const ctx = tex.getContext();
    ctx.fillStyle = '#050b16';
    ctx.fillRect(0, 0, size, size);
    const minor = size / 8;
    ctx.strokeStyle = 'rgba(0,150,210,0.26)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 8; i++) {
      const p = i * minor;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,198,255,0.55)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      const p = i * (size / 2);
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }
    tex.update();
    tex.uScale = 4;   // eje X (carriles)
    tex.vScale = 10;  // eje Z (avance del corredor)
    const mat = new StandardMaterial('groundMat', this.scene);
    mat.diffuseTexture = tex;
    mat.diffuseColor = new Color3(0.2, 0.2, 0.2);
    mat.emissiveTexture = tex;
    mat.emissiveColor = new Color3(0.45, 0.45, 0.45);
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

  /* ---------- 3 carriles rectos + zona de despliegue ---------- */
  _buildLanes() {
    const scene = this.scene;
    const len = LANES.baseZ * 2 + 4; // cubre todo el corredor

    // líneas divisorias de energía entre carriles (azul eléctrico)
    [-2.5, 2.5].forEach((x, i) => {
      const line = MeshBuilder.CreateBox(`laneDiv${i}`, { width: 0.12, height: 0.04, depth: len }, scene);
      line.position.set(x, 0.03, 0);
      const m = this._emissiveMat(`laneDivM${i}`, CYAN, 0.75);
      m.alpha = 0.65;
      line.material = m;
    });

    // bordes exteriores del corredor (neón)
    [-LANES.wallX, LANES.wallX].forEach((x, i) => {
      const edge = MeshBuilder.CreateBox(`laneEdge${i}`, { width: 0.2, height: 0.05, depth: len }, scene);
      edge.position.set(x, 0.035, 0);
      const m = this._emissiveMat(`laneEdgeM${i}`, CYAN, 1.0);
      m.alpha = 0.85;
      edge.material = m;
    });

    // zona de despliegue del jugador (ABAJO, acento ámbar)
    const deploy = MeshBuilder.CreateGround('deployZone', { width: LANES.wallX * 2, height: 5 }, scene);
    deploy.position.set(0, 0.02, LANES.spawnZ - 0.5);
    const dm = this._emissiveMat('deployM', AMBER, 0.4);
    dm.alpha = 0.32;
    deploy.material = dm;
    this.deployMat = dm;

    // franja de avance ámbar al frente de la zona de despliegue
    const deployLine = MeshBuilder.CreateBox('deployLine', { width: LANES.wallX * 2, height: 0.05, depth: 0.24 }, scene);
    deployLine.position.set(0, 0.04, LANES.spawnZ - 3);
    const dlm = this._emissiveMat('deployLineM', AMBER, 1.1);
    dlm.alpha = 0.9;
    deployLine.material = dlm;
    this.deployLineMat = dlm;

    // zona enemiga (ARRIBA, acento rojo tenue)
    const enemyZone = MeshBuilder.CreateGround('enemyZone', { width: LANES.wallX * 2, height: 5 }, scene);
    enemyZone.position.set(0, 0.02, -LANES.spawnZ + 0.5);
    const em = this._emissiveMat('enemyZoneM', RED, 0.35);
    em.alpha = 0.28;
    enemyZone.material = em;
  }

  /* ---------- bases en los extremos del corredor (sin elevarse sobre los carriles) ---------- */
  _buildBases() {
    this.bases = {};
    ['player', 'enemy'].forEach((side) => {
      const sign = side === 'player' ? 1 : -1; // jugador +Z (abajo), enemigo -Z (arriba)
      const accent = side === 'player' ? AMBER : RED;
      const root = new TransformNode(`base-${side}`, this.scene);
      root.position.z = sign * LANES.baseZ;

      const wallMat = new StandardMaterial(`wall-${side}`, this.scene);
      wallMat.diffuseColor = side === 'player' ? new Color3(0.13, 0.15, 0.1) : new Color3(0.2, 0.09, 0.07);
      wallMat.specularColor = new Color3(0.12, 0.12, 0.12);

      // muro bajo que cruza los 3 carriles en el extremo
      const wall = MeshBuilder.CreateBox(`bwall-${side}`, { width: LANES.wallX * 2 + 2, height: 4.2, depth: 3 }, this.scene);
      wall.material = wallMat;
      wall.position.set(0, 2.1, sign * 1.4);
      wall.parent = root;

      // torretas laterales (bajas, fuera de los carriles)
      [-LANES.wallX - 0.4, LANES.wallX + 0.4].forEach((x, i) => {
        const tower = MeshBuilder.CreateBox(`btow-${side}${i}`, { width: 3, height: 6, depth: 3 }, this.scene);
        tower.position.set(x, 3, sign * 1.2);
        tower.material = wallMat;
        tower.parent = root;
        const win = MeshBuilder.CreateBox(`bwin-${side}${i}`, { width: 3.1, height: 0.45, depth: 3.1 }, this.scene);
        win.position.set(x, 5.2, sign * 1.2);
        win.material = this._emissiveMat(`bwinM-${side}${i}`, accent, 0.9);
        win.parent = root;
        this.shadowGen.addShadowCaster(tower);
      });

      // compuerta emisiva a nivel de suelo (acento de color)
      const gate = MeshBuilder.CreateBox(`bgate-${side}`, { width: LANES.wallX * 2, height: 0.3, depth: 0.5 }, this.scene);
      gate.position.set(0, 0.4, sign * -0.4);
      gate.material = this._emissiveMat(`bgateM-${side}`, accent, 0.8);
      gate.parent = root;

      this.shadowGen.addShadowCaster(wall);
      this.bases[side] = { root, sign };
    });
  }

  /* ---------- utilería mínima, baja y FUERA del corredor (sin cruzar el espacio aéreo) ---------- */
  _buildProps() {
    this.props = new TransformNode('props', this.scene);
    const crateMat = new StandardMaterial('crate', this.scene);
    crateMat.diffuseColor = new Color3(0.13, 0.17, 0.14);
    crateMat.specularColor = new Color3(0.05, 0.05, 0.05);

    // cajas bajas en las márgenes laterales (|x| > wallX), nunca sobre los carriles
    [[-11, 16, 1.5], [-10, 8, 1.0], [11.5, -14, 1.3], [10.5, -6, 0.9], [-12, -18, 1.2], [12, 18, 1.1]].forEach(([x, z, s], i) => {
      const c = MeshBuilder.CreateBox(`crate${i}`, { size: s }, this.scene);
      c.position.set(x, s / 2, z);
      c.rotation.y = Math.random() * 0.9;
      c.material = crateMat;
      c.parent = this.props;
      this.shadowGen.addShadowCaster(c);
    });
  }

  _buildDust() {
    // placeholder — las partículas se crean en _buildFXTexture (necesitan la textura)
  }

  _buildFXTexture() {
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
    this.dust.minEmitBox = new Vector3(-14, 0, -32);
    this.dust.maxEmitBox = new Vector3(14, 6, 32);
    this.dust.direction1 = new Vector3(-0.05, 0.25, 0);
    this.dust.direction2 = new Vector3(0.05, 0.6, 0);
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

  /* ---------------- modos ---------------- */
  setMode(mode) {
    this.mode = mode;
    if (mode === 'battle') {
      // vista isométrica vertical fija sobre el corredor
      Object.assign(this.desired, { alpha: 0, beta: 0.62, radius: 54, tx: 0, ty: 0, tz: 0 });
    } else {
      this.desired.alpha = this.camera.alpha;
      Object.assign(this.desired, { beta: 1.02, radius: 46, tx: 0, ty: 1.5, tz: 0 });
    }
  }

  /* ---------------- unidades ---------------- */
  addUnitMesh(def, side, x, z) {
    const s = def.size || 1;
    const p = W(x, 0, z);
    const root = new TransformNode(`u-${def.id}-${Math.random().toString(36).slice(2, 7)}`, this.scene);
    root.position.copyFrom(p);
    // jugador mira hacia -Z (arriba/enemigo), enemigo hacia +Z (abajo/jugador)
    root.rotation.y = side === 'player' ? Math.PI : 0;

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

    // barra de vida (horizontal sobre la unidad)
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
    const p = W(x, 0, z);
    handle.root.position.x = p.x;
    handle.root.position.z = p.z;
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
    const line = MeshBuilder.CreateLines('tr', { points: [Wv(a), Wv(b)] }, this.scene);
    line.color = side === 'player' ? new Color3(0.35, 0.95, 1) : new Color3(1, 0.5, 0.22);
    this.fx.push({ kind: 'fade', mesh: line, age: 0, ttl: 0.09 });
  }

  muzzle(pos, side) {
    const s = MeshBuilder.CreateSphere('muz', { diameter: 0.34 }, this.scene);
    s.position.copyFrom(Wv(pos));
    s.material = this._emissiveMat(`muzM${s.uniqueId}`, side === 'player' ? CYAN : AMBER, 1.6);
    this.fx.push({ kind: 'shrink', mesh: s, age: 0, ttl: 0.07 });
  }

  explode(pos, power = 1, hue = 'amber') {
    const wp = Wv(pos);
    const color = hue === 'red' ? RED : hue === 'cyan' ? CYAN : AMBER;

    const core = MeshBuilder.CreateSphere('expCore', { diameter: 1 }, this.scene);
    core.position.copyFrom(wp);
    core.material = this._emissiveMat(`expM${core.uniqueId}`, color, 1.5);
    this.fx.push({ kind: 'grow', mesh: core, age: 0, ttl: 0.3, from: 0.3, to: 2.6 * power });

    const ring = MeshBuilder.CreateTorus('expRing', { diameter: 1, tube: 0.055, tessellation: 40 }, this.scene);
    ring.position.set(wp.x, 0.16, wp.z);
    ring.material = this._emissiveMat(`expRM${ring.uniqueId}`, hue === 'cyan' ? CYAN : AMBER, 1.1);
    this.fx.push({ kind: 'growFlat', mesh: ring, age: 0, ttl: 0.42, from: 0.6, to: 3.6 * power });

    if (this.particlesOn) {
      const n = Math.min(10, 4 + Math.round(power * 2));
      for (let i = 0; i < n; i++) {
        const d = MeshBuilder.CreateBox('deb', { size: 0.16 + Math.random() * 0.12 }, this.scene);
        d.position.copyFrom(wp);
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
        const pl = new PointLight('expL', wp.add(new Vector3(0, 1.2, 0)), this.scene);
        pl.diffuse = color;
        pl.intensity = 6 * power;
        pl.range = 16;
        this.fx.push({ kind: 'light', light: pl, age: 0, ttl: 0.24, from: 6 * power });
      }
    }
  }

  airstrikeFX(pos) {
    const wp = Wv(pos);
    const beam = MeshBuilder.CreateCylinder('beam', { diameter: 3.4, height: 34, tessellation: 20 }, this.scene);
    beam.position.set(wp.x, 17, wp.z);
    const bm = this._emissiveMat(`beamM${beam.uniqueId}`, CYAN, 1.2);
    bm.alpha = 0.22;
    beam.material = bm;
    this.fx.push({ kind: 'beam', mesh: beam, age: 0, ttl: 0.5 });

    this.pending.push({ t: 0.12, fn: () => this.explode(pos, 2.6) });
    this.pending.push({ t: 0.24, fn: () => this.explode(pos, 1.7) });
    this.pending.push({ t: 0.34, fn: () => this.explode(pos, 1.7) });
  }

  damageBaseFX(side) {
    const b = this.bases[side];
    if (!b) return;
    const z = b.sign * (LANES.baseZ - 2.5);
    this.explode(new Vector3((Math.random() - 0.5) * 10, 1.5, z), 1.15, side === 'player' ? 'red' : 'amber');
  }

  collapseBase(side) {
    const b = this.bases[side];
    if (!b) return;
    const z = b.sign * LANES.baseZ;
    for (let i = 0; i < 5; i++) {
      this.pending.push({
        t: i * 0.12,
        fn: () => this.explode(new Vector3((Math.random() - 0.5) * 14, 1 + Math.random() * 4, z + (Math.random() - 0.5) * 3), 2.2)
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
    const wp = Wv(v);
    const t = Vector3.Project(
      wp,
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(BASE_W, BASE_H)
    );
    return { x: t.x, y: t.y };
  }

  /* ---------------- calidad (sincronizado con QualityManager) ---------------- */
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

    // cámara
    if (this.mode === 'ambient') this.desired.alpha += dt * 0.045;
    const k = Math.min(1, dt * 2.4);
    this.camera.alpha += (this.desired.alpha - this.camera.alpha) * k;
    this.camera.beta += (this.desired.beta - this.camera.beta) * k;
    this.camera.radius += (this.desired.radius - this.camera.radius) * k;
    let ox = 0, oy = 0;
    if (this.shakeAmp && this.shakeAmp > 0.004) {
      ox = (Math.random() - 0.5) * this.shakeAmp;
      oy = (Math.random() - 0.5) * this.shakeAmp * 0.7;
      this.shakeAmp *= Math.pow(0.03, dt);
    } else this.shakeAmp = 0;
    this.camera.target.x += (this.desired.tx + ox - this.camera.target.x) * Math.min(1, dt * 6);
    this.camera.target.y += (this.desired.ty + oy - this.camera.target.y) * Math.min(1, dt * 6);
    this.camera.target.z += (this.desired.tz - this.camera.target.z) * Math.min(1, dt * 6);

    // pulso de la zona de despliegue ámbar
    if (this.deployLineMat) {
      this.deployLineMat.emissiveColor = AMBER.scale(0.8 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.4)));
    }

    // fx programados
    for (let i = this.pending.length - 1; i >= 0; i--) {
      this.pending[i].t -= dt;
      if (this.pending[i].t <= 0) {
        const p = this.pending.splice(i, 1)[0];
        p.fn();
      }
    }

    // fx activos
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
