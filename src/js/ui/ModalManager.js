/* ============================================================
   ModalManager — generic popups, confirms and toasts
   ============================================================ */
import { make, on } from '../utils/DOMUtils.js';
import AudioFX from '../utils/AudioUtils.js';

class ModalManager {
  init(root) {
    this.root = root;
  }

  open({ title, body, actions = [{ label: 'OK' }], danger = false }) {
    return new Promise((resolve) => {
      this.close();
      const wrap = make('div', 'modal-backdrop');
      const panel = make('div', `modal panel-frame chamfer ${danger ? 'modal-danger' : ''}`);
      panel.innerHTML = `
        <div class="modal-head">
          <span class="modal-dot"></span>
          <h3>${title}</h3>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-actions"></div>`;
      const actionsEl = panel.querySelector('.modal-actions');
      actions.forEach((a, i) => {
        const btn = make('button', `btn-holo chamfer-sm ${a.cls || ''}`, `<span>${a.label}</span>`);
        on(btn, 'click', () => {
          AudioFX.sfx('click');
          this.close();
          resolve(a.value !== undefined ? a.value : i);
        });
        on(btn, 'mouseenter', () => AudioFX.sfx('hover'));
        actionsEl.appendChild(btn);
      });
      wrap.appendChild(panel);
      on(wrap, 'click', (e) => {
        if (e.target === wrap) {
          this.close();
          resolve(null);
        }
      });
      this.root.appendChild(wrap);
      requestAnimationFrame(() => wrap.classList.add('in'));
    });
  }

  confirm({ title, body, confirmLabel = 'CONFIRM', cancelLabel = 'CANCEL', danger = false }) {
    return this.open({
      title,
      body,
      danger,
      actions: [
        { label: cancelLabel, cls: 'btn-ghost' , value: false },
        { label: confirmLabel, cls: danger ? 'btn-danger' : 'btn-primary', value: true }
      ]
    });
  }

  close() {
    this.root.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
  }

  toast(msg, cls = '') {
    let layer = this.root.querySelector('.toast-layer');
    if (!layer) {
      layer = make('div', 'toast-layer');
      this.root.appendChild(layer);
    }
    const t = make('div', `toast chamfer-sm ${cls}`, `<span class="toast-bar"></span>${msg}`);
    layer.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => {
      t.classList.remove('in');
      t.classList.add('out');
      setTimeout(() => t.remove(), 400);
    }, 2400);
  }
}

const modalManager = new ModalManager();
export default modalManager;
