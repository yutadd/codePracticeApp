import { describe, expect, it } from 'vitest';
import { chordRules, closeVoicing, resolveChord, scaleNames } from './theory';

const C = { tonic: 'C', mode: 'major' } as const;

describe('resolveChord', () => {
  it('Cキーのダイアトニック4和音を綴る', () => {
    expect(resolveChord(C, { deg: 3, quality: 'min7' }).tones.map((t) => t.name)).toEqual(['E', 'G', 'B', 'D']);
    expect(resolveChord(C, { deg: 7, quality: 'm7b5' }).name).toBe('Bm7(♭5)');
  });
  it('マイナーキーのⅤ7は導音をシャープで綴る', () => {
    const e7 = resolveChord({ tonic: 'A', mode: 'minor' }, { deg: 5, quality: 'dom7' });
    expect(e7.name).toBe('E7');
    expect(e7.tones.map((t) => t.name)).toEqual(['E', 'G♯', 'B', 'D']);
    const d7 = resolveChord({ tonic: 'G', mode: 'minor' }, { deg: 5, quality: 'dom7' });
    expect(d7.tones.map((t) => t.name)).toEqual(['D', 'F♯', 'A', 'C']);
  });
  it('B♭キー', () => {
    expect(resolveChord({ tonic: 'B♭', mode: 'major' }, { deg: 4, quality: 'maj7' }).name).toBe('E♭M7');
  });
});

describe('chordRules', () => {
  it('4和音は5度を省略してよい', () => {
    const r = chordRules(resolveChord(C, { deg: 2, quality: 'min7' }), 'seventh');
    expect([...r.required].sort()).toEqual([0, 2, 5]);
    expect(r.optional.has(9)).toBe(true);
    expect([...r.tensions.keys()].sort()).toEqual([4, 7]);
  });
  it('m7♭5は♭5も必須', () => {
    const r = chordRules(resolveChord(C, { deg: 7, quality: 'm7b5' }), 'rootless');
    expect([...r.required].sort((a, b) => a - b)).toEqual([2, 5, 9]);
  });
  it('3和音レベルはテンションなし', () => {
    const r = chordRules(resolveChord(C, { deg: 1, quality: 'maj' }), 'triad');
    expect(r.tensions.size).toBe(0);
  });
  it('Ⅴ7の上級テンション', () => {
    const r = chordRules(resolveChord(C, { deg: 5, quality: 'dom7' }), 'rootless');
    expect(r.tensions.has(8)).toBe(true); // A♭ = ♭9
    expect(r.tensions.has(0)).toBe(false); // 11th はアヴォイド
  });
  it('closeVoicing', () => {
    const r = chordRules(resolveChord(C, { deg: 1, quality: 'maj7' }), 'seventh');
    expect(closeVoicing(r, 48)).toEqual([48, 52, 55, 59]);
  });
});

describe('ルート段階', () => {
  it('根音だけが必須で、ほかの音はすべて減点なし', () => {
    const r = chordRules(resolveChord(C, { deg: 6, quality: 'min' }), 'root');
    expect([...r.required]).toEqual([9]);
    expect([...r.chordTones]).toEqual([9]);
    expect(r.optional.size).toBe(11);
  });
  it('スケールを綴る', () => {
    expect(scaleNames({ tonic: 'B♭', mode: 'major' })).toEqual(['B♭', 'C', 'D', 'E♭', 'F', 'G', 'A']);
  });
});
