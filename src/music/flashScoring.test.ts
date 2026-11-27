import { describe, expect, it } from 'vitest';
import { judgeBar, newJudgeState, NoteEvent, ownerBar, Timeline, voiceMovement } from './flashScoring';
import { chordRules, ChordSpec, Level, resolveChord } from './theory';

const C = { tonic: 'C', mode: 'major' } as const;

function timeline(specs: ChordSpec[], level: Level = 'seventh'): Timeline {
  // 60BPM、4/4：1小節4秒、小節0は 4秒から
  return {
    beat: 1,
    beatsPerBar: 4,
    bars: specs.map((s, i) => ({ start: 4 + i * 4, rules: chordRules(resolveChord(C, s), level) })),
  };
}

const chord = (t: number, midis: number[], len = 3): NoteEvent[] => midis.map((m) => ({ midi: m, on: t, off: t + len }));

const II_V_I: ChordSpec[] = [
  { deg: 2, quality: 'min7' },
  { deg: 5, quality: 'dom7' },
  { deg: 1, quality: 'maj7' },
];

describe('ownerBar', () => {
  const tl = timeline(II_V_I);
  it('次のコードにだけ合う音はアンティシペーションとして次の小節', () => {
    // 小節1(G7)頭の0.5拍前に B（G7のみ）
    expect(ownerBar(tl, 7.5, 59)).toBe(1);
  });
  it('両方に合う音は今の小節', () => {
    // F は Dm7 と G7 の両方
    expect(ownerBar(tl, 7.5, 53)).toBe(0);
  });
  it('どちらにも合わない音は今の小節', () => {
    expect(ownerBar(tl, 8.5, 61)).toBe(0);
  });
  it('カウントイン中の合わない音は数えない', () => {
    expect(ownerBar(tl, 3.5, 61)).toBe(-1);
  });
});

describe('judgeBar', () => {
  it('必須音がそろえば正解、テンション・ベース根音ボーナス', () => {
    const tl = timeline(II_V_I);
    // Dm7 + 9th(E)：D2 F A C E
    const notes = chord(4, [38, 53, 57, 60, 64]);
    const r = judgeBar(tl, notes, 0, newJudgeState(), 20);
    expect(r.correct).toBe(true);
    expect(r.bonus.tension).toBe(10);
    expect(r.bonus.bassRoot).toBe(10);
    expect(r.score).toBe(120);
  });

  it('必須音が足りなければ0点', () => {
    const tl = timeline(II_V_I);
    const r = judgeBar(tl, chord(4, [50, 53, 57]), 0, newJudgeState(), 20);
    expect(r.correct).toBe(false);
    expect(r.missing).toEqual([0]);
    expect(r.score).toBe(0);
  });

  it('チェンジが許容幅（前後1拍）を過ぎたら不正解', () => {
    const tl = timeline(II_V_I);
    const r = judgeBar(tl, chord(5.5, [50, 53, 57, 60]), 0, newJudgeState(), 20);
    expect(r.changeInTime).toBe(false);
    expect(r.correct).toBe(false);
  });

  it('構成音以外の音は1音名につき-15', () => {
    const tl = timeline(II_V_I);
    const notes = [...chord(4, [50, 53, 57, 60]), { midi: 61, on: 6, off: 7 }, { midi: 73, on: 6.2, off: 7 }];
    const r = judgeBar(tl, notes, 0, newJudgeState(), 20);
    expect(r.wrongPcs).toEqual([1]);
    expect(r.penalty).toBe(15);
  });

  it('経過音は減点しない', () => {
    const tl = timeline(II_V_I);
    // C#（裏拍・短い）→ D（構成音）へ半音
    const notes = [...chord(4, [50, 53, 57, 60]), { midi: 61, on: 5.5, off: 5.7 }, { midi: 62, on: 5.75, off: 6.5 }];
    const r = judgeBar(tl, notes, 0, newJudgeState(), 20);
    expect(r.wrongPcs).toEqual([]);
  });

  it('ヴォイスリーディング', () => {
    const tl = timeline(II_V_I);
    const state = newJudgeState();
    // Dm7: D2 | F3 A3 C4 → G7: G2 | F3 B3 C4? (Cは不要) → F3 B3 D4? 典型: F A C → F G B? ここでは F3 B3 D4
    const notes = [...chord(4, [38, 53, 57, 60]), ...chord(8, [43, 53, 59, 62])];
    judgeBar(tl, notes, 0, state, 20);
    const r = judgeBar(tl, notes, 1, state, 20);
    expect(r.correct).toBe(true);
    expect(r.movement).toBe(4);
    expect(r.bonus.voiceLeading).toBe(10);
  });
});

describe('次のコードの音とテンション', () => {
  it('次の小節頭を過ぎて弾いた共通音は前のコードのテンションにしない', () => {
    const specs: ChordSpec[] = [
      { deg: 4, quality: 'maj7' },
      { deg: 1, quality: 'maj7' },
    ];
    const tl = timeline(specs);
    // FM7（F A C E）→ 小節頭の0.1秒後に CM7+9（C E G B D）。B・D は FM7 の ♯11・13 でもある
    const notes = [...chord(4, [53, 57, 60, 64], 3.9), ...chord(8.1, [48, 52, 55, 59, 62])];
    const r = judgeBar(tl, notes, 0, newJudgeState(), 20);
    expect(r.correct).toBe(true);
    expect(r.bonus.tension).toBe(0);
    const r2 = judgeBar(tl, notes, 1, newJudgeState(), 20);
    expect(r2.correct).toBe(true);
    expect(r2.bonus.tension).toBe(10); // D = 9th
  });
});

describe('voiceMovement', () => {
  it('最小の対応', () => {
    expect(voiceMovement([65, 69, 72], [65, 71, 74])).toBe(4);
    expect(voiceMovement([60, 64], [60, 64, 67])).toBe(3);
  });
});

describe('ルート段階', () => {
  const ROOTS: ChordSpec[] = [
    { deg: 2, quality: 'min' },
    { deg: 5, quality: 'maj' },
  ];
  it('根音があれば正解で、ほかの音は減点しない', () => {
    const tl = timeline(ROOTS, 'root');
    // Ⅱ = D に、和音（D F A）＋関係ない C♯ を混ぜる
    const notes = chord(4, [50, 53, 57, 61]);
    const r = judgeBar(tl, notes, 0, newJudgeState(), 20);
    expect(r.correct).toBe(true);
    expect(r.penalty).toBe(0);
    expect(r.bonusTotal).toBe(0);
    expect(r.score).toBe(100);
  });
  it('根音がなければ不正解', () => {
    const tl = timeline(ROOTS, 'root');
    const r = judgeBar(tl, chord(4, [53, 57]), 0, newJudgeState(), 20);
    expect(r.correct).toBe(false);
  });
  it('次の根音を小節頭の少し前に弾いても次の小節に数える', () => {
    const tl = timeline(ROOTS, 'root');
    const notes = [...chord(4, [50], 3), ...chord(7.5, [55], 3)];
    const r = judgeBar(tl, notes, 1, newJudgeState(), 20);
    expect(r.correct).toBe(true);
  });
});
