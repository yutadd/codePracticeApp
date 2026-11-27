import { describe, expect, it } from 'vitest';
import { bassNote, diatonicSpecs, resolveJamChord, tonicForMode, voiceChord, VOICE_HIGH, VOICE_LOW, youtubeId, youtubeStart } from './jam';
import { mod12 } from './theory';

const C = { tonic: 'C', mode: 'major' as const };

describe('resolveJamChord', () => {
  it('ダイアトニックの名前とディグリー', () => {
    const names = diatonicSpecs('major', false).map((s) => resolveJamChord(C, s));
    expect(names.map((c) => c.name)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(names.map((c) => c.degree)).toEqual(['Ⅰ', 'Ⅱm', 'Ⅲm', 'Ⅳ', 'Ⅴ', 'Ⅵm', 'Ⅶdim']);
    const sevenths = diatonicSpecs('major', true).map((s) => resolveJamChord(C, s).name);
    expect(sevenths).toEqual(['CM7', 'Dm7', 'Em7', 'FM7', 'G7', 'Am7', 'Bm7(♭5)']);
  });

  it('マイナーキーのダイアトニック', () => {
    const am = diatonicSpecs('minor', false).map((s) => resolveJamChord({ tonic: 'A', mode: 'minor' }, s).name);
    expect(am).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
  });

  it('変化記号つき（借用和音）を綴る', () => {
    const bVII = resolveJamChord(C, { deg: 7, acc: -1, quality: 'maj' });
    expect(bVII.name).toBe('B♭');
    expect(bVII.degree).toBe('♭Ⅶ');
    expect(bVII.tones.map((t) => t.name)).toEqual(['B♭', 'D', 'F']);
    const III7 = resolveJamChord({ tonic: 'E♭', mode: 'major' }, { deg: 3, acc: 0, quality: 'dom7' });
    expect(III7.name).toBe('G7');
    expect(III7.tones.map((t) => t.name)).toEqual(['G', 'B', 'D', 'F']);
  });

  it('キーを変えると同じディグリーのまま移調される', () => {
    const spec = { deg: 4, acc: 0 as const, quality: 'maj' as const };
    expect(resolveJamChord({ tonic: 'G', mode: 'major' }, spec).name).toBe('C');
    expect(resolveJamChord({ tonic: 'B♭', mode: 'major' }, spec).name).toBe('E♭');
  });
});

describe('voiceChord', () => {
  const chord = (deg: number) => resolveJamChord(C, diatonicSpecs('major', false)[deg - 1]);

  it('構成音がそろい、範囲内に収まる', () => {
    for (let d = 1; d <= 7; d++) {
      const v = voiceChord(chord(d), null);
      expect(new Set(v.map(mod12))).toEqual(new Set(chord(d).tones.map((t) => t.pc)));
      expect(Math.min(...v)).toBeGreaterThanOrEqual(VOICE_LOW);
      expect(Math.max(...v)).toBeLessThanOrEqual(VOICE_HIGH);
    }
  });

  it('前のコードから近い転回形を選ぶ（C→F は共通音のCを保つ）', () => {
    const c = voiceChord(chord(1), null);
    expect(c).toEqual([60, 64, 67]);
    const f = voiceChord(chord(4), c);
    expect(f).toEqual([60, 65, 69]);
    const g = voiceChord(chord(5), f);
    // F(C F A) → G は B D G（59 62 67）か D G B（62 67 71）。動きの小さい方
    const moved = (a: number[], b: number[]) => a.reduce((s, m, i) => s + Math.abs(m - b[i]), 0);
    expect(moved(g, f)).toBeLessThanOrEqual(6);
  });

  it('ベースは根音', () => {
    expect(mod12(bassNote(chord(5)))).toBe(7);
    expect(bassNote(chord(1))).toBe(48);
  });
});

describe('youtube', () => {
  it('いろいろな URL から動画IDを取り出す', () => {
    const id = 'dQw4w9WgXcQ';
    expect(youtubeId(`https://www.youtube.com/watch?v=${id}`)).toBe(id);
    expect(youtubeId(`https://youtu.be/${id}?si=abc`)).toBe(id);
    expect(youtubeId(`https://m.youtube.com/watch?v=${id}&t=30s`)).toBe(id);
    expect(youtubeId(`https://music.youtube.com/watch?v=${id}`)).toBe(id);
    expect(youtubeId(`https://www.youtube.com/shorts/${id}`)).toBe(id);
    expect(youtubeId(`youtube.com/embed/${id}`)).toBe(id);
    expect(youtubeId(id)).toBe(id);
    expect(youtubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeId('hello')).toBeNull();
  });

  it('開始位置', () => {
    expect(youtubeStart('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe(42);
    expect(youtubeStart('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m5s')).toBe(65);
    expect(youtubeStart('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(0);
  });
});

it('モードを切り替えたときの主音の綴り', () => {
  expect(tonicForMode('D♭', 'minor')).toBe('C♯');
  expect(tonicForMode('G♯', 'major')).toBe('A♭');
  expect(tonicForMode('A', 'minor')).toBe('A');
});
