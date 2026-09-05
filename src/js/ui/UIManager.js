/* ============================================================
   UIManager — master orchestrator: boot, screens, globals
   ============================================================ */
import EventBus from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';
import SaveManager from '../core/SaveManager.js';
import QualityManager from '../core/QualityManager.js';
import ScreenManager from './ScreenManager.js';
import modalManager from './ModalManager.js';
import MainMenu from './MainMenu.js';
import PauseMenu from './PauseMenu.js';
import SettingsMenu from './SettingsMenu.js';
import BattleScreen from './BattleScreen.js';
import SceneController from '../render/SceneController.js';
import AudioFX from '../utils/AudioUtils.js';
import { make, on, setTxt, rand } from '../utils/DOMUtils.js';
import { animateNumber, staggerIn } from '../utils/AnimationUtils.js';
import { BASE_W, BASE_H, BATTLE, rankForXp } from '../core/Config.js';
import { fmtTime } from '../utils/DOMUtils.js';

const UIManager = {
  init(stage) {
    this.stage = stage;
    this.uiLayer = stage.querySelector('#ui-layer');
    this.canvas = stage.querySelector('#render-canvas');
    this.disposers = [];

    /* ---------- screens scaffold ---------- */
    this.screens = new ScreenManager();
    const defs = [
      ['loading', false], ['main-menu', false], ['battle', false],
      ['pause', true], ['settings', true], ['results', false]
    ];
    this.els = {};
    defs.forEach(([id, overlay]) => {
      const el = make('section', '');
      this.uiLayer.appendChild(el);
      this.screens.register(id, el, { overlay });
      this.els[id] = el;
    });

    /* css particle ambience */
    this.particlesEl = make('div', 'css-particles');
    for (let i = 0; i < 34; i++) {
      const p = make('i');
      p.style.left = `${rand(0, 100)}%`;
      p.style.top = `${rand(0, 100)}%`;
      p.style.animationDuration = `${rand(7, 16)}s`;
      p.style.animationDelay = `${rand(0, 12)}s`;
      p.style.setProperty('--dx', `${rand(-60, 60)}px`);
      p.style.setProperty('--s', rand(1.5, 3.4).toFixed(1));
      this.particlesEl.appendChild(p);
    }
    this.uiLayer.appendChild(this.particlesEl);

    modalManager.init(this.uiLayer);

    /* ---------- context & modules ---------- */
    this.scene = new SceneController();
    this.ctx = {
      scene: this.scene,
      screens: this.screens,
      toggleFullscreen: () => this.toggleFullscreen()
    };

    this.mainMenu = new MainMenu();
    this.mainMenu.init(this.els['main-menu'], this.ctx);
    this.pauseMenu = new PauseMenu();
    this.pauseMenu.init(this.els['pause'], this.ctx);
    this.settingsMenu = new SettingsMenu();
    this.settingsMenu.init(this.els['settings'], this.ctx);
    this.battle = new BattleScreen();
    this.battle.init(this.els['battle'], this.ctx);
    this.ctx.battle = this.battle;

    this._buildLoading();
    this._buildResults();
    this._wireEvents();
    this._wireGlobals();

    this._fit();
    this._loadingSequence();

    return { destroy: () => this._destroy() };
  },

  /* ================= loading ================= */
  _buildLoading() {
    this.els['loading'].innerHTML = `
      <div class="load-frame">
        <span class="corner tl"></span><span class="corner tr"></span>
        <span class="corner bl"></span><span class="corner br"></span>
        <div class="load-core">
          <div class="load-eyebrow mono">// OPERATION IRONVEIL — SECURE CHANNEL</div>
          <h1 class="load-logo display">TACTICAL <em>ARMY</em> BATTLE</h1>
          <div class="load-tag mono">COMMAND CONSOLE v2.7 · BABYLON RENDER CORE</div>
        </div>
        <div class="load-bottom">
          <div class="load-bar chamfer-sm"><i id="load-fill"></i><b class="load-stripes"></b></div>
          <div class="load-row mono"><span id="load-log">ESTABLISHING UPLINK…</span><span id="load-pct">0%</span></div>
        </div>
      </div>`;
    this.loadFill = this.els['loading'].querySelector('#load-fill');
    this.loadPct = this.els['loading'].querySelector('#load-pct');
    this.loadLog = this.els['loading'].querySelector('#load-log');
  },

  async _loadingSequence() {
    this.screens.show('loading');
    const setP = (p) => {
      this.loadFill.style.width = `${p}%`;
      setTxt(this.loadPct, `${Math.round(p)}%`);
    };
    const step = async (label, target, ms, fn) => {
      setTxt(this.loadLog, label);
      const from = parseFloat(this.loadPct.textContent) || 0;
      const t0 = performance.now();
      await new Promise((res) => {
        const iv = setInterval(() => {
          const q = Math.min(1, (performance.now() - t0) / ms);
          setP(from + (target - from) * q);
          if (q >= 1) { clearInterval(iv); res(); }
        }, 16);
      });
      if (fn) fn();
    };

    await step('ESTABLISHING SECURE UPLINK…', 14, 380);
    await step('INITIALIZING BABYLON RENDER CORE…', 38, 520, () => {
      const ok = this.scene.init(this.canvas);
      if (!ok) setTxt(this.loadLog, 'RENDER CORE DEGRADED — SOFTWARE FALLBACK');
    });
    await step('GENERATING COMBAT THEATER…', 62, 460, () => {
      this.scene.setMode('ambient');
      this.scene.setQuality(QualityManager.currentConfig());
    });
    await step('CALIBRATING GRAPHIC OPTIMIZER…', 78, 340, () => {
      SaveManager.load();
      QualityManager.syncBodyClasses();
      AudioFX.setVolumes(
        StateManager.get('settings.master'),
        StateManager.get('settings.music'),
        StateManager.get('settings.sfx')
      );
    });
    await step('LOADING OPERATIVE RECORDS…', 92, 380);
    await step('ALL SYSTEMS NOMINAL', 100, 300);
    await new Promise((r) => setTimeout(r, 420));
    this.screens.show('main-menu');
  },

  /* ================= results ================= */
  _buildResults() {
    this.els['results'].innerHTML = `
      <div class="results-wrap">
        <div class="results-stamp-block" data-anim>
          <div class="results-eyebrow mono">// AFTER-ACTION REPORT</div>
          <div id="res-stamp" class="results-stamp display">VICTORY</div>
          <div id="res-sub" class="results-sub mono">SECTOR SECURED</div>
        </div>
        <div class="results-panel panel-frame chamfer" data-anim>
          <div class="res-grid">
            <div class="res-stats" id="res-stats"></div>
            <div class="res-xp">
              <div class="res-xp-head"><span class="mono">COMMENDATION XP</span><b class="mono amber" id="res-xp">+0</b></div>
              <div class="xp-track chamfer-sm"><i id="res-xpbar"></i></div>
              <div class="res-rank mono">RANK — <b id="res-rank" class="cyan">RECRUIT</b><span id="res-rankup" class="rankup hidden">▲ PROMOTED</span></div>
            </div>
          </div>
          <div class="res-actions">
            <button class="btn-holo btn-primary big" id="res-retry"><span>RE-DEPLOY</span></button>
            <button class="btn-holo big" id="res-menu"><span>COMMAND MENU</span></button>
          </div>
        </div>
      </div>`;
    on(this.els['results'].querySelector('#res-retry'), 'click', () => {
      AudioFX.sfx('click');
      this.screens.show('battle');
      this.battle.start();
    });
    on(this.els['results'].querySelector('#res-menu'), 'click', () => {
      AudioFX.sfx('click');
      this.scene.clearUnits();
      this.scene.restoreBase('player');
      this.scene.restoreBase('enemy');
      this.scene.setMode('ambient');
      this.screens.show('main-menu');
    });
  },

  _showResults(stats) {
    const el = this.els['results'];
    const stamp = el.querySelector('#res-stamp');
    stamp.textContent = stats.victory ? 'VICTORY' : 'DEFEAT';
    stamp.classList.remove('stamp-win', 'stamp-lose');
    void stamp.offsetWidth;
    stamp.classList.toggle('stamp-win', stats.victory);
    stamp.classList.toggle('stamp-lose', !stats.victory);
    el.querySelector('#res-xpbar').style.width = '2%';
    el.querySelector('#res-sub').textContent = stats.victory
      ? 'ENEMY HQ DEMOLISHED — SECTOR SECURED'
      : 'BASE INTEGRITY LOST — FORCES WITHDRAWN';

    const rows = [
      ['WAVES CLEARED', `${stats.wavesCleared} / ${BATTLE.finalWave}`],
      ['HOSTILES NEUTRALIZED', stats.kills],
      ['UNITS LOST', stats.losses],
      ['CREDITS EARNED', `CR ${stats.earned.toLocaleString()}`],
      ['BEST COMBO', `x${stats.bestCombo}`],
      ['OP DURATION', fmtTime(stats.time)]
    ];
    el.querySelector('#res-stats').innerHTML = rows
      .map(([k, v]) => `<div class="res-row"><span>${k}</span><i></i><b class="mono">${v}</b></div>`)
      .join('');

    const profile = StateManager.get('profile');
    const rank = rankForXp(profile.xp);
    animateNumber(el.querySelector('#res-xp'), stats.xp, { dur: 900, from: 0, fmt: (v) => `+${Math.round(v)}` });
    el.querySelector('#res-rank').textContent = rank.name;
    const rankup = el.querySelector('#res-rankup');
    rankup.classList.toggle('hidden', !stats.rankUp);
    setTimeout(() => {
      el.querySelector('#res-xpbar').style.width = `${Math.max(3, rank.pct * 100)}%`;
    }, 250);
    if (stats.rankUp) AudioFX.sfx('rankup');

    AudioFX.startMusic('menu');
    this.screens.show('results');
    staggerIn(el, '[data-anim]', 140);
  },

  /* ================= event wiring ================= */
  _wireEvents() {
    const S = this.screens;

    EventBus.on('battle:request', () => {
      S.show('battle');
      this.battle.start();
    });

    EventBus.on('battle:pauseRequest', () => this._pauseBattle());
    EventBus.on('battle:resumeRequest', () => this._resumeBattle());

    EventBus.on('battle:restartRequest', () => {
      while (S.current && S.current !== 'battle') S.back();
      this.battle.start();
    });

    EventBus.on('battle:abortRequest', () => {
      this.battle.abort();
      while (S.current && S.current !== 'main-menu') {
        if (S.stack.length > 1) S.back();
        else break;
      }
      S.show('main-menu');
    });

    EventBus.on('settings:open', () => {
      if (S.stack.includes('battle') && !this.battle.paused) {
        this.battle.pause();
        this._autoPaused = true;
      }
      S.show('settings');
    });

    EventBus.on('settings:close', () => {
      S.back();
      if (!S.stack.includes('pause') && S.stack.includes('battle') && this.battle.running && this._autoPaused) {
        this.battle.resume();
      }
      this._autoPaused = false;
    });

    EventBus.on('battle:end', (stats) => this._showResults(stats));

    EventBus.on('quality:changed', ({ config, auto }) => {
      this.scene.setQuality(config);
      if (auto) modalManager.toast('AUTO-OPTIMIZER — RENDER SCALE ADJUSTED', 'warn');
    });

    EventBus.on('settings:changed', (settings) => {
      this.scene.setQuality(QualityManager.currentConfig());
      AudioFX.setVolumes(settings.master, settings.music, settings.sfx);
    });

    EventBus.on('audio:changed', () => {
      AudioFX.setVolumes(
        StateManager.get('settings.master'),
        StateManager.get('settings.music'),
        StateManager.get('settings.sfx')
      );
    });

    EventBus.on('screen:changed', ({ id, stack }) => {
      this.stage.classList.toggle('ambience-on', id === 'main-menu' || id === 'loading' || id === 'results');
      this.stage.classList.toggle('battle-cursor', stack && stack[0] === 'battle');
    });
  },

  _pauseBattle() {
    if (!this.battle.running || this.battle.paused) return;
    this.battle.pause();
    this.pauseMenu.refreshStats(this.battle.getSnapshot());
    this.screens.show('pause');
    AudioFX.sfx('click');
  },

  _resumeBattle() {
    if (this.screens.is('pause')) this.screens.back();
    this.battle.resume();
    AudioFX.sfx('click');
  },

  /* ================= globals ================= */
  _wireGlobals() {
    const onKey = (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.uiLayer.querySelector('.modal-backdrop')) return;
        const S = this.screens;
        if (S.stack.includes('settings')) EventBus.emit('settings:close');
        else if (S.is('pause')) EventBus.emit('battle:resumeRequest');
        else if (S.is('battle')) EventBus.emit('battle:pauseRequest');
        return;
      }
      if (!this.screens.is('battle') && !this.screens.stack.includes('battle')) return;
      if (this.screens.stack.includes('pause') || this.screens.stack.includes('settings')) return;
      const map = { Digit1: 'rifleman', Digit2: 'gunner', Digit3: 'tank', Digit4: 'artillery' };
      if (map[e.code]) { EventBus.emit('buy:unit', { id: map[e.code] }); e.preventDefault(); }
      if (e.code === 'Space') { EventBus.emit('ability:use'); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    this.disposers.push(() => window.removeEventListener('keydown', onKey));

    const onResize = () => this._fit();
    window.addEventListener('resize', onResize);
    this.disposers.push(() => window.removeEventListener('resize', onResize));

    const onFs = () => {
      this._fit();
      if (this.scene.engine) this.scene.resize();
      EventBus.emit('fullscreen:changed', {
        active: !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement)
      });
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    this.disposers.push(() => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    });

    const unlock = () => {
      AudioFX.unlock();
      if (!AudioFX.musicMode) {
        AudioFX.startMusic(this.screens.is('battle') ? 'battle' : 'menu');
      }
    };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
    this.disposers.push(() => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    });

    const onVis = () => {
      if (document.hidden && this.screens.is('battle') && this.battle.running && !this.battle.paused) {
        this._pauseBattle();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVis));

    this.stage.addEventListener('contextmenu', (e) => e.preventDefault());

    /* render tick → sim + perf governor */
    this._perfT = 0;
    this._lowStreak = 0;
    this.scene.onTick = (dt, fps) => {
      this.battle.tick(dt);
      this._perfT += dt;
      if (this._perfT >= 1.5) {
        this._perfT = 0;
        EventBus.emit('perf:fps', { fps });
        if (fps < 36) this._lowStreak++;
        else this._lowStreak = 0;
        if (this._lowStreak >= 2) {
          this._lowStreak = 0;
          const cur = this.scene.engine ? this.scene.engine.getHardwareScalingLevel() : 1;
          const next = Math.min(2, Math.round(cur * 1.25 * 100) / 100);
          if (next > cur) QualityManager.applyScaling(next);
        }
      }
    };
  },

  _fit() {
    const s = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
    document.documentElement.style.setProperty('--stage-scale', s.toFixed(4));
  },

  toggleFullscreen() {
    const doc = document;
    const active = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement;
    if (!active) {
      const target = doc.getElementById('viewport') || doc.documentElement;
      const req = target.requestFullscreen || target.webkitRequestFullscreen || target.mozRequestFullScreen;
      if (!req) { modalManager.toast('FULLSCREEN NOT SUPPORTED HERE', 'warn'); return; }
      try {
        const p = req.call(target);
        if (p && p.catch) p.catch(() => modalManager.toast('FULLSCREEN BLOCKED BY BROWSER', 'warn'));
      } catch (e) {
        modalManager.toast('FULLSCREEN BLOCKED BY BROWSER', 'warn');
      }
    } else {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen;
      if (exit) exit.call(doc);
    }
  },

  _destroy() {
    this.disposers.forEach((d) => d());
    AudioFX.stopMusic();
    this.scene.dispose();
    EventBus.clear();
  }
};

export function boot(stage) {
  return UIManager.init(stage);
}

export default UIManager;
