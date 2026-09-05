/* ============================================================
   MainMenu — command console: title, actions, operative file
   ============================================================ */
import EventBus from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';
import SaveManager from '../core/SaveManager.js';
import QualityManager from '../core/QualityManager.js';
import modalManager from './ModalManager.js';
import { make, on, setTxt } from '../utils/DOMUtils.js';
import { staggerIn } from '../utils/AnimationUtils.js';
import AudioFX from '../utils/AudioUtils.js';
import { rankForXp, RANKS, BATTLE } from '../core/Config.js';

const AVATAR_SVG = `
<svg viewBox="0 0 64 64" fill="none">
  <path d="M32 6 56 18v24L32 58 8 42V18z" stroke="rgba(0,198,255,.5)" stroke-width="2"/>
  <path d="M32 14c-6 0-10 4.4-10 10.4V29h20v-4.6C42 18.4 38 14 32 14z" fill="rgba(0,198,255,.16)" stroke="#00C6FF" stroke-width="2"/>
  <path d="M22 24.5h20" stroke="#FFD700" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M15 50c1-8.4 8-13 17-13s16 4.6 17 13" fill="rgba(0,198,255,.12)" stroke="#00C6FF" stroke-width="2"/>
  <path d="M27 40.5h10v5H27z" fill="rgba(255,215,0,.25)" stroke="#FFD700" stroke-width="1.4"/>
</svg>`;

export default class MainMenu {
  init(el, ctx) {
    this.el = el;
    this.ctx = ctx;
    this._build();
    this._bind();
    EventBus.on('profile:updated', () => this.renderProfile());
    EventBus.on('screen:changed', ({ id }) => {
      if (id === 'main-menu') this.onEnter();
    });
  }

  _build() {
    this.el.innerHTML = `
    <div class="menu-grid">
      <div class="menu-left">
        <div class="menu-eyebrow mono" data-anim><span class="blink-dot"></span> SECTOR 7 // COMMAND CONSOLE — UPLINK SECURE</div>
        <h1 class="menu-title" data-anim>TACTICAL<br/><em>ARMY</em> <span>BATTLE</span></h1>
        <div class="menu-tag" data-anim>REAL-TIME ARMY COMMAND // BUILD — DEPLOY — PREVAIL</div>
        <nav class="menu-nav">
          <button class="menu-btn primary" data-action="deploy" data-anim>
            <span class="idx mono">01</span>
            <span class="m-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4.5 19 12 5 19.5z"/></svg></span>
            <span class="m-lbl">DEPLOY TO COMBAT<small>5 WAVES · DESTROY ENEMY HQ</small></span>
            <span class="m-arrow">›</span>
          </button>
          <button class="menu-btn" data-action="settings" data-anim>
            <span class="idx mono">02</span>
            <span class="m-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" stroke-linecap="round"/></svg></span>
            <span class="m-lbl">SETTINGS & OPTIMIZER<small>GRAPHICS · AUDIO · DISPLAY</small></span>
            <span class="m-arrow">›</span>
          </button>
          <button class="menu-btn" data-action="artbible" data-anim>
            <span class="idx mono">03</span>
            <span class="m-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 5h18v11H3z" stroke-linejoin="round"/><path d="M8 21h8M12 16v5" stroke-linecap="round"/><path d="M6.5 12.5 10 9l2.5 2.5L17 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            <span class="m-lbl">VISUAL BIBLE<small>ART DIRECTION · PALETA · KEYFRAMES</small></span>
            <span class="m-arrow">›</span>
          </button>
          <button class="menu-btn" data-action="manual" data-anim>
            <span class="idx mono">04</span>
            <span class="m-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M9 8.5h6M9 12h6" stroke-linecap="round"/></svg></span>
            <span class="m-lbl">FIELD MANUAL<small>CONTROLS & DOCTRINE</small></span>
            <span class="m-arrow">›</span>
          </button>
          <button class="menu-btn danger" data-action="reset" data-anim>
            <span class="idx mono">05</span>
            <span class="m-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l1 13h9l1-13" stroke-linecap="round"/></svg></span>
            <span class="m-lbl">PURGE SAVE DATA<small>WIPE LOCAL RECORDS</small></span>
            <span class="m-arrow">›</span>
          </button>
        </nav>
        <div class="menu-hints mono" data-anim>[1–9] REQUISITION &nbsp;·&nbsp; [Z·X·C] HEROES &nbsp;·&nbsp; [V·B·N·M] STRUCTURES &nbsp;·&nbsp; [U] RESEARCH &nbsp;·&nbsp; [SPACE] AIRSTRIKE</div>
      </div>
      <aside class="menu-right">
        <div class="profile-panel panel-frame chamfer tech-frame amber-c" data-anim>
          <div class="pp-head"><span class="pp-title">OPERATIVE FILE</span><span class="pp-secure mono">CLEARANCE LVL 3</span></div>
          <div class="pp-id">
            <div class="pp-avatar">${AVATAR_SVG}<i class="avatar-scan"></i></div>
            <div class="pp-meta">
              <span class="pp-callsign" id="mm-callsign">GHOST-7</span>
              <span class="pp-rankchip mono" id="mm-rank">SERGEANT</span>
              <span class="pp-xpline mono"><b id="mm-xp">0</b> XP · NEXT: <span id="mm-next">—</span></span>
            </div>
          </div>
          <div class="xp-track chamfer-sm"><i id="mm-xpbar"></i><b class="mono" id="mm-xppct">0%</b></div>
          <div class="pp-stats">
            <div class="pp-stat"><span class="mono" id="mm-bestwave">0</span><label>BEST WAVE</label></div>
            <div class="pp-stat"><span class="mono" id="mm-kills">0</span><label>KILLS</label></div>
            <div class="pp-stat"><span class="mono" id="mm-wins">0</span><label>VICTORIES</label></div>
            <div class="pp-stat"><span class="mono" id="mm-deployed">0</span><label>DEPLOYED</label></div>
          </div>
        </div>
        <div class="system-row" data-anim>
          <button class="sys-chip chamfer-sm mono" id="mm-fullscreen">⛶ FULLSCREEN</button>
          <span class="sys-chip static mono">BUILD 2.7.1 — LOCAL SAVE ACTIVE</span>
        </div>
      </aside>
    </div>`;
  }

  _bind() {
    this.el.querySelectorAll('.menu-btn').forEach((btn) => {
      on(btn, 'mouseenter', () => AudioFX.sfx('hover'));
      on(btn, 'click', () => this._action(btn.dataset.action));
    });
    this.fsChip = this.el.querySelector('#mm-fullscreen');
    on(this.fsChip, 'click', () => {
      AudioFX.sfx('click');
      this.ctx.toggleFullscreen();
    });
    EventBus.on('fullscreen:changed', ({ active }) => {
      this.fsChip.textContent = active ? '⛶ EXIT FULLSCREEN' : '⛶ FULLSCREEN';
      this.fsChip.classList.toggle('fs-on', active);
    });
  }

  async _action(action) {
    AudioFX.sfx('click');
    switch (action) {
      case 'deploy':
        EventBus.emit('battle:request');
        break;
      case 'settings':
        EventBus.emit('settings:open', { from: 'main-menu' });
        break;
      case 'artbible':
        EventBus.emit('artbible:open');
        break;
      case 'manual':
        modalManager.open({
          title: 'FIELD MANUAL — COMBAT DOCTRINE',
          body: `
            <div class="manual-grid">
              <div><b class="amber">OBJECTIVE</b><p>Survive all ${BATTLE.finalWave} assault waves and demolish the enemy HQ before your base integrity reaches zero.</p></div>
              <div><b class="cyan">ECONOMY</b><p>Credits flow in automatically and spike with every kill — chain kills fast to stack a <b>COMBO</b> multiplier.</p></div>
              <div><b class="cyan">REQUISITION [1–9]</b><p>FRONT: Heavy (shield) & Tank. MIDDLE: Rifleman, Gunner, Grenadier (arc), Flamer (short-range torrent). BACK: Sniper (crits), RPG (anti-armor), Artillery (cross-lane).</p></div>
              <div><b class="amber">LANES [Q/W/E · ←→]</b><p>Three parallel corridors. Pick the active lane before buying — or click the battlefield. Units form ranks: heavies lead, infantry holds, specialists support from the rear.</p></div>
              <div><b class="cyan">COMMAND RAIL</b><p>[Z/X/C] deploy Medic, Vanguard or Warlord heroes — auras, ultimates, one alive each. [V/B/N/M] place sandbags, barricades, turrets and mines. [U] opens Field Research: weapons, armor and logistics upgrades apply to every unit, alive and future.</p></div>
              <div><b class="cyan">COVER & BALLISTICS</b><p>Sandbags and barricades soak damage and can stop tracers — but shells arc over them. Tanks and Heavies resist kinetic fire, yet crack under explosives; RPGs hunt armor. BACK-row units can land HEADSHOTS on FRONT-row heavies.</p></div>
              <div><b class="red">THE WARBRINGER</b><p>The final wave drops a boss in the center lane. Telegraphed red zones mark its mortar strikes — pull your infantry back and focus fire.</p></div>
              <div><b class="amber">AIRSTRIKE [SPACE]</b><p>Levels a grid square on a 25s cycle. Save it for armored pushes or base sieges.</p></div>
              <div><b class="cyan">SUPPLY</b><p>Every unit consumes supply. A saturated field locks requisition — spend wisely.</p></div>
              <div><b class="cyan">COMMAND [P / ESC]</b><p>Suspends the operation. Settings can be tuned mid-combat without losing progress.</p></div>
            </div>`,
          actions: [{ label: 'UNDERSTOOD', cls: 'btn-primary' }]
        });
        break;
      case 'reset': {
        const ok = await modalManager.confirm({
          title: 'PURGE SAVE DATA',
          body: 'This wipes your operative record, rank and settings stored on this device. The action cannot be undone.',
          confirmLabel: 'PURGE',
          danger: true
        });
        if (ok) {
          SaveManager.resetAll();
          QualityManager.syncBodyClasses();
          modalManager.toast('SAVE DATA PURGED — RECORDS RESET');
        }
        break;
      }
    }
  }

  renderProfile() {
    const p = StateManager.get('profile');
    const r = rankForXp(p.xp);
    setTxt(this.el.querySelector('#mm-callsign'), p.callsign);
    setTxt(this.el.querySelector('#mm-rank'), r.name);
    setTxt(this.el.querySelector('#mm-xp'), p.xp.toLocaleString());
    setTxt(this.el.querySelector('#mm-next'), r.next ? `${r.next.name} @ ${r.next.xp.toLocaleString()}` : 'MAX RANK');
    setTxt(this.el.querySelector('#mm-xppct'), `${Math.round(r.pct * 100)}%`);
    this.el.querySelector('#mm-xpbar').style.width = `${Math.max(2, r.pct * 100)}%`;
    setTxt(this.el.querySelector('#mm-bestwave'), p.bestWave);
    setTxt(this.el.querySelector('#mm-kills'), p.kills.toLocaleString());
    setTxt(this.el.querySelector('#mm-wins'), p.wins);
    setTxt(this.el.querySelector('#mm-deployed'), p.deployed.toLocaleString());
  }

  onEnter() {
    this.renderProfile();
    staggerIn(this.el, '[data-anim]', 70);
  }
}
