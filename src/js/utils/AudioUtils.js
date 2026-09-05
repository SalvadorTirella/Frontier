/* ============================================================
   AudioUtils — WebAudio synth SFX + adaptive music beds
   ============================================================ */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.volumes = { master: 0.8, music: 0.55, sfx: 0.85 };
    this.musicNodes = [];
    this.musicTimer = null;
    this.musicMode = null;
    this.lastPlay = {};
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this._noiseBuf = this._makeNoise();
      this.setVolumes(this.volumes.master * 100, this.volumes.music * 100, this.volumes.sfx * 100);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setVolumes(master, music, sfx) {
    this.volumes = { master: master / 100, music: music / 100, sfx: sfx / 100 };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(Math.pow(this.volumes.master, 1.6), t, 0.05);
    this.musicBus.gain.setTargetAtTime(Math.pow(this.volumes.music, 1.4) * 0.5, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(Math.pow(this.volumes.sfx, 1.4), t, 0.05);
  }

  /* throttle identical sfx to protect the mix */
  _gate(name, ms) {
    const now = performance.now();
    if (this.lastPlay[name] && now - this.lastPlay[name] < ms) return false;
    this.lastPlay[name] = now;
    return true;
  }

  _tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.1, gain = 0.2, delay = 0, bus = 'sfx' }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(bus === 'sfx' ? this.sfxBus : this.musicBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise({ dur = 0.1, gain = 0.2, freq = 1000, q = 0.8, type = 'bandpass', delay = 0, sweepTo = null }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t0);
    if (sweepTo) filt.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  sfx(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'hover': this._tone({ type: 'sine', f0: 620, dur: 0.045, gain: 0.05 }); break;
      case 'click': this._tone({ type: 'square', f0: 660, f1: 920, dur: 0.06, gain: 0.12 }); break;
      case 'back':  this._tone({ type: 'square', f0: 520, f1: 320, dur: 0.07, gain: 0.1 }); break;
      case 'error':
        this._tone({ type: 'sawtooth', f0: 150, f1: 110, dur: 0.14, gain: 0.16 });
        this._tone({ type: 'sawtooth', f0: 112, f1: 84, dur: 0.16, gain: 0.14, delay: 0.02 });
        break;
      case 'buy':
        this._tone({ type: 'sine', f0: 520, dur: 0.06, gain: 0.14 });
        this._tone({ type: 'sine', f0: 784, dur: 0.08, gain: 0.14, delay: 0.06 });
        break;
      case 'deploy': this._noise({ dur: 0.12, gain: 0.14, freq: 500, sweepTo: 180, type: 'lowpass' }); break;
      case 'shot':
        if (!this._gate('shot', 55)) return;
        this._noise({ dur: 0.05, gain: 0.07, freq: 2400, q: 1.2 });
        this._tone({ type: 'square', f0: 880, f1: 240, dur: 0.045, gain: 0.05 });
        break;
      case 'cannon':
        if (!this._gate('cannon', 90)) return;
        this._noise({ dur: 0.2, gain: 0.2, freq: 900, sweepTo: 120, type: 'lowpass' });
        this._tone({ type: 'sine', f0: 130, f1: 45, dur: 0.22, gain: 0.2 });
        break;
      case 'explode':
        if (!this._gate('explode', 80)) return;
        this._noise({ dur: 0.34, gain: 0.24, freq: 700, sweepTo: 70, type: 'lowpass' });
        this._tone({ type: 'sine', f0: 110, f1: 38, dur: 0.3, gain: 0.22 });
        break;
      case 'hit':
        if (!this._gate('hit', 60)) return;
        this._tone({ type: 'triangle', f0: 240, f1: 140, dur: 0.05, gain: 0.07 });
        break;
      case 'wave':
        this._tone({ type: 'sawtooth', f0: 196, dur: 0.5, gain: 0.1 });
        this._tone({ type: 'sawtooth', f0: 294, dur: 0.5, gain: 0.1, delay: 0.03 });
        this._tone({ type: 'sawtooth', f0: 392, dur: 0.34, gain: 0.1, delay: 0.24 });
        break;
      case 'combo': this._tone({ type: 'sine', f0: 880, f1: 1320, dur: 0.09, gain: 0.12 }); break;
      case 'airstrike':
        this._noise({ dur: 0.7, gain: 0.2, freq: 3000, sweepTo: 200, type: 'bandpass', q: 2 });
        this._tone({ type: 'sine', f0: 90, f1: 30, dur: 0.6, gain: 0.26, delay: 0.15 });
        break;
      case 'victory':
        [523, 659, 784, 1046].forEach((f, i) => this._tone({ type: 'square', f0: f, dur: 0.22, gain: 0.12, delay: i * 0.13 }));
        break;
      case 'defeat':
        [392, 311, 233, 155].forEach((f, i) => this._tone({ type: 'sawtooth', f0: f, dur: 0.3, gain: 0.12, delay: i * 0.17 }));
        break;
      case 'rankup':
        [660, 880, 990, 1320].forEach((f, i) => this._tone({ type: 'sine', f0: f, dur: 0.18, gain: 0.14, delay: i * 0.08 }));
        break;
      default: break;
    }
  }

  /* ---------- music beds ---------- */
  startMusic(mode) {
    this.unlock();
    if (!this.ctx || this.musicMode === mode) return;
    this.stopMusic();
    this.musicMode = mode;
    const t0 = this.ctx.currentTime;

    // shared drone
    const mkDrone = (f, detune, gain) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = detune;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 320;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 2.5);
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 120;
      lfo.connect(lfoG); lfoG.connect(flt.frequency);
      o.connect(flt); flt.connect(g); g.connect(this.musicBus);
      o.start(); lfo.start();
      this.musicNodes.push(o, lfo, g);
    };
    mkDrone(55, 0, 0.16);
    mkDrone(110.4, 6, 0.1);

    if (mode === 'battle') {
      const bass = [82.4, 82.4, 98, 73.4, 82.4, 110, 98, 73.4];
      let step = 0;
      this.musicTimer = setInterval(() => {
        if (!this.ctx) return;
        const f = bass[step % bass.length];
        this._tone({ type: 'square', f0: f, dur: 0.16, gain: 0.075, bus: 'music' });
        if (step % 4 === 0) this._tone({ type: 'sine', f0: 41, dur: 0.2, gain: 0.14, bus: 'music' });
        step++;
      }, 235);
    } else {
      const scale = [220, 261.6, 293.7, 329.6, 392, 440];
      this.musicTimer = setInterval(() => {
        if (!this.ctx || Math.random() < 0.35) return;
        const f = scale[Math.floor(Math.random() * scale.length)];
        this._tone({ type: 'sine', f0: f, dur: 1.6, gain: 0.035, bus: 'music' });
      }, 2600);
    }
  }

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    this.musicNodes.forEach((n) => {
      try {
        if (n.gain) n.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
        n.stop ? n.stop(this.ctx.currentTime + 1.2) : null;
      } catch (e) { /* noop */ }
    });
    this.musicNodes = [];
    this.musicMode = null;
  }
}

const AudioFX = new AudioManager();
export default AudioFX;
