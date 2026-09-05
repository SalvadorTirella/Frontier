/* ============================================================
   ArtBible — in-game Visual Bible for Frontline: Operación Ironveil
   Palette breakdown, mood boards, doctrine plates & constraints
   ============================================================ */
import EventBus from '../core/EventBus.js';
import modalManager from './ModalManager.js';
import { make, on } from '../utils/DOMUtils.js';
import { ART_PALETTE, ART_ASSETS } from '../core/Config.js';
import AudioFX from '../utils/AudioUtils.js';

const DOCTRINE = [
  {
    title: 'MATERIALES PBR',
    icon: 'M4 4h16v16H4z M4 12h16 M12 4v16',
    lines: [
      'Metal gris con micro-arañazos y specularPower 24–30',
      'Cristal/escudos: alpha 0.07–0.5 + emisivo cian tenue',
      'Neón emisivo puro (disableLighting) → bloom selectivo',
      'Suelo: circuitos #1E2A33 sobre plancha #15191E',
      'Armadura alien: carbón + bioluminiscencia púrpura'
    ]
  },
  {
    title: 'ILUMINACIÓN',
    icon: 'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M12 8a4 4 0 100 8 4 4 0 000-8',
    lines: [
      'Key fría (0.80, 0.88, 1.0) desde la base aliada',
      'Sombras largas proyectadas hacia la fortaleza',
      'Relleno hemisférico azulado de baja intensidad',
      'Bloom 0.8 solo en emisivos · AO por blur shadows',
      'Niebla lineal 62→180, color vacío #05070A'
    ]
  },
  {
    title: 'CIELO & PROFUNDIDAD',
    icon: 'M3 18h18 M6 18V9 M18 18V9 M9 9h6 M12 3l2 3h-4z',
    lines: [
      'Gradiente #020305 → #0A1A33 con 460 estrellas',
      'Nebulosas azuladas + una violeta al 6% alpha',
      'Planeta anillado tras la fortaleza (silueta)',
      'Crucero aliado (cian) y dreadnought (rojo) en órbita',
      'Lectura abajo→arriba: Hub → carriles → monolito → cielo'
    ]
  },
  {
    title: 'VFX & GORE',
    icon: 'M12 3l3 6 6 1-4.5 4 1 6.5L12 17l-5.5 3.5 1-6.5L3 10l6-1z',
    lines: [
      'Trazadores por clase: bala fina, cohete con humo',
      'Explosión: flash blanco + núcleo + anillo de fuego MAGMA',
      'Airstrike: lanza orbital cian-blanca de doble núcleo',
      'IMPACT FX configurable: NONE / NORMAL / EXTREME',
      'EXTREME añade esquirlas rojas de bio-salpicadura'
    ]
  },
  {
    title: 'CARRILES & COVER',
    icon: 'M5 3v18 M12 3v18 M19 3v18 M2 21h20',
    lines: [
      'Bordes neón cian continuos con underglow de 1.15u',
      'Barreras bajas de acero + pasarelas a ras de suelo',
      'Marcadores de distancia holográficos cada 9u',
      'Línea de mediocampo ámbar — frontera táctica',
      'NADA cruza por encima del espacio aéreo de los carriles'
    ]
  },
  {
    title: 'ESCALABILIDAD',
    icon: 'M4 4l6 6 M4 4v4 M4 4h4 M20 20l-6-6 M20 20v-4 M20 20h-4',
    lines: [
      'Presets LOW→ULTRA con hardwareScaling 2.0→0.75',
      'Materiales compartidos por facción (batching)',
      'Luces dinámicas limitadas a 2 simultáneas en FX',
      'LOD de partículas: polvo/humo ligados al preset',
      'Auto-optimizer ajusta render scale si cae el FPS'
    ]
  }
];

const CONSTRAINTS = [
  'NO colores arcoíris — solo cian / rojo / ámbar + derivados',
  'NO unidades de plástico brillante — metal y carbón mate',
  'NO UI de app web — todo holográfico y militar',
  'NO mezclar estilos — un solo lenguaje visual coherente',
  'NO sacrificar legibilidad — siluetas y visores primero'
];

export default class ArtBible {
  init(el) {
    this.el = el;
    this._build();
  }

  _build() {
    const inner = make('div', 'ab-inner');

    /* header */
    inner.innerHTML = `
      <header class="ab-head">
        <div>
          <div class="ab-eyebrow mono">// DIRECTION PACK v1.0 — LANDSCAPE 16:9</div>
          <h1 class="ab-title display">VISUAL BIBLE</h1>
          <div class="ab-sub mono">FRONTLINE: OPERACIÓN IRONVEIL — HUMANOS <b class="cyan">CIAN</b> VS XENO <b class="red">ROJO</b></div>
        </div>
        <button class="btn-holo big" id="ab-close"><span>← VOLVER AL MANDO</span></button>
      </header>`;

    /* keyframe */
    const key = make('section', 'ab-key tech-frame');
    key.innerHTML = `
      <div class="ab-frame">
        <img src="${ART_ASSETS.keyframe}" alt="Keyframe del campo de batalla" loading="lazy" />
        <span class="ab-frame-tag mono">KEYFRAME — VISTA TÁCTICA DESDE EL BASE HUB</span>
      </div>`;
    inner.appendChild(key);

    /* palette */
    const pal = make('section', 'ab-palette');
    pal.innerHTML = `<h2 class="ab-h mono">PALETA OFICIAL — HEX EXACTOS (CLICK PARA COPIAR)</h2>`;
    const groups = make('div', 'ab-pal-cols');
    Object.entries(ART_PALETTE).forEach(([group, colors]) => {
      const col = make('div', 'ab-pal-col');
      col.innerHTML = `<h3 class="ab-pal-name mono">${group === 'player' ? '◤ JUGADOR' : group === 'enemy' ? '◤ ENEMIGO' : '◤ ENTORNO'}</h3>`;
      colors.forEach(({ name, hex, role }) => {
        const sw = make('button', 'ab-swatch');
        sw.innerHTML = `<i style="background:${hex};box-shadow:0 0 12px ${hex}55"></i>
          <div class="ab-sw-meta"><b>${name}</b><span class="mono">${hex}</span><small>${role}</small></div>`;
        on(sw, 'mouseenter', () => AudioFX.sfx('hover'));
        on(sw, 'click', async () => {
          AudioFX.sfx('click');
          try {
            await navigator.clipboard.writeText(hex);
            modalManager.toast(`${hex} COPIADO AL PORTAPAPELES`, 'ok');
          } catch (e) {
            modalManager.toast(hex, 'info');
          }
        });
        col.appendChild(sw);
      });
      groups.appendChild(col);
    });
    pal.appendChild(groups);
    inner.appendChild(pal);

    /* mood boards */
    const mood = make('section', 'ab-mood');
    mood.innerHTML = `
      <h2 class="ab-h mono">MOOD BOARDS POR FACCIÓN</h2>
      <div class="ab-mood-grid">
        <figure class="ab-frame">
          <img src="${ART_ASSETS.hub}" alt="Base Hub aliado" loading="lazy" />
          <figcaption class="mono">BASE HUB ALIADO — ACERO + ENERGÍA CIAN + ESCUDO PARCIAL</figcaption>
        </figure>
        <figure class="ab-frame">
          <img src="${ART_ASSETS.fortress}" alt="Fortaleza alienígena" loading="lazy" />
          <figcaption class="mono">XENO STRONGHOLD — MONOLITO CARBÓN + NÚCLEO PÚRPURA</figcaption>
        </figure>
      </div>`;
    inner.appendChild(mood);

    /* model sheet */
    const sheet = make('section', 'ab-sheet');
    sheet.innerHTML = `
      <h2 class="ab-h mono">MODEL SHEET — CLASES DE INFANTERÍA</h2>
      <div class="ab-frame wide">
        <img src="${ART_ASSETS.units}" alt="Model sheet de unidades" loading="lazy" />
        <span class="ab-frame-tag mono">SILUETAS LEGIBLES — VISOR CIAN OBLIGATORIO EN HUMANOS</span>
      </div>
      <div class="ab-classes mono">
        <span>RIFLEMAN — línea base</span><span>HEAVY — minigun + placas</span><span>SNIPER — railgun largo</span><span>RPG — lanzador asimétrico</span><span>FLAMER — tanques + piloto naranja</span>
      </div>`;
    inner.appendChild(sheet);

    /* doctrine plates */
    const doc = make('section', 'ab-doctrine');
    doc.innerHTML = `<h2 class="ab-h mono">DOCTRINA TÉCNICA</h2>`;
    const grid = make('div', 'ab-doc-grid');
    DOCTRINE.forEach((d) => {
      const plate = make('div', 'ab-plate chamfer-sm');
      plate.innerHTML = `
        <div class="ab-plate-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="${d.icon}"/></svg>
          <b>${d.title}</b>
        </div>
        <ul>${d.lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
      grid.appendChild(plate);
    });
    doc.appendChild(grid);
    inner.appendChild(doc);

    /* constraints */
    const cons = make('section', 'ab-cons');
    cons.innerHTML = `<h2 class="ab-h mono">RESTRICCIONES INNEGOCIABLES</h2>
      <ul class="ab-cons-list mono">${CONSTRAINTS.map((c) => `<li>${c}</li>`).join('')}</ul>`;
    inner.appendChild(cons);

    const foot = make('footer', 'ab-foot mono');
    foot.textContent = 'FRONTLINE: OPERACIÓN IRONVEIL — ART DIRECTION PACK · ENTREGABLE PARA ARTISTAS, MODELADORES 3D Y GENERADORES DE ASSETS';
    inner.appendChild(foot);

    this.el.appendChild(inner);
    on(inner.querySelector('#ab-close'), 'click', () => {
      AudioFX.sfx('back');
      EventBus.emit('artbible:close');
    });
  }
}
