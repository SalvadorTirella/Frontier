/* ============================================================
   SettingsMenu — graphic optimizer, audio channels, system
   ============================================================ */
import EventBus from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';
import SaveManager from '../core/SaveManager.js';
import QualityManager from '../core/QualityManager.js';
import modalManager from './ModalManager.js';
import { make, on, setTxt } from '../utils/DOMUtils.js';
import AudioFX from '../utils/AudioUtils.js';
import { PRESET_ORDER, QUALITY_PRESETS } from '../core/Config.js';

const TOGGLES = [
  { key: 'particles',   label: 'PARTICLE FX',     hint: 'Explosions, tracers & ambient dust' },
  { key: 'glow',        label: 'GLOW & BLOOM',    hint: 'Neon bloom pass on emissives' },
  { key: 'shadows',     label: 'DYNAMIC SHADOWS', hint: 'Directional shadow maps' },
  { key: 'bgAnim',      label: 'UI ANIMATIONS',   hint: 'Grid drift, scanlines & motes' }
];

const SLIDERS = [
  { key: 'master', label: 'MASTER' },
  { key: 'music',  label: 'MUSIC' },
  { key: 'sfx',    label: 'SFX' }
];

export default class SettingsMenu {
  init(el, ctx) {
    this.el = el;
    this.ctx = ctx;
    this._build();
    this._bind();
    EventBus.on('screen:opened', ({ id }) => { if (id === 'settings') this.syncUI(); });
    EventBus.on('quality:changed', () => this.syncUI());
    // los toggles/sliders emiten settings:changed → refrescar estado visual
    EventBus.on('settings:changed', () => this.syncUI());
    EventBus.on('perf:fps', ({ fps }) => setTxt(this.fpsEl, `${Math.round(fps)} FPS`));
  }

  _build() {
    const panel = make('div', 'settings-panel panel-frame chamfer');
    panel.innerHTML = `
      <header class="set-head">
        <div class="set-title-wrap">
          <span class="set-eyebrow mono">// SYSTEM CONFIGURATION</span>
          <h2 class="display">CONTROL CENTER</h2>
        </div>
        <button id="set-back" class="btn-holo chamfer-sm"><span>‹ BACK</span></button>
      </header>
      <div class="set-cols">
        <section class="set-col">
          <h3 class="set-col-title"><i></i>GRAPHICS</h3>
          <div class="preset-grid" id="set-presets"></div>
          <div class="toggle-list" id="set-toggles"></div>
        </section>
        <section class="set-col">
          <h3 class="set-col-title"><i></i>AUDIO</h3>
          <div class="slider-list" id="set-sliders"></div>
          <div class="set-note mono">AUDIO ENGINE — WEBAUDIO SYNTH v2<br/>CHANGES APPLY IN REAL TIME</div>
        </section>
        <section class="set-col">
          <h3 class="set-col-title"><i></i>SYSTEM</h3>
          <div class="sys-list">
            <div class="sys-row">
              <div><b>RENDER TARGET</b><small>1280×720 · 16:9 LETTERBOX</small></div>
              <span class="sys-val mono" id="set-fps">— FPS</span>
            </div>
            <div class="sys-row">
              <div><b>SCREEN SHAKE</b><small>Impact camera feedback</small></div>
              <span id="set-shakewrap"></span>
            </div>
            <button class="btn-holo wide" id="set-fullscreen"><span>⛶ TOGGLE FULLSCREEN</span></button>
            <button class="btn-holo wide" id="set-export"><span>⧉ EXPORT SAVE (CLIPBOARD)</span></button>
            <div class="set-note mono">CLOUD SYNC — SUPABASE OAUTH MODULE STAGED<br/>LOCAL SAVE AUTHORITATIVE (OFFLINE MILESTONE)</div>
          </div>
        </section>
      </div>`;
    this.el.appendChild(panel);
    this.fpsEl = panel.querySelector('#set-fps');

    /* presets */
    const presetWrap = panel.querySelector('#set-presets');
    this.presetBtns = {};
    PRESET_ORDER.forEach((name) => {
      const p = QUALITY_PRESETS[name];
      const btn = make('button', 'preset-btn chamfer-sm', `
        <b>${name}</b>
        <span class="mono">${p.hardwareScaling === 0.75 ? 'SSAA ×1.33' : p.hardwareScaling === 1 ? 'NATIVE' : `SCALE 1/${p.hardwareScaling}`}</span>
        <i class="preset-check">◆</i>`);
      on(btn, 'click', () => {
        AudioFX.sfx('click');
        // optimistic paint: feedback inmediato, el evento reconcilia el resto
        Object.entries(this.presetBtns).forEach(([n, b]) => b.classList.toggle('active', n === name));
        this.customBadge.classList.add('hidden');
        QualityManager.applyPreset(name);
      });
      on(btn, 'mouseenter', () => AudioFX.sfx('hover'));
      presetWrap.appendChild(btn);
      this.presetBtns[name] = btn;
    });
    this.customBadge = make('div', 'custom-badge mono hidden', 'CUSTOM PROFILE ACTIVE');
    presetWrap.appendChild(this.customBadge);

    /* toggles */
    const toggleWrap = panel.querySelector('#set-toggles');
    this.toggleEls = {};
    TOGGLES.forEach((t) => {
      const row = make('div', 'toggle-row');
      row.innerHTML = `<div class="t-meta"><b>${t.label}</b><small>${t.hint}</small></div>`;
      const sw = make('button', 'switch', '<i></i>');
      sw.setAttribute('role', 'switch');
      on(sw, 'click', () => {
        const next = !StateManager.get(`settings.${t.key}`);
        AudioFX.sfx('click');
        sw.classList.toggle('on', next); // paint inmediato sin esperar al bus
        QualityManager.applyToggle(t.key, next);
      });
      row.appendChild(sw);
      toggleWrap.appendChild(row);
      this.toggleEls[t.key] = sw;
    });

    /* sliders */
    const sliderWrap = panel.querySelector('#set-sliders');
    SLIDERS.forEach((s) => {
      const row = make('div', 'slider-row');
      row.innerHTML = `<div class="s-head"><b>${s.label}</b><output class="mono" id="sl-out-${s.key}">0</output></div>`;
      const input = make('input', 'holo-range');
      input.type = 'range'; input.min = 0; input.max = 100; input.step = 1;
      on(input, 'input', () => {
        const v = Number(input.value);
        setTxt(row.querySelector('output'), v);
        input.style.setProperty('--fill', `${v}%`);
        QualityManager.applyVolume(s.key, v);
      });
      row.appendChild(input);
      sliderWrap.appendChild(row);
      this[`slider_${s.key}`] = input;
    });

    /* system */
    const shakeWrap = panel.querySelector('#set-shakewrap');
    this.shakeSw = make('button', 'switch', '<i></i>');
    on(this.shakeSw, 'click', () => {
      AudioFX.sfx('click');
      const next = !StateManager.get('settings.screenShake');
      this.shakeSw.classList.toggle('on', next);
      QualityManager.applyToggle('screenShake', next);
    });
    shakeWrap.appendChild(this.shakeSw);

    /* impact FX level (Visual Bible: blood NONE / NORMAL / EXTREME) */
    const goreWrap = make('div', 'toggle-row');
    goreWrap.innerHTML = `<div class="t-meta"><b>IMPACT FX</b><small>Debris & bio-splatter density</small></div>`;
    const goreGroup = make('div', 'gore-group');
    this.goreBtns = {};
    ['NONE', 'NORMAL', 'EXTREME'].forEach((lv) => {
      const b = make('button', 'gore-btn mono', lv);
      on(b, 'mouseenter', () => AudioFX.sfx('hover'));
      on(b, 'click', () => {
        AudioFX.sfx('click');
        Object.entries(this.goreBtns).forEach(([l, el]) => el.classList.toggle('active', l === lv));
        QualityManager.applyGore(lv);
      });
      this.goreBtns[lv] = b;
      goreGroup.appendChild(b);
    });
    goreWrap.appendChild(goreGroup);
    toggleWrap.appendChild(goreWrap);

    on(panel.querySelector('#set-back'), 'click', () => { AudioFX.sfx('back'); EventBus.emit('settings:close'); });
    this.fsBtn = panel.querySelector('#set-fullscreen');
    on(this.fsBtn, 'click', () => { AudioFX.sfx('click'); this.ctx.toggleFullscreen(); });
    EventBus.on('fullscreen:changed', ({ active }) => this._paintFullscreen(active));
    this._paintFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    on(panel.querySelector('#set-export'), 'click', async () => {
      AudioFX.sfx('click');
      try {
        await navigator.clipboard.writeText(SaveManager.exportSave());
        modalManager.toast('SAVE DATA COPIED TO CLIPBOARD');
      } catch (e) {
        modalManager.toast('CLIPBOARD UNAVAILABLE IN THIS CONTEXT', 'warn');
      }
    });
  }

  _bind() {
    // live-preview blips while dragging SFX/music
    this.el.addEventListener('change', () => AudioFX.sfx('buy'));
  }

  _paintFullscreen(active) {
    if (!this.fsBtn) return;
    this.fsBtn.classList.toggle('fs-active', active);
    this.fsBtn.querySelector('span').textContent = active ? '⛶ EXIT FULLSCREEN' : '⛶ TOGGLE FULLSCREEN';
  }

  syncUI() {
    const s = StateManager.get('settings');
    PRESET_ORDER.forEach((name) => {
      this.presetBtns[name].classList.toggle('active', s.quality === name);
    });
    this.customBadge.classList.toggle('hidden', s.quality !== 'CUSTOM');
    TOGGLES.forEach((t) => {
      this.toggleEls[t.key].classList.toggle('on', !!s[t.key]);
    });
    this.shakeSw.classList.toggle('on', !!s.screenShake);
    const gore = s.gore || 'NORMAL';
    Object.entries(this.goreBtns).forEach(([lv, el]) => el.classList.toggle('active', lv === gore));
    SLIDERS.forEach(({ key }) => {
      const input = this[`slider_${key}`];
      const v = s[key];
      input.value = v;
      input.style.setProperty('--fill', `${v}%`);
      setTxt(input.parentElement.querySelector('output'), v);
    });
  }
}
