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

import { estimateKey, parseChordList, parseChordName, respell, specFromName } from './jam';
import { keyName } from './theory';

describe('コード名から', () => {
  const name = (key: { tonic: string; mode: 'major' | 'minor' }, text: string) => {
    const c = parseChordName(text)!;
    return resolveJamChord(key, specFromName(key, c.letter, c.pc, c.quality));
  };

  it('いろいろな表記を読む', () => {
    expect(parseChordName('F#m7')).toMatchObject({ pc: 6, quality: 'min7' });
    expect(parseChordName('Bbmaj7')).toMatchObject({ pc: 10, quality: 'maj7' });
    expect(parseChordName('B♭M7')).toMatchObject({ pc: 10, quality: 'maj7' });
    expect(parseChordName('Bm7(b5)')).toMatchObject({ pc: 11, quality: 'm7b5' });
    expect(parseChordName('Bm7-5')).toMatchObject({ quality: 'm7b5' });
    expect(parseChordName('C/G')).toMatchObject({ pc: 0, quality: 'maj', slash: 'G' });
    expect(parseChordName('Am')).toMatchObject({ pc: 9, quality: 'min' });
    expect(parseChordName('Ｃ')).toBeNull();
    expect(parseChordName('hello')).toBeNull();
  });

  it('テンション付きは近いコードにする', () => {
    expect(parseChordName('C7(9)')).toMatchObject({ quality: 'dom7', approx: true });
    expect(parseChordName('Dm9')).toMatchObject({ quality: 'min7', approx: true });
    expect(parseChordName('CM9')).toMatchObject({ quality: 'maj7', approx: true });
    expect(parseChordName('Gsus2')).toMatchObject({ quality: 'sus2' });
  });

  it('綴りを保ったままディグリーにする', () => {
    const C = { tonic: 'C', mode: 'major' as const };
    expect(name(C, 'Bb').name).toBe('B♭');
    expect(name(C, 'Bb').degree).toBe('♭Ⅶ');
    expect(name(C, 'A#').name).toBe('A♯');
    expect(name(C, 'E7').degree).toBe('Ⅲ7');
    const Eb = { tonic: 'E♭', mode: 'major' as const };
    expect(name(Eb, 'Cm').degree).toBe('Ⅵm');
    expect(name(Eb, 'Fm7').name).toBe('Fm7');
    const A = { tonic: 'A', mode: 'minor' as const };
    expect(name(A, 'E7').degree).toBe('Ⅴ7');
    expect(name(A, 'G').degree).toBe('Ⅶ');
  });

  it('コード譜の並びを読む', () => {
    const r = parseChordList('| Am | F - G | C/E  Fmaj7 ？ |');
    expect(r.chords.map((c) => c.quality)).toEqual(['min', 'maj', 'maj', 'maj', 'maj7']);
    expect(r.unknown).toEqual(['？']);
  });

  it('キーを推定する', () => {
    const est = (t: string) => keyName(estimateKey(parseChordList(t).chords)!);
    expect(est('F G Em Am')).toBe('C');
    expect(est('C G Am F')).toBe('C');
    expect(est('Am Dm E7 Am')).toBe('Am');
    expect(est('D A Bm G')).toBe('D');
    expect(est('E♭ B♭ Cm A♭')).toBe('E♭');
    expect(estimateKey([])).toBeNull();
  });

  it('キーを変えてもコード名を保つ', () => {
    const C = { tonic: 'C', mode: 'major' as const };
    const G = { tonic: 'G', mode: 'major' as const };
    const spec = { deg: 4, acc: 0 as const, quality: 'maj' as const }; // C キーの F
    const s = respell(C, G, spec);
    expect(resolveJamChord(G, s).name).toBe('F');
    expect(resolveJamChord(G, s).degree).toBe('♭Ⅶ');
  });
});

import { playedNotes, specFromNotes, transposeSpec } from './jam';

describe('鍵盤で選んだ音', () => {
  const C = { tonic: 'C', mode: 'major' as const };
  const r = (notes: number[], key = C) => resolveJamChord(key, specFromNotes(key, notes));

  it('コード名を判定する', () => {
    expect(r([48, 52, 55]).name).toBe('C');
    expect(r([48, 52, 55]).degree).toBe('Ⅰ');
    expect(r([57, 60, 64, 67]).name).toBe('Am7');
    expect(r([48, 52, 55, 57]).name).toBe('C6'); // 最低音を根音とみなす
    expect(r([50, 53, 57, 60]).name).toBe('Dm7');
    expect(r([43, 50]).name).toBe('G5');
  });

  it('最低音が根音でなければ分数コード', () => {
    expect(r([52, 55, 60]).name).toBe('C/E');
    expect(r([47, 55, 62, 67]).name).toBe('G/B');
  });

  it('判定できない音はそのまま並べる', () => {
    const c = r([60, 61]);
    expect(c.spec.unnamed).toBe(true);
    expect(c.name).toBe('C・C♯');
    expect(c.fixedNotes).toEqual([60, 61]);
  });

  it('選んだ音をそのまま鳴らす', () => {
    expect(playedNotes(r([52, 55, 60]), true)).toEqual([52, 55, 60]);
    const g = resolveJamChord(C, { deg: 5, acc: 0, quality: 'maj' });
    expect(playedNotes(g, true)[0]).toBe(bassNote(g));
  });

  it('移調すると同じ幅だけずれる', () => {
    const spec = specFromNotes(C, [52, 55, 60]); // C/E
    const D = { tonic: 'D', mode: 'major' as const };
    const t = transposeSpec(C, D, spec);
    expect(t.notes).toEqual([54, 57, 62]);
    expect(resolveJamChord(D, t).name).toBe('D/F♯');
  });
});
