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
      /* ---------- UI ---------- */
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
      case 'upgrade':
        [440, 554, 659, 880].forEach((f, i) => this._tone({ type: 'sine', f0: f, dur: 0.12, gain: 0.1, delay: i * 0.06 }));
        break;
      case 'hero':
        this._tone({ type: 'sawtooth', f0: 196, f1: 392, dur: 0.3, gain: 0.1 });
        this._tone({ type: 'sine', f0: 784, dur: 0.4, gain: 0.08, delay: 0.15 });
        break;
      case 'place': this._noise({ dur: 0.09, gain: 0.16, freq: 300, sweepTo: 90, type: 'lowpass' }); break;

      /* ---------- weapons by class ---------- */
      case 'shot': case 'rifle':
        if (!this._gate('shot', 55)) return;
        this._noise({ dur: 0.05, gain: 0.07, freq: 2400, q: 1.2 });
        this._tone({ type: 'square', f0: 880, f1: 240, dur: 0.045, gain: 0.05 });
        break;
      case 'heavy':
        if (!this._gate('heavy', 70)) return;
        this._noise({ dur: 0.07, gain: 0.1, freq: 1600, q: 1 });
        this._tone({ type: 'square', f0: 420, f1: 120, dur: 0.06, gain: 0.08 });
        break;
      case 'sniper':
        if (!this._gate('sniper', 200)) return;
        this._noise({ dur: 0.12, gain: 0.14, freq: 3600, sweepTo: 400, q: 2.4 });
        this._tone({ type: 'sawtooth', f0: 1900, f1: 140, dur: 0.1, gain: 0.07 });
        break;
      case 'flame':
        if (!this._gate('flame', 90)) return;
        this._noise({ dur: 0.3, gain: 0.1, freq: 900, sweepTo: 350, type: 'bandpass', q: 0.6 });
        break;
      case 'grenade':
        if (!this._gate('grenade', 120)) return;
        this._noise({ dur: 0.08, gain: 0.09, freq: 700, sweepTo: 200, type: 'lowpass' });
        this._tone({ type: 'sine', f0: 300, f1: 90, dur: 0.1, gain: 0.07 });
        break;
      case 'rocket': case 'rpg':
        if (!this._gate('rocket', 110)) return;
        this._noise({ dur: 0.28, gain: 0.14, freq: 1800, sweepTo: 300, type: 'bandpass', q: 1.4 });
        this._tone({ type: 'sawtooth', f0: 220, f1: 60, dur: 0.2, gain: 0.08 });
        break;
      case 'cannon': case 'tank':
        if (!this._gate('cannon', 90)) return;
        this._noise({ dur: 0.2, gain: 0.2, freq: 900, sweepTo: 120, type: 'lowpass' });
        this._tone({ type: 'sine', f0: 130, f1: 45, dur: 0.22, gain: 0.2 });
        break;
      case 'turret':
        if (!this._gate('turret', 60)) return;
        this._noise({ dur: 0.04, gain: 0.06, freq: 2800, q: 1.4 });
        this._tone({ type: 'square', f0: 1100, f1: 300, dur: 0.035, gain: 0.045 });
        break;

      /* ---------- impacts & explosions ---------- */
      case 'explode': case 'boom':
        if (!this._gate('explode', 80)) return;
        this._noise({ dur: 0.34, gain: 0.24, freq: 700, sweepTo: 70, type: 'lowpass' });
        this._tone({ type: 'sine', f0: 110, f1: 38, dur: 0.3, gain: 0.22 });
        break;
      case 'boomBig':
        if (!this._gate('boomBig', 200)) return;
        this._noise({ dur: 0.7, gain: 0.3, freq: 900, sweepTo: 40, type: 'lowpass' });
        this._tone({ type: 'sine', f0: 90, f1: 24, dur: 0.65, gain: 0.3 });
        this._tone({ type: 'sine', f0: 60, f1: 20, dur: 0.8, gain: 0.2, delay: 0.1 });
        break;
      case 'hit': case 'impact':
        if (!this._gate('hit', 60)) return;
        this._tone({ type: 'triangle', f0: 240, f1: 140, dur: 0.05, gain: 0.07 });
        break;
      case 'hitMetal':
        if (!this._gate('hitMetal', 60)) return;
        this._noise({ dur: 0.06, gain: 0.08, freq: 3200, q: 3 });
        this._tone({ type: 'square', f0: 1400, f1: 500, dur: 0.05, gain: 0.05 });
        break;
      case 'mine':
        this._noise({ dur: 0.4, gain: 0.28, freq: 1200, sweepTo: 60, type: 'lowpass' });
        this._tone({ type: 'sine', f0: 140, f1: 30, dur: 0.35, gain: 0.26 });
        break;

      /* ---------- alien & boss ---------- */
      case 'alien':
        if (!this._gate('alien', 140)) return;
        this._tone({ type: 'sawtooth', f0: 340, f1: 120, dur: 0.18, gain: 0.06 });
        this._tone({ type: 'sawtooth', f0: 355, f1: 128, dur: 0.18, gain: 0.05, delay: 0.01 });
        break;
      case 'alienDie':
        if (!this._gate('alienDie', 90)) return;
        this._tone({ type: 'sawtooth', f0: 500, f1: 80, dur: 0.25, gain: 0.09 });
        this._noise({ dur: 0.2, gain: 0.07, freq: 2000, sweepTo: 300, q: 1.5, delay: 0.04 });
        break;
      case 'roar':
        if (!this._gate('roar', 400)) return;
        this._tone({ type: 'sawtooth', f0: 120, f1: 45, dur: 0.7, gain: 0.22 });
        this._tone({ type: 'sawtooth', f0: 90, f1: 38, dur: 0.75, gain: 0.18, delay: 0.05 });
        this._noise({ dur: 0.6, gain: 0.14, freq: 400, sweepTo: 90, type: 'lowpass', delay: 0.08 });
        break;
      case 'phase':
        this._tone({ type: 'sawtooth', f0: 220, f1: 55, dur: 0.5, gain: 0.16 });
        this._noise({ dur: 0.4, gain: 0.12, freq: 1500, sweepTo: 200, type: 'bandpass', q: 2 });
        break;
      case 'telegraph':
        this._tone({ type: 'sine', f0: 880, dur: 0.09, gain: 0.08 });
        this._tone({ type: 'sine', f0: 880, dur: 0.09, gain: 0.08, delay: 0.14 });
        break;
      case 'beam':
        if (!this._gate('beam', 150)) return;
        this._tone({ type: 'sawtooth', f0: 1600, f1: 200, dur: 0.3, gain: 0.1 });
        this._noise({ dur: 0.25, gain: 0.08, freq: 3000, sweepTo: 500, q: 3 });
        break;
      case 'shield':
        this._tone({ type: 'sine', f0: 520, f1: 780, dur: 0.15, gain: 0.07 });
        break;

      /* ---------- ambience ---------- */
      case 'radio':
        if (!this._gate('radio', 2000)) return;
        this._noise({ dur: 0.05, gain: 0.04, freq: 1200, q: 4 });
        [660, 880, 740].forEach((f, i) => this._tone({ type: 'square', f0: f, dur: 0.05, gain: 0.03, delay: 0.06 + i * 0.08 }));
        this._noise({ dur: 0.06, gain: 0.04, freq: 1000, q: 4, delay: 0.34 });
        break;
      case 'alarm':
        if (!this._gate('alarm', 900)) return;
        this._tone({ type: 'square', f0: 620, dur: 0.18, gain: 0.09 });
        this._tone({ type: 'square', f0: 470, dur: 0.18, gain: 0.09, delay: 0.22 });
        break;
      case 'footstep':
        if (!this._gate('footstep', 240)) return;
        this._noise({ dur: 0.04, gain: 0.025, freq: 300, type: 'lowpass' });
        break;

      /* ---------- flow ---------- */
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
  setMusicIntensity(level) { this._intensity = Math.max(0, Math.min(1, level)); }

  startMusic(mode) {
    this.unlock();
    if (!this.ctx || this.musicMode === mode) return;
    this.stopMusic();
    this.musicMode = mode;
    this._intensity = this._intensity || 0;
    const t0 = this.ctx.currentTime;

    const mkDrone = (f, detune, gain, cutoff = 320) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = detune;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = cutoff;
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

    if (mode === 'battle') {
      mkDrone(55, 0, 0.16);
      mkDrone(110.4, 6, 0.1);
      const bass = [82.4, 82.4, 98, 73.4, 82.4, 110, 98, 73.4];
      let step = 0;
      this.musicTimer = setInterval(() => {
        if (!this.ctx) return;
        const it = this._intensity || 0;
        const f = bass[step % bass.length];
        this._tone({ type: 'square', f0: f, dur: 0.16, gain: 0.075 + it * 0.03, bus: 'music' });
        if (step % 4 === 0) this._tone({ type: 'sine', f0: 41, dur: 0.2, gain: 0.14 + it * 0.05, bus: 'music' });
        if (it > 0.4 && step % 2 === 1) this._noise({ dur: 0.03, gain: 0.03 + it * 0.03, freq: 6000, q: 2 });
        if (it > 0.7 && step % 8 === 6) this._tone({ type: 'sawtooth', f0: f * 2, dur: 0.1, gain: 0.04, bus: 'music' });
        step++;
      }, Math.max(170, 235 - (this._intensity || 0) * 55));
    } else if (mode === 'boss') {
      mkDrone(41.2, 0, 0.22, 240);
      mkDrone(82.4, 8, 0.14, 260);
      mkDrone(61.7, -6, 0.12, 220); // tritone tension
      let step = 0;
      this.musicTimer = setInterval(() => {
        if (!this.ctx) return;
        if (step % 2 === 0) this._tone({ type: 'sine', f0: 36, dur: 0.24, gain: 0.24, bus: 'music' });
        if (step % 8 === 4) this._tone({ type: 'sawtooth', f0: 73.4, dur: 0.4, gain: 0.09, bus: 'music' });
        if (step % 16 === 12) this._tone({ type: 'sawtooth', f0: 55, f1: 41, dur: 0.6, gain: 0.08, bus: 'music' });
        step++;
      }, 190);
    } else if (mode === 'victory') {
      const chords = [[261.6, 329.6, 392], [293.7, 370, 440], [329.6, 415.3, 493.9], [261.6, 329.6, 523.2]];
      let ci = 0;
      this.musicTimer = setInterval(() => {
        if (!this.ctx) return;
        chords[ci % chords.length].forEach((f) => this._tone({ type: 'sine', f0: f, dur: 1.4, gain: 0.05, bus: 'music' }));
        this._tone({ type: 'sine', f0: chords[ci % chords.length][0] / 2, dur: 1.4, gain: 0.06, bus: 'music' });
        ci++;
      }, 1500);
    } else if (mode === 'defeat') {
      const notes = [220, 207.7, 196, 174.6];
      let ni = 0;
      this.musicTimer = setInterval(() => {
        if (!this.ctx) return;
        this._tone({ type: 'sawtooth', f0: notes[ni % notes.length], dur: 1.8, gain: 0.05, bus: 'music' });
        this._tone({ type: 'sawtooth', f0: notes[ni % notes.length] / 2, dur: 2, gain: 0.05, bus: 'music' });
        ni++;
      }, 2000);
    } else {
      // menu / ambient
      mkDrone(55, 0, 0.14);
      mkDrone(110.4, 6, 0.09);
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
