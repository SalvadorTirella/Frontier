/* ============================================================
   PauseMenu — suspended-operation overlay with depth blur
   ============================================================ */
import EventBus from '../core/EventBus.js';
import modalManager from './ModalManager.js';
import { make, on } from '../utils/DOMUtils.js';
import AudioFX from '../utils/AudioUtils.js';

export default class PauseMenu {
  init(el, ctx) {
    this.el = el;
    this.ctx = ctx;
    this._build();
  }

  _build() {
    const panel = make('div', 'pause-panel panel-frame chamfer');
    panel.innerHTML = `
      <div class="pause-stripe"></div>
      <div class="pause-eyebrow mono">// OPERATION SUSPENDED</div>
      <h2 class="pause-title display">STAND BY</h2>
      <div class="pause-stats mono" id="pause-stats">WAVE — · KILLS — · CREDITS —</div>
      <div class="pause-actions">
        <button class="btn-holo btn-primary big" data-pa="resume"><span>RESUME OPERATION</span></button>
        <button class="btn-holo big" data-pa="settings"><span>SETTINGS & OPTIMIZER</span></button>
        <button class="btn-holo big" data-pa="restart"><span>RESTART MISSION</span></button>
        <button class="btn-holo btn-danger big" data-pa="abort"><span>ABORT TO COMMAND</span></button>
      </div>
      <div class="pause-foot mono">SIMULATION FROZEN — RESOURCES & POSITION PRESERVED</div>`;
    this.el.appendChild(panel);
    this.statsEl = panel.querySelector('#pause-stats');

    panel.querySelectorAll('[data-pa]').forEach((btn) => {
      on(btn, 'mouseenter', () => AudioFX.sfx('hover'));
      on(btn, 'click', () => this._action(btn.dataset.pa));
    });
  }

  refreshStats(stats) {
    if (!stats) return;
    this.statsEl.textContent = `WAVE ${stats.wave} · KILLS ${stats.kills} · CREDITS ${Math.floor(stats.credits)} · LOSSES ${stats.losses}`;
  }

  async _action(a) {
    AudioFX.sfx('click');
    switch (a) {
      case 'resume':
        EventBus.emit('battle:resumeRequest');
        break;
      case 'settings':
        EventBus.emit('settings:open', { from: 'pause' });
        break;
      case 'restart': {
        const ok = await modalManager.confirm({
          title: 'RESTART MISSION',
          body: 'Current progress in this operation will be discarded and the battle restarted from Wave 1.',
          confirmLabel: 'RESTART',
          danger: true
        });
        if (ok) EventBus.emit('battle:restartRequest');
        break;
      }
      case 'abort': {
        const ok = await modalManager.confirm({
          title: 'ABORT MISSION',
          body: 'Withdraw from combat and return to the command console? The current operation will be lost.',
          confirmLabel: 'ABORT',
          danger: true
        });
        if (ok) EventBus.emit('battle:abortRequest');
        break;
      }
    }
  }
}
