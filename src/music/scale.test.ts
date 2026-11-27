import { describe, expect, it } from 'vitest';
import { judgeScaleNote, scaleTask } from './scale';

const G = { tonic: 'G', mode: 'major' } as const;

describe('scaleTask', () => {
  it('Ⅳから順に7音を並べる', () => {
    const t = scaleTask(G, 4);
    expect(t.steps.map((s) => s.name)).toEqual(['C', 'D', 'E', 'F♯', 'G', 'A', 'B']);
    expect(t.steps.map((s) => s.roman)).toEqual(['Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅰ', 'Ⅱ', 'Ⅲ']);
    expect(t.id).toBe('G:スケール Ⅳから');
  });
  it('B♭は♭で綴る', () => {
    expect(scaleTask({ tonic: 'B♭', mode: 'major' }, 1).steps.map((s) => s.name)).toEqual([
      'B♭', 'C', 'D', 'E♭', 'F', 'G', 'A',
    ]);
  });
});

describe('judgeScaleNote', () => {
  const t = scaleTask(G, 4); // C D E F♯ G A B
  it('順番どおりならオクターブを問わず正解', () => {
    expect(judgeScaleNote(t, 0, 60)).toBe('ok');
    expect(judgeScaleNote(t, 3, 42)).toBe('ok'); // F♯
  });
  it('スケール外の音や、先の音を飛ばして弾くのはミス', () => {
    expect(judgeScaleNote(t, 3, 65)).toBe('wrong'); // F（ナチュラル）
    expect(judgeScaleNote(t, 1, 64)).toBe('wrong'); // D を飛ばして E
  });
  it('直前に正解した音の弾き直しは無視', () => {
    expect(judgeScaleNote(t, 1, 72)).toBe('ignore');
  });
});
