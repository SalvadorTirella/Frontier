/* ============================================================
   HUD — top command bar, bottom deploy bar, banners, fx layer
   ============================================================ */
import EventBus from '../core/EventBus.js';
import { make, on, setTxt, pad2 } from '../utils/DOMUtils.js';
import { animateNumber, retrigger, spawnFloat } from '../utils/AnimationUtils.js';
import AudioFX from '../utils/AudioUtils.js';
import { UNIT_TYPES, ABILITY, ECONOMY, LANE_KEYS } from '../core/Config.js';

const ICONS = {
  rifleman: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 2.6c-3.1 0-5.2 2.3-5.2 5.4v2.2h10.4V8c0-3.1-2.1-5.4-5.2-5.4z"/><path d="M6.8 10.2h10.4" stroke-linecap="round"/><path d="M3.6 21.4c.5-4.3 4-6.6 8.4-6.6s7.9 2.3 8.4 6.6z"/></svg>`,
  gunner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="7.2"/><path d="M12 1.8v4M12 18.2v4M1.8 12h4M18.2 12h4" stroke-linecap="round"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>`,
  tank: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M13.5 9.5H8.8L7 12.6h6.5z"/><path d="M13.5 10.6h7" stroke-linecap="round"/><rect x="3" y="12.6" width="18" height="4.6" rx="1.2"/><circle cx="7" cy="19.6" r="1.5"/><circle cx="12" cy="19.6" r="1.5"/><circle cx="17" cy="19.6" r="1.5"/></svg>`,
  artillery: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9.5 14.5 17 4.8l2.2 1.7-7.2 9.4z"/><path d="M5 20.5h14" stroke-linecap="round"/><path d="M7.5 17.5h6" stroke-linecap="round"/><circle cx="18.6" cy="3.4" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  airstrike: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 2.5 15 15l-3-2.2L9 15z"/><path d="M12 12.8v8.7" stroke-linecap="round"/><path d="M4 8.5h4M3 12h3M4.5 15.5h2.7" stroke-linecap="round" opacity=".7"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>`,
  credits: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 2.8 20 7v10l-8 4.2L4 17V7z"/><path d="M12 7.5v9M8.5 9.5l7 5M15.5 9.5l-7 5" opacity=".8"/></svg>`
};

export function unitIcon(id, size = 26) {
  return `<span class="uicon" style="width:${size}px;height:${size}px">${ICONS[id] || ''}</span>`;
}

export default class HUD {
  init(battleEl) {
    this.el = battleEl;
    this.refs = {};
    this._buildTop();
    this._buildBottom();
    this._buildOverlays();
    this._bind();
  }

  /* ---------------- TOP BAR ---------------- */
  _buildTop() {
    const top = make('div', 'hud-top hud-panel');
    top.innerHTML = `
      <div class="hud-left">
        <div class="meter-block player">
          <span class="meter-label">BASE INTEGRITY</span>
          <div class="bar seg bar-green"><i id="hp-player" style="width:100%"></i></div>
        </div>
        <div class="credits-chip">
          ${ICONS.credits}
          <div class="chip-col">
            <span class="chip-label">CREDITS</span>
            <span id="hud-credits" class="chip-value mono amber">0</span>
          </div>
        </div>
        <div class="supply-chip">
          <div class="chip-col">
            <span class="chip-label">SUPPLY</span>
            <span id="hud-supply" class="chip-value mono">0/${ECONOMY.supplyCap}</span>
          </div>
        </div>
      </div>
      <div class="hud-center">
        <div class="wave-chip">
          <span class="wave-eyebrow">OPERATION IRONVEIL</span>
          <span class="wave-main"><em>WAVE</em> <b id="hud-wave" class="display">1/5</b></span>
        </div>
        <div class="hostiles-chip">
          <span class="chip-label">HOSTILES</span>
          <span id="hud-hostiles" class="chip-value mono red">0</span>
        </div>
      </div>
      <div class="hud-right">
        <div id="hud-combo" class="combo-chip hidden">
          <span id="hud-combo-n" class="display">x2</span>
          <span class="combo-label">COMBO</span>
          <span id="hud-combo-timer" class="combo-timer"><i></i></span>
        </div>
        <div class="meter-block enemy">
          <span class="meter-label">ENEMY HQ</span>
          <div class="bar seg bar-red"><i id="hp-enemy" style="width:100%"></i></div>
        </div>
        <button id="hud-pause-btn" class="icon-btn chamfer-sm" title="Pause [P]">${ICONS.pause}</button>
      </div>`;
    this.el.appendChild(top);
    ['hp-player', 'hud-credits', 'hud-supply', 'hud-wave', 'hud-hostiles', 'hud-combo', 'hud-combo-n', 'hud-combo-timer', 'hp-enemy', 'hud-pause-btn'].forEach((id) => {
      this.refs[id] = top.querySelector(`#${id}`);
    });
  }

  /* ---------------- BOTTOM BAR ---------------- */
  _buildBottom() {
    const bottom = make('div', 'hud-bottom hud-panel');

    const reserves = make('div', 'reserves');
    reserves.innerHTML = `<span class="block-label">FIELD UNITS</span>`;
    this.reserveSlots = {};
    UNIT_TYPES.forEach((u) => {
      const slot = make('div', 'reserve-slot chamfer-sm', `${unitIcon(u.id, 22)}<b class="mono" id="res-${u.id}">0</b>`);
      reserves.appendChild(slot);
      this.reserveSlots[u.id] = slot.querySelector('b');
    });
    bottom.appendChild(reserves);

    const ability = make('button', 'ability chamfer', `
      <span class="ability-icon">${ICONS.airstrike}</span>
      <span class="ability-name">${ABILITY.name}</span>
      <span class="ability-key mono">[SPACE]</span>
      <span class="ability-cd"></span>`);
    bottom.appendChild(ability);
    this.refs.ability = ability;

    // lane picker (Milestone 2)
    const lanePicker = make('div', 'lane-picker');
    lanePicker.innerHTML = `<span class="block-label">DEPLOY LANE</span><div class="lane-chips"></div>`;
    bottom.appendChild(lanePicker);
    this.laneChipsEl = lanePicker.querySelector('.lane-chips');
    on(lanePicker, 'mouseleave', () => EventBus.emit('lane:hover', { id: null }));

    const shop = make('div', 'shop');
    shop.innerHTML = `<span class="block-label">REQUISITION</span>`;
    this.cards = {};
    UNIT_TYPES.forEach((u) => {
      const card = make('button', 'buy-card chamfer-sm', `
        <span class="card-hotkey mono">${u.hotkey}</span>
        <span class="card-icon">${unitIcon(u.id, 30)}</span>
        <span class="card-name">${u.name}</span>
        <span class="card-cost mono">CR ${u.cost}</span>
        <span class="card-stats mono">HP ${u.hp} · DMG ${u.dmg} · RNG ${u.range}</span>
        <span class="card-cool"></span>
        <span class="card-flash"></span>`);
      card.dataset.unit = u.id;
      shop.appendChild(card);
      this.cards[u.id] = card;
    });
    bottom.appendChild(shop);

    this.el.appendChild(bottom);
  }

  /* ---------------- BANNERS & FX ---------------- */
  _buildOverlays() {
    this.refs.banner = make('div', 'wave-banner hidden', `<div class="banner-stripe"></div><div class="banner-main display"></div><div class="banner-sub mono"></div><div class="banner-stripe"></div>`);
    this.refs.announce = make('div', 'announce hidden', ``);
    this.refs.fx = make('div', 'fx-layer');
    this.el.appendChild(this.refs.banner);
    this.el.appendChild(this.refs.announce);
    this.el.appendChild(this.refs.fx);
  }

  _bind() {
    Object.entries(this.cards).forEach(([id, card]) => {
      on(card, 'click', () => EventBus.emit('buy:unit', { id }));
      on(card, 'mouseenter', () => { if (!card.classList.contains('is-disabled')) AudioFX.sfx('hover'); });
    });
    on(this.refs.ability, 'click', () => EventBus.emit('ability:use', { id: ABILITY.id }));
    on(this.refs.ability, 'mouseenter', () => AudioFX.sfx('hover'));
    on(this.refs['hud-pause-btn'], 'click', () => EventBus.emit('battle:pauseRequest'));
  }

  /* ---------------- PUBLIC API ---------------- */
  setCredits(v, animate = true) {
    const el = this.refs['hud-credits'];
    if (animate) animateNumber(el, Math.floor(v), { dur: 260 });
    else { el.textContent = Math.floor(v); el.dataset.v = Math.floor(v); }
  }

  gainFlash() {
    retrigger(this.refs['hud-credits'], 'gain-pop', 450);
  }

  setSupply(cur, max) {
    setTxt(this.refs['hud-supply'], `${cur}/${max}`);
    this.refs['hud-supply'].classList.toggle('warn', cur >= max);
  }

  setWave(i, total) {
    setTxt(this.refs['hud-wave'], `${i}/${total}`);
    retrigger(this.refs['hud-wave'], 'gain-pop', 500);
  }

  setHostiles(n) {
    setTxt(this.refs['hud-hostiles'], pad2(n));
  }

  setBaseHP(side, pct) {
    const el = this.refs[side === 'player' ? 'hp-player' : 'hp-enemy'];
    el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    const bar = el.parentElement;
    bar.classList.toggle('bar-low', pct < 30);
    if (pct < 30) retrigger(bar, 'bar-alarm', 900);
  }

  setCombo(n, timerPct) {
    const chip = this.refs['hud-combo'];
    if (n < 2) {
      chip.classList.add('hidden');
      return;
    }
    chip.classList.remove('hidden');
    setTxt(this.refs['hud-combo-n'], `x${n}`);
    this.refs['hud-combo-timer'].querySelector('i').style.width = `${timerPct * 100}%`;
    retrigger(this.refs['hud-combo-n'], 'combo-pop', 380);
  }

  setReserve(id, count) {
    if (this.reserveSlots[id]) setTxt(this.reserveSlots[id], count);
  }

  updateShop(credits, supplyLeft) {
    UNIT_TYPES.forEach((u) => {
      const card = this.cards[u.id];
      const disabled = credits < u.cost || supplyLeft < u.supply;
      card.classList.toggle('is-disabled', disabled);
      card.classList.toggle('no-supply', supplyLeft < u.supply && credits >= u.cost);
    });
  }

  flashError(id, reason = 'funds') {
    const card = this.cards[id];
    if (!card) return;
    card.classList.remove('error-flash');
    void card.offsetWidth;
    card.classList.add('error-flash');
    card.dataset.err = reason === 'supply' ? 'SUPPLY FULL' : 'INSUFFICIENT CR';
    AudioFX.sfx('error');
    setTimeout(() => card.classList.remove('error-flash'), 550);
  }

  pulseCard(id) {
    const card = this.cards[id];
    if (!card) return;
    const cool = card.querySelector('.card-cool');
    cool.classList.remove('sweep');
    void cool.offsetWidth;
    cool.classList.add('sweep');
  }

  setAbility(ratio, ready) {
    const btn = this.refs.ability;
    btn.style.setProperty('--cd', ratio.toFixed(3));
    btn.classList.toggle('charging', !ready);
    btn.classList.toggle('ready-pulse', ready);
  }

  /* ---------------- lane picker (Milestone 2) ---------------- */

  /**
   * Rebuilds the lane chips for the current topology.
   * @param {number} count
   * @param {string[]} [letters]
   */
  setLaneCount(count, letters = ['A', 'B', 'C', 'D', 'E']) {
    if (!this.laneChipsEl) return;
    this.laneChipsEl.innerHTML = '';
    this.laneChips = [];
    const keyLabels = ['Q', 'W', 'E', 'R', 'T'];
    for (let i = 0; i < count; i++) {
      const chip = make('button', 'lane-chip chamfer-sm mono', `${letters[i] || i + 1}<span>${keyLabels[i] || ''}</span>`);
      chip.dataset.lane = i;
      on(chip, 'click', () => EventBus.emit('lane:select', { id: i }));
      on(chip, 'mouseenter', () => EventBus.emit('lane:hover', { id: i }));
      this.laneChipsEl.appendChild(chip);
      this.laneChips.push(chip);
    }
  }

  /** @param {number|null} id */
  setSelectedLane(id) {
    if (!this.laneChips) return;
    this.laneChips.forEach((c, i) => c.classList.toggle('is-selected', i === id));
  }

  /** @param {number|null} id */
  setHoverLane(id) {
    if (!this.laneChips) return;
    this.laneChips.forEach((c, i) => c.classList.toggle('is-hover', i === id));
  }

  showBanner(main, sub = '', cls = '') {
    const b = this.refs.banner;
    b.className = `wave-banner ${cls}`;
    b.querySelector('.banner-main').textContent = main;
    b.querySelector('.banner-sub').textContent = sub;
    void b.offsetWidth;
    b.classList.add('play');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.remove('play'), 2300);
  }

  announce(text, cls = '') {
    const a = this.refs.announce;
    a.textContent = text;
    a.className = `announce ${cls}`;
    void a.offsetWidth;
    a.classList.add('play');
    clearTimeout(this._annT);
    this._annT = setTimeout(() => a.classList.remove('play'), 1800);
  }

  float(stageX, stageY, text, cls = '') {
    spawnFloat(this.refs.fx, stageX, stageY, text, cls);
  }

  setVisible(v) {
    this.el.classList.toggle('hud-live', v);
  }
}
