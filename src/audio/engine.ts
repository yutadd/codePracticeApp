// Tone.js による発音：ピアノ、メトロノーム、ドラム、ベース
import * as Tone from 'tone';

const SAMPLE_BASE = 'https://tonejs.github.io/audio/salamander/';
const SAMPLE_NOTES = ['A1', 'C2', 'D#2', 'F#2', 'A2', 'C3', 'D#3', 'F#3', 'A3', 'C4', 'D#4', 'F#4', 'A4', 'C5', 'D#5', 'F#5', 'A5', 'C6'];

const PIANO_DB = -4;
const toDb = (v: number) => (v <= 0.001 ? -Infinity : 20 * Math.log10(v));

class AudioEngine {
  private native: AudioContext | null = null;
  private started: Promise<void> | null = null;

  private pianoSampler: Tone.Sampler | null = null;
  private pianoFallback: Tone.PolySynth | null = null;
  private samplerLoaded = false;

  private clickSynth!: Tone.Synth;
  private kickSynth!: Tone.MembraneSynth;
  private snareSynth!: Tone.NoiseSynth;
  private hatSynth!: Tone.MetalSynth;
  private rideSynth!: Tone.MetalSynth;
  private bassSynth!: Tone.MonoSynth;

  private metronomeVol!: Tone.Volume;
  private pianoVol!: Tone.Volume;
  private accompVol!: Tone.Volume;

  /** ユーザー操作の中で呼ぶ（ブラウザの自動再生制限） */
  start(): Promise<void> {
    if (!this.started) {
      this.started = this.init().catch((e) => {
        // 失敗したら次の操作でやり直せるようにする
        this.started = null;
        throw e;
      });
    } else if (this.native && this.native.state !== 'running') {
      void this.native.resume().catch(() => {});
    }
    return this.started;
  }

  get isReady() {
    return this.native !== null;
  }

  private async init() {
    this.native = new AudioContext({ latencyHint: 'interactive' });
    Tone.setContext(this.native);
    await Tone.start();

    this.metronomeVol = new Tone.Volume(0).toDestination();
    this.accompVol = new Tone.Volume(0).toDestination();
    // ピアノ → 音量 → コンプレッサー → リミッター。音量を標準より上げても（フリー演奏で曲に負けないように）割れないようにする
    const pianoLimiter = new Tone.Limiter(-1).toDestination();
    const pianoComp = new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.003, release: 0.25 }).connect(pianoLimiter);
    const pianoVol = (this.pianoVol = new Tone.Volume(PIANO_DB).connect(pianoComp));

    // 音源ファイルを読み込めないとき（オフライン・埋め込み先の制限）の代わりの音。曲の中でも聞き取れるよう、やや太く明るい音にする
    this.pianoFallback = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fattriangle', count: 3, spread: 18 },
      envelope: { attack: 0.004, decay: 0.8, sustain: 0.35, release: 0.8 },
    }).connect(pianoVol);
    this.pianoFallback.volume.value = -3;
    this.pianoSampler = new Tone.Sampler({
      urls: Object.fromEntries(SAMPLE_NOTES.map((n) => [n, n.replace('#', 's') + '.mp3'])),
      baseUrl: SAMPLE_BASE,
      release: 1,
      onload: () => {
        this.samplerLoaded = true;
      },
    }).connect(pianoVol);

    this.clickSynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
    }).connect(this.metronomeVol);
    this.clickSynth.volume.value = -10;

    this.kickSynth = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 6 }).connect(this.accompVol);
    this.kickSynth.volume.value = -4;
    this.snareSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
    }).connect(this.accompVol);
    this.snareSynth.volume.value = -14;
    this.hatSynth = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 6000,
      octaves: 1.5,
    }).connect(this.accompVol);
    this.hatSynth.volume.value = -26;
    this.rideSynth = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.5, release: 0.3 },
      harmonicity: 3.1,
      modulationIndex: 16,
      resonance: 5000,
      octaves: 1,
    }).connect(this.accompVol);
    this.rideSynth.volume.value = -28;
    this.bassSynth = new Tone.MonoSynth({
      oscillator: { type: 'triangle' },
      filter: { Q: 1, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 0.005, decay: 0.3, sustain: 0.6, release: 0.15 },
      filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.2, baseFrequency: 200, octaves: 2.5 },
    }).connect(this.accompVol);
    this.bassSynth.volume.value = -4;
  }

  /** オーディオ時刻（秒） */
  now(): number {
    return this.native ? this.native.currentTime : 0;
  }

  /**
   * performance.now() 基準の時刻を「その瞬間に聞こえていた音の」オーディオ時刻へ変換する。
   * スケジュールした時刻 T のクリックが聞こえた瞬間に押すと、T が返る。
   */
  perfToAudioTime(perfMs: number): number {
    const ctx = this.native;
    if (!ctx) return 0;
    if (typeof ctx.getOutputTimestamp === 'function') {
      const ts = ctx.getOutputTimestamp();
      if (ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
        return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
      }
    }
    const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    return ctx.currentTime - (performance.now() - perfMs) / 1000 - latency;
  }

  setMetronomeVolume(v: number) {
    if (this.metronomeVol) this.metronomeVol.volume.value = toDb(v);
  }

  setAccompVolume(v: number) {
    if (this.accompVol) this.accompVol.volume.value = toDb(v);
  }

  /** ピアノ（コード・MIDIモニター）の音量。1 が標準、最大 3（約 +10dB。リミッターで割れないようにしている） */
  setPianoVolume(v: number) {
    if (this.pianoVol) this.pianoVol.volume.value = PIANO_DB + toDb(v);
  }

  private piano() {
    return this.samplerLoaded && this.pianoSampler ? this.pianoSampler : this.pianoFallback;
  }

  playNote(midi: number, dur = 0.8, time?: number, velocity = 0.8) {
    const p = this.piano();
    if (!p) return;
    p.triggerAttackRelease(Tone.Frequency(midi, 'midi').toNote(), dur, time, velocity);
  }

  playChord(midis: number[], dur = 1.6, arpeggio = 0) {
    const t = Tone.now();
    midis.forEach((m, i) => this.playNote(m, dur, t + i * arpeggio, 0.7));
  }

  /** 押している間だけ鳴らす（MIDIモニター用） */
  noteOn(midi: number, velocity = 0.8, time?: number) {
    this.piano()?.triggerAttack(Tone.Frequency(midi, 'midi').toNote(), time, velocity);
  }

  noteOff(midi: number, time?: number) {
    this.piano()?.triggerRelease(Tone.Frequency(midi, 'midi').toNote(), time);
  }

  click(time: number, accent: boolean) {
    this.clickSynth?.triggerAttackRelease(accent ? 'A6' : 'E6', 0.03, time, accent ? 1 : 0.6);
  }

  kick(time: number, velocity = 1) {
    this.kickSynth?.triggerAttackRelease('C1', 0.2, time, velocity);
  }

  snare(time: number, velocity = 1) {
    this.snareSynth?.triggerAttackRelease(0.12, time, velocity);
  }

  hat(time: number, velocity = 0.7) {
    this.hatSynth?.triggerAttackRelease('C6', 0.03, time, velocity);
  }

  ride(time: number, velocity = 0.7) {
    this.rideSynth?.triggerAttackRelease('G5', 0.2, time, velocity);
  }

  bass(midi: number, dur: number, time: number, velocity = 0.9) {
    this.bassSynth?.triggerAttackRelease(Tone.Frequency(midi, 'midi').toNote(), dur, time, velocity);
  }
}

export const audio = new AudioEngine();
