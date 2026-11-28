// 事前に作っておくピアノ風の音源。
// ピアノの音源ファイルを読み込めないとき（オフライン・埋め込み先の制限）の代わりに使う。
// 1音ずつ波形を計算して AudioBuffer にしておき、鳴らすときはそれを再生するだけにする。
// その場で発振器を動かす（リアルタイム合成）より処理がずっと軽く、スマホでも音が途切れにくい。

/** 1音の長さ（秒）。ピアノのように自然に減衰するので、これより長く押しても残りはほぼ無音 */
const NOTE_SECONDS = 4;
const ATTACK = 0.004;

/** 指定した音（MIDI）の波形を計算する */
export function renderPianoNote(midi: number, sampleRate: number): Float32Array<ArrayBuffer> {
  const f0 = 440 * Math.pow(2, (midi - 69) / 12);
  const len = Math.floor(NOTE_SECONDS * sampleRate);
  const out = new Float32Array(len);
  // 低い音ほど長く響く
  const baseDecay = Math.min(3.2, Math.max(0.5, 2.2 * Math.pow(220 / f0, 0.45)));
  // 弦の硬さによる倍音のずれ（わずかに高くなる）
  const inharm = 0.00025;
  const partials: { w: number; amp: number; decay: number }[] = [];
  for (let k = 1; k <= 12; k++) {
    const f = f0 * k * Math.sqrt(1 + inharm * k * k);
    if (f > Math.min(9000, sampleRate / 2.2)) break;
    // 高い倍音ほど小さく、早く消える。2倍音・3倍音は少し強め（ピアノらしい明るさ）
    const amp = (k === 1 ? 1 : k === 2 ? 0.55 : k === 3 ? 0.32 : 0.6 / Math.pow(k, 1.4)) * (f0 > 1000 ? 1 / k : 1);
    partials.push({ w: (2 * Math.PI * f) / sampleRate, amp, decay: baseDecay / (1 + 0.55 * (k - 1)) });
  }
  const attackLen = Math.floor(ATTACK * sampleRate);
  for (const p of partials) {
    // 減衰を1サンプルごとの掛け算にして、exp を毎回計算しない
    const step = Math.exp(-1 / (p.decay * sampleRate));
    let env = p.amp;
    // 位相の回転で sin を計算（毎回 Math.sin を呼ばない）
    const c = Math.cos(p.w);
    const s = Math.sin(p.w);
    let x = 0;
    let y = 1;
    for (let i = 0; i < len; i++) {
      out[i] += env * x;
      const nx = x * c + y * s;
      y = y * c - x * s;
      x = nx;
      env *= step;
    }
  }
  // 立ち上がりと、最後の切れ目のノイズを防ぐ
  for (let i = 0; i < attackLen; i++) out[i] *= i / attackLen;
  const fade = Math.floor(0.05 * sampleRate);
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  // 1音の最大を揃える（和音で重ねても大きくなりすぎないよう 0.22）
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? 0.22 / peak : 0;
  for (let i = 0; i < len; i++) out[i] *= gain;
  return out;
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export class BufferPiano {
  private buffers = new Map<number, AudioBuffer>();
  private voices = new Map<number, Voice[]>();
  private warming = false;

  constructor(
    private ctx: AudioContext,
    private output: AudioNode,
  ) {}

  private buffer(midi: number): AudioBuffer {
    let b = this.buffers.get(midi);
    if (!b) {
      const data = renderPianoNote(midi, this.ctx.sampleRate);
      b = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
      b.copyToChannel(data, 0);
      this.buffers.set(midi, b);
    }
    return b;
  }

  /** よく使う範囲の音を、少しずつ（画面を止めないように）先に作っておく */
  warmUp(low = 36, high = 84) {
    if (this.warming) return;
    this.warming = true;
    // 真ん中の音から順に作る（よく使う音が先にできる）
    const order: number[] = [];
    for (let d = 0; d <= high - low; d++) {
      const up = 60 + d;
      const down = 60 - d - 1;
      if (up <= high) order.push(up);
      if (down >= low) order.push(down);
    }
    const next = () => {
      const t0 = performance.now();
      while (order.length > 0 && performance.now() - t0 < 8) this.buffer(order.shift()!);
      if (order.length > 0) setTimeout(next, 16);
    };
    setTimeout(next, 0);
  }

  triggerAttack(midi: number, time = this.ctx.currentTime, velocity = 0.8) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer(midi);
    const gain = this.ctx.createGain();
    gain.gain.value = velocity;
    src.connect(gain).connect(this.output);
    src.start(Math.max(time, this.ctx.currentTime));
    const list = this.voices.get(midi) ?? [];
    list.push({ src, gain });
    this.voices.set(midi, list);
    src.onended = () => {
      const l = this.voices.get(midi);
      if (!l) return;
      const i = l.findIndex((v) => v.src === src);
      if (i >= 0) l.splice(i, 1);
      gain.disconnect();
    };
  }

  triggerRelease(midi: number, time = this.ctx.currentTime) {
    const list = this.voices.get(midi);
    if (!list) return;
    const t = Math.max(time, this.ctx.currentTime);
    for (const v of list.splice(0)) {
      // ダンパーで止めるように、すばやく減衰させる
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setTargetAtTime(0, t, 0.06);
      try {
        v.src.stop(t + 0.4);
      } catch {
        // すでに止まっている
      }
    }
  }

  triggerAttackRelease(midi: number, dur: number, time = this.ctx.currentTime, velocity = 0.8) {
    this.triggerAttack(midi, time, velocity);
    // この音だけを止める（同じ高さで後から鳴らした音は止めない）
    const list = this.voices.get(midi)!;
    const v = list[list.length - 1];
    const t = Math.max(time, this.ctx.currentTime) + dur;
    v.gain.gain.setTargetAtTime(0, t, 0.06);
    try {
      v.src.stop(t + 0.4);
    } catch {
      // すでに止まっている
    }
  }
}
