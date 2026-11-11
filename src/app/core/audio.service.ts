import { Injectable, signal } from '@angular/core';

export type Sfx =
  | 'chime' | 'fanfare' | 'pop' | 'whoosh' | 'sparkle'
  | 'open' | 'close' | 'munch' | 'scrub' | 'flush' | 'yawn'
  | 'honk' | 'brake' | 'bark' | 'slide';

interface Mood { root: number; bpm: number }

// Uma "música" suave por cômodo (quarto, banheiro, cozinha, sala)
const MOODS: Mood[] = [
  { root: 60, bpm: 76 },
  { root: 65, bpm: 86 },
  { root: 67, bpm: 94 },
  { root: 62, bpm: 82 },
];
const SCALE = [0, 2, 4, 7, 9]; // pentatônica: nunca soa "errado"
const CHORD_ROOTS = [0, 9, 5, 7];
const CHORD_NOTES = [[0, 4, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7]];

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Todo o áudio é gerado por código (Web Audio): sem arquivos, sem licença.
 * Música e efeitos podem ser desligados separadamente (importante para crianças
 * com sensibilidade sonora).
 */
@Injectable({ providedIn: 'root' })
export class AudioService {
  readonly musicOn = signal(true);
  readonly sfxOn = signal(true);

  private ctx?: AudioContext;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private timer?: number;
  private nextTime = 0;
  private beat = 0;
  private mood = 0;
  private mel = 4;
  private waterLoop?: { src: AudioBufferSourceNode; gain: GainNode };

  /** Precisa ser chamado depois do primeiro toque/tecla (regra dos navegadores) */
  unlock(): void {
    if (!this.ctx) this.init();
    const c = this.ctx!;
    if (c.state === 'suspended') void c.resume();
    if (this.musicOn()) this.startMusic();
  }

  setMood(i: number): void {
    this.mood = i;
  }

  toggleMusic(): void {
    this.unlock();
    const on = !this.musicOn();
    this.musicOn.set(on);
    if (on) this.startMusic();
    else this.stopMusic();
  }

  toggleSfx(): void {
    this.unlock();
    const on = !this.sfxOn();
    this.sfxOn.set(on);
    if (!on) this.water(false);
  }

  /** Abaixa a música enquanto a voz fala */
  duck(on: boolean): void {
    const c = this.ctx;
    if (!c) return;
    this.musicBus.gain.setTargetAtTime(on ? 0.06 : 0.18, c.currentTime, 0.15);
  }

  stopMusic(): void {
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private init(): void {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const c = new AC();
    this.ctx = c;

    const master = c.createGain();
    master.gain.value = 0.9;
    master.connect(c.destination);

    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = 0.7;
    this.sfxBus.connect(master);

    // Música com um eco leve
    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0.18;
    const delay = c.createDelay();
    delay.delayTime.value = 0.32;
    const fb = c.createGain();
    fb.gain.value = 0.3;
    const wet = c.createGain();
    wet.gain.value = 0.35;
    this.musicBus.connect(master);
    this.musicBus.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(master);

    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  // ------------------------------------------------------------ música

  private startMusic(): void {
    if (this.timer !== undefined || !this.ctx) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(this.schedule, 120);
  }

  private schedule = (): void => {
    const c = this.ctx;
    if (!c) return;
    const m = MOODS[this.mood % MOODS.length];
    const eighth = 60 / m.bpm / 2;
    if (this.nextTime < c.currentTime - 0.5) this.nextTime = c.currentTime + 0.1; // aba em segundo plano

    while (this.nextTime < c.currentTime + 0.5) {
      const bar = Math.floor(this.beat / 8) % 4;
      const step = this.beat % 8;
      const t = this.nextTime;
      const base = m.root + CHORD_ROOTS[bar];

      if (step === 0) {
        CHORD_NOTES[bar].forEach((n) => this.note(hz(base + n), t, eighth * 7.5, 'sine', 0.5, 0.6));
        this.note(hz(base - 12), t, eighth * 3.5, 'triangle', 0.7, 0.01);
      }
      if (step === 4) this.note(hz(base - 12), t, eighth * 3, 'triangle', 0.5, 0.01);

      if (Math.random() < 0.6) {
        const jump = [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
        this.mel = Math.max(0, Math.min(9, this.mel + jump));
        const n = m.root + 12 + SCALE[this.mel % 5] + 12 * Math.floor(this.mel / 5);
        this.note(hz(n), t, eighth * 1.8, 'triangle', 0.55, 0.005);
      }
      this.nextTime += eighth;
      this.beat++;
    }
  };

  private note(f: number, t: number, dur: number, type: OscillatorType, vol: number, attack: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ efeitos

  sfx(name: Sfx): void {
    const c = this.ctx;
    if (!c || !this.sfxOn() || c.state !== 'running') return;
    const t = c.currentTime;

    switch (name) {
      case 'chime':
        [1046.5, 1318.5, 1568].forEach((f, i) => this.tone(f, f, t + i * 0.09, 0.35, 'triangle', 0.35));
        break;
      case 'fanfare':
        [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) =>
          this.tone(f, f, t + i * 0.15, i === 5 ? 1.0 : 0.3, 'triangle', 0.4)
        );
        [392, 523.25].forEach((f) => this.tone(f, f, t + 0.75, 1.0, 'sine', 0.25));
        break;
      case 'pop':
        this.tone(350, 900, t, 0.12, 'sine', 0.5);
        break;
      case 'whoosh':
        this.noiseBurst(t, 0.4, 'bandpass', 300, 1800, 0.35, 0.8);
        break;
      case 'sparkle':
        [0, 1, 2].forEach((i) => {
          const f = 1800 + i * 500 + Math.random() * 200;
          this.tone(f, f, t + i * 0.07, 0.25, 'sine', 0.18);
        });
        break;
      case 'open':
        this.tone(160, 240, t, 0.4, 'sawtooth', 0.07);
        this.noiseBurst(t, 0.3, 'lowpass', 900, 500, 0.12, 0.7);
        break;
      case 'close':
        this.tone(140, 60, t, 0.15, 'sine', 0.5);
        this.noiseBurst(t, 0.08, 'lowpass', 600, 400, 0.2, 0.7);
        break;
      case 'munch':
        this.noiseBurst(t, 0.07, 'lowpass', 1100, 700, 0.5, 0.7);
        this.noiseBurst(t + 0.11, 0.07, 'lowpass', 1100, 700, 0.4, 0.7);
        break;
      case 'scrub':
        this.noiseBurst(t, 0.12, 'bandpass', 2500, 3500, 0.25, 1.2);
        break;
      case 'flush':
        this.noiseBurst(t, 1.6, 'lowpass', 1400, 300, 0.45, 0.7);
        break;
      case 'yawn':
        this.tone(300, 180, t, 0.9, 'triangle', 0.15);
        break;
      case 'honk':
        this.tone(330, 330, t, 0.22, 'sawtooth', 0.12);
        this.tone(415, 415, t, 0.22, 'sawtooth', 0.1);
        break;
      case 'brake':
        this.noiseBurst(t, 0.7, 'bandpass', 3200, 1400, 0.18, 4);
        break;
      case 'bark':
        this.tone(420, 260, t, 0.1, 'sawtooth', 0.22);
        this.tone(420, 260, t + 0.16, 0.1, 'sawtooth', 0.22);
        break;
      case 'slide':
        this.noiseBurst(t, 1.2, 'bandpass', 2400, 500, 0.3, 0.8);
        break;
    }
  }

  /** Som de água corrente (liga/desliga) */
  water(on: boolean): void {
    const c = this.ctx;
    if (!c) return;
    if (on) {
      if (this.waterLoop || !this.sfxOn()) return;
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2600;
      f.Q.value = 0.6;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.linearRampToValueAtTime(0.22, c.currentTime + 0.2);
      src.connect(f);
      f.connect(g);
      g.connect(this.sfxBus);
      src.start();
      this.waterLoop = { src, gain: g };
    } else if (this.waterLoop) {
      const w = this.waterLoop;
      this.waterLoop = undefined;
      w.gain.gain.setTargetAtTime(0, c.currentTime, 0.08);
      w.src.stop(c.currentTime + 0.5);
    }
  }

  private tone(f1: number, f2: number, t: number, dur: number, type: OscillatorType, vol: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    if (f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(t: number, dur: number, type: BiquadFilterType, f1: number, f2: number, vol: number, q: number): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f1, t);
    f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }
}