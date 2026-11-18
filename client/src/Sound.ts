/**
 * All game sounds, made on the fly with the browser's Web Audio (no sound files).
 * Browsers only allow audio after the player has clicked or pressed a key, so
 * call unlock() from the first input.
 */

type Wave = OscillatorType;

interface ToneOpts {
  type?: Wave;
  gain?: number;
  /** Glide to this frequency over the length of the sound. */
  slideTo?: number;
  /** Seconds from now. */
  delay?: number;
  pan?: number;
  attack?: number;
}

interface NoiseOpts {
  filter?: BiquadFilterType;
  freq?: number;
  sweepTo?: number;
  q?: number;
  gain?: number;
  delay?: number;
  pan?: number;
  attack?: number;
}

const MUTE_KEY = "prop-hunt-muted";

export class Sound {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noiseBuf?: AudioBuffer;
  private ambience?: { stop: () => void };
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      /* storage can be blocked; that's fine */
    }
  }

  /** Start the audio engine. Safe to call many times. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      // A gentle limiter so overlapping sounds never clip.
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);

      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      // iOS wants a (silent) sound played from a touch before it lets anything else through.
      const wake = this.ctx.createBufferSource();
      wake.buffer = this.ctx.createBuffer(1, 1, 22050);
      wake.connect(this.ctx.destination);
      wake.start(0);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    return this.muted;
  }

  // ------------------------------------------------------------ building blocks

  private out(pan = 0): AudioNode | undefined {
    if (!this.ctx || !this.master) return undefined;
    if (!pan || !this.ctx.createStereoPanner) return this.master;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    return p;
  }

  private tone(freq: number, dur: number, o: ToneOpts = {}) {
    const ctx = this.ctx;
    const dest = this.out(o.pan);
    if (!ctx || !dest) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t0 + dur);
    const peak = o.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, o: NoiseOpts = {}) {
    const ctx = this.ctx;
    const dest = this.out(o.pan);
    if (!ctx || !dest || !this.noiseBuf) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? "lowpass";
    f.frequency.setValueAtTime(o.freq ?? 800, t0);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.sweepTo), t0 + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const peak = o.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  // --------------------------------------------------------------- sound effects
  // `vol` is 0..1 (use it to make far-away sounds quieter), `pan` is -1 (left) .. 1 (right).

  /** A footstep. */
  step(vol = 1, pan = 0) {
    this.noise(0.07, { filter: "lowpass", freq: 500 + Math.random() * 250, sweepTo: 180, gain: 0.22 * vol, pan });
    this.tone(90 + Math.random() * 20, 0.06, { gain: 0.1 * vol, slideTo: 60, pan });
  }

  /** A disguised prop dragging itself across the floor (a tell for the hunter). */
  scrape(vol = 1, pan = 0) {
    this.noise(0.16, { filter: "bandpass", freq: 700 + Math.random() * 200, sweepTo: 350, q: 2.5, gain: 0.2 * vol, pan });
  }

  /** Turning into an object. */
  poof(vol = 1, pan = 0) {
    this.noise(0.22, { filter: "lowpass", freq: 2400, sweepTo: 300, gain: 0.28 * vol, pan });
    this.tone(320, 0.2, { type: "triangle", slideTo: 760, gain: 0.16 * vol, pan });
  }

  /** Back to normal. */
  unpoof(vol = 1, pan = 0) {
    this.noise(0.18, { filter: "lowpass", freq: 900, sweepTo: 2600, gain: 0.2 * vol, pan });
    this.tone(700, 0.16, { type: "triangle", slideTo: 300, gain: 0.12 * vol, pan });
  }

  /** Settling into a perfect copy. */
  settle() {
    this.tone(520, 0.12, { type: "sine", gain: 0.1 });
    this.tone(780, 0.18, { type: "sine", gain: 0.08, delay: 0.07 });
  }

  /** The hunter swings. */
  swing(vol = 1, pan = 0) {
    this.noise(0.18, { filter: "bandpass", freq: 500, sweepTo: 2200, q: 1.2, gain: 0.3 * vol, pan, attack: 0.03 });
  }

  /** The hunter found a player. */
  found(vol = 1, pan = 0) {
    this.tone(180, 0.18, { type: "sine", slideTo: 70, gain: 0.5 * vol, pan });
    this.tone(659, 0.35, { type: "triangle", gain: 0.2 * vol, delay: 0.05, pan });
    this.tone(988, 0.5, { type: "triangle", gain: 0.2 * vol, delay: 0.14, pan });
  }

  /** The hunter hit a plain object (and loses health). */
  wrongHit(vol = 1, pan = 0) {
    this.tone(140, 0.16, { type: "square", slideTo: 70, gain: 0.18 * vol, pan });
    this.noise(0.12, { filter: "lowpass", freq: 700, sweepTo: 150, gain: 0.3 * vol, pan });
    this.tone(220, 0.3, { type: "sawtooth", slideTo: 110, gain: 0.1 * vol, delay: 0.08, pan });
  }

  /** The hunter picks up a noise: a soft sonar blip with an echo. */
  ping(pan = 0) {
    this.tone(880, 0.32, { type: "sine", slideTo: 700, gain: 0.16, pan });
    this.tone(880, 0.32, { type: "sine", slideTo: 700, gain: 0.07, delay: 0.2, pan });
  }

  /** The hunter's radar sweep. */
  radar() {
    this.noise(0.7, { filter: "bandpass", freq: 300, sweepTo: 2400, q: 3, gain: 0.22, attack: 0.05 });
    this.tone(440, 0.6, { type: "sine", slideTo: 1320, gain: 0.1, attack: 0.05 });
  }

  /** A prop sends a decoy noise. */
  distract() {
    this.tone(520, 0.08, { type: "square", gain: 0.06 });
    this.tone(390, 0.1, { type: "square", gain: 0.05, delay: 0.09 });
  }

  /** The hunter checked an object and it was just an object. */
  inspectOk() {
    this.tone(660, 0.1, { type: "triangle", gain: 0.12 });
    this.tone(880, 0.16, { type: "triangle", gain: 0.12, delay: 0.09 });
  }

  /** A prop is being inspected: get away! */
  alarm() {
    this.tone(990, 0.12, { type: "square", gain: 0.1 });
    this.tone(740, 0.12, { type: "square", gain: 0.1, delay: 0.13 });
  }

  /**
   * Five silly taunts: 0 fart, 1 yodel, 2 boing, 3 honk, 4 sad trombone.
   * `vol` is 0 to 1 (distance), `pan` is -1 left to 1 right.
   */
  taunt(kind: number, vol = 1, pan = 0) {
    const v = Math.max(0.15, vol);
    switch (kind % 5) {
      case 0: {
        // A long, wobbly low raspberry with a puff of air.
        for (let i = 0; i < 7; i++) this.tone(95 - i * 6 + (i % 2) * 14, 0.09, { type: "sawtooth", slideTo: 55, gain: 0.34 * v, delay: i * 0.06, pan });
        this.noise(0.5, { filter: "lowpass", freq: 700, sweepTo: 150, gain: 0.3 * v, pan });
        break;
      }
      case 1: {
        // Yo-del-ay-hee-hoooo: notes that jump high and low.
        [392, 784, 392, 880, 523, 1047, 659, 1175].forEach((f, i) => this.tone(f, 0.15, { type: "triangle", gain: 0.26 * v, delay: i * 0.12, pan, slideTo: f * (i % 2 ? 0.96 : 1.04) }));
        this.tone(1175, 0.5, { type: "triangle", gain: 0.24 * v, delay: 0.98, pan, slideTo: 1240 });
        break;
      }
      case 2: {
        // Boing!
        this.tone(180, 0.55, { type: "sine", slideTo: 620, gain: 0.34 * v, pan });
        this.tone(620, 0.35, { type: "sine", slideTo: 160, gain: 0.26 * v, delay: 0.3, pan });
        break;
      }
      case 3: {
        // Honk honk!
        this.tone(230, 0.18, { type: "square", gain: 0.2 * v, pan, slideTo: 215 });
        this.tone(230, 0.3, { type: "square", gain: 0.2 * v, delay: 0.24, pan, slideTo: 200 });
        break;
      }
      default: {
        // Womp womp wooomp: the sad trombone.
        [311, 294, 277].forEach((f, i) => this.tone(f, 0.28, { type: "sawtooth", gain: 0.22 * v, delay: i * 0.3, pan, slideTo: f * 0.99 }));
        this.tone(262, 0.8, { type: "sawtooth", gain: 0.22 * v, delay: 0.9, pan, slideTo: 196 });
      }
    }
  }

  /** A countdown beep. `last` makes it higher and longer. */
  tick(last = false) {
    this.tone(last ? 880 : 520, last ? 0.28 : 0.1, { type: "square", gain: 0.1 });
  }

  /** Round begins: props start hiding. */
  roundStart() {
    this.tone(392, 0.18, { type: "triangle", gain: 0.25 });
    this.tone(523, 0.18, { type: "triangle", gain: 0.25, delay: 0.16 });
    this.tone(659, 0.35, { type: "triangle", gain: 0.25, delay: 0.32 });
  }

  /** The hunt begins. */
  huntStart() {
    this.tone(110, 0.7, { type: "sawtooth", slideTo: 98, gain: 0.22, attack: 0.05 });
    this.tone(165, 0.7, { type: "sawtooth", slideTo: 147, gain: 0.12, attack: 0.05 });
    this.noise(0.5, { filter: "lowpass", freq: 300, sweepTo: 1200, gain: 0.18, attack: 0.2 });
  }

  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.28, { type: "triangle", gain: 0.22, delay: i * 0.11 }));
    this.tone(1047, 0.7, { type: "sine", gain: 0.18, delay: 0.5 });
  }

  lose() {
    [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.35, { type: "triangle", gain: 0.22, delay: i * 0.18 }));
  }

  /** Low, tense background hum while the hunt is on. */
  startAmbience() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.ambience) return;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.05, ctx.currentTime, 1.5);
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "sine";
    o2.type = "sine";
    o1.frequency.value = 55;
    o2.frequency.value = 55.7; // slow beating
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.15;
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);
    o1.connect(g);
    o2.connect(g);
    g.connect(master);
    o1.start();
    o2.start();
    lfo.start();
    this.ambience = {
      stop: () => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
        const end = ctx.currentTime + 2;
        o1.stop(end);
        o2.stop(end);
        lfo.stop(end);
      },
    };
  }

  stopAmbience() {
    this.ambience?.stop();
    this.ambience = undefined;
  }
}
