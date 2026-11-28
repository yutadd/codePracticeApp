import { describe, expect, it } from 'vitest';
import { renderPianoNote } from './bufferPiano';

const SR = 44100;

/** 自己相関で基本周波数を求める（期待値の ±25% の範囲で探す） */
function estimateFreq(x: Float32Array, sr: number, expected: number): number {
  const start = Math.floor(0.02 * sr);
  const n = Math.floor(0.15 * sr);
  const minLag = Math.floor(sr / (expected * 1.25));
  const maxLag = Math.ceil(sr / (expected * 0.8));
  let best = minLag;
  let bestR = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let r = 0;
    for (let i = start; i < start + n; i++) r += x[i] * x[i + lag];
    if (r > bestR) {
      bestR = r;
      best = lag;
    }
  }
  return sr / best;
}

describe('事前に作るピアノ風の音', () => {
  it('音の高さが合っていて、値が正しく、ピークがそろう', () => {
    for (const midi of [36, 48, 57, 69, 84]) {
      const x = renderPianoNote(midi, SR);
      const f0 = 440 * Math.pow(2, (midi - 69) / 12);
      expect(x.every((v) => Number.isFinite(v))).toBe(true);
      const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      expect(peak).toBeCloseTo(0.22, 2);
      // 倍音のわずかなずれと、整数サンプルの刻みを見込んで 2% 以内
      expect(Math.abs(estimateFreq(x, SR, f0) / f0 - 1)).toBeLessThan(0.02);
    }
  });

  it('立ち上がりはプツッとならず、時間とともに減衰する', () => {
    const x = renderPianoNote(60, SR);
    expect(Math.abs(x[0])).toBeLessThan(1e-6);
    const rms = (a: number, b: number) => {
      let s = 0;
      for (let i = a; i < b; i++) s += x[i] * x[i];
      return Math.sqrt(s / (b - a));
    };
    const early = rms(0, SR * 0.2);
    const late = rms(SR * 3, SR * 3.2);
    expect(late).toBeLessThan(early * 0.3);
    // 最後はゼロに収まる（切れ目のノイズがない）
    expect(Math.abs(x[x.length - 1])).toBeLessThan(1e-6);
  });

  it('使う範囲（C2〜C6 の49音）を作る時間が現実的', () => {
    const t0 = performance.now();
    for (let m = 36; m <= 84; m++) renderPianoNote(m, SR);
    const ms = performance.now() - t0;
    // PC で数百ms 程度。スマホでも少しずつ作るので画面は止まらない
    expect(ms).toBeLessThan(5000);
    console.log(`49音の生成：${Math.round(ms)}ms（1音あたり ${(ms / 49).toFixed(1)}ms）`);
  });
});
