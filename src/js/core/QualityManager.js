/* ============================================================
   QualityManager — graphic optimizer (presets + custom toggles)
   ============================================================ */
import StateManager from './StateManager.js';
import SaveManager from './SaveManager.js';
import EventBus from './EventBus.js';
import { QUALITY_PRESETS } from './Config.js';

const QualityManager = {
  applyPreset(presetName) {
    const preset = QUALITY_PRESETS[presetName];
    if (!preset) return;
    StateManager.merge('settings', {
      quality: presetName,
      particles: preset.particles,
      glow: preset.glow,
      shadows: preset.shadows
    });
    this.syncBodyClasses();
    SaveManager.saveSettings();
    EventBus.emit('quality:changed', {
      preset: presetName,
      config: { ...preset, hardwareScaling: StateManager.get('settings.hardwareScaling', preset.hardwareScaling) }
    });
    EventBus.emit('settings:changed', StateManager.get('settings'));
  },

  applyToggle(key, value) {
    StateManager.set(`settings.${key}`, value);
    // manual tweak switches preset indicator to CUSTOM
    if (['particles', 'glow', 'shadows'].includes(key) && StateManager.get('settings.quality') !== 'CUSTOM') {
      StateManager.set('settings.quality', 'CUSTOM');
    }
    this.syncBodyClasses();
    SaveManager.saveSettings();
    EventBus.emit('settings:changed', StateManager.get('settings'));
  },

  applyVolume(key, value) {
    StateManager.set(`settings.${key}`, value);
    SaveManager.saveSettings();
    EventBus.emit('audio:changed', { key, value });
  },

  applyScaling(level) {
    StateManager.set('settings.hardwareScaling', level);
    SaveManager.saveSettings();
    EventBus.emit('quality:changed', {
      preset: StateManager.get('settings.quality'),
      config: {
        particles: StateManager.get('settings.particles'),
        glow: StateManager.get('settings.glow'),
        shadows: StateManager.get('settings.shadows'),
        hardwareScaling: level
      },
      auto: true
    });
  },

  syncBodyClasses() {
    const s = StateManager.get('settings');
    const b = document.body.classList;
    b.toggle('no-particles', !s.particles);
    b.toggle('no-glow', !s.glow);
    b.toggle('no-bganim', !s.bgAnim);
    b.toggle('no-shake', !s.screenShake);
  },

  currentConfig() {
    const s = StateManager.get('settings');
    const preset = QUALITY_PRESETS[s.quality];
    return {
      particles: s.particles,
      glow: s.glow,
      shadows: s.shadows,
      hardwareScaling: preset ? preset.hardwareScaling : (s.hardwareScaling || 1)
    };
  }
};

export default QualityManager;
