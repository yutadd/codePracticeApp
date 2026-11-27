// モード① ディグリー・フラッシュの判定と採点
import { ChordRules, fits, mod12, roleOf } from './theory';

export interface NoteEvent {
  midi: number;
  /** note-on 時刻（秒、遅延補正済み、オーディオ時刻） */
  on: number;
  /** note-off 時刻。押されたままなら null */
  off: number | null;
}

export interface BarSpec {
  start: number; // 小節頭の時刻（秒）
  rules: ChordRules;
}

export interface Timeline {
  bars: BarSpec[];
  beat: number; // 1拍の長さ（秒）
  beatsPerBar: number;
}

export interface BarBonus {
  tension: number;
  voiceLeading: number;
  bassRoot: number;
  inversion: number;
}

export interface BarResult {
  index: number;
  correct: boolean;
  changeInTime: boolean;
  missing: number[];
  wrongPcs: number[];
  tensionPcs: number[];
  penalty: number;
  bonus: BarBonus;
  bonusTotal: number;
  score: number;
  voicing: number[];
  shape: string;
  movement: number | null;
  reactionMs: number | null;
}

export interface JudgeState {
  /** 前の小節の正解時のヴォイシング（MIDIノート） */
  prevVoicing: number[] | null;
  /** コードIDごとの前回の押さえ方 */
  lastShape: Map<string, string>;
}

export const newJudgeState = (): JudgeState => ({ prevVoicing: null, lastShape: new Map() });

export const SCORE = {
  base: 100,
  tensionEach: 10,
  tensionMax: 20,
  voiceLeadingClose: 20, // 3半音以内
  voiceLeadingNear: 10, // 6半音以内
  bassRoot: 10,
  inversion: 5,
  wrongNote: 15,
  bonusMax: 55,
};

const barEnd = (tl: Timeline, i: number) => tl.bars[i].start + tl.beat * tl.beatsPerBar;

/** その音を数える小節のインデックス。対象外なら -1 */
export function ownerBar(tl: Timeline, t: number, midi: number): number {
  const { bars, beat } = tl;
  const n = bars.length;
  if (n === 0) return -1;
  const pc = mod12(midi);
  // 小節頭 k の前後1拍（重なり区間）にあるか
  for (let k = 0; k <= n; k++) {
    const b = k < n ? bars[k].start : barEnd(tl, n - 1);
    if (t >= b - beat && t < b + beat) {
      const cur = k - 1;
      const next = k < n ? k : -1;
      const fitsCur = cur >= 0 && fits(bars[cur].rules, pc);
      const fitsNext = next >= 0 && fits(bars[next].rules, pc);
      if (next >= 0 && fitsNext && !fitsCur) return next;
      if (cur >= 0) return cur;
      // 最初の小節の前（カウントイン中）：合わない音は数えない
      return fitsNext || t >= b ? next : -1;
    }
  }
  for (let i = 0; i < n; i++) {
    if (t >= bars[i].start && t < barEnd(tl, i)) return i;
  }
  return -1;
}

/** 経過音の判定（3条件すべてを満たすか） */
export function isPassingTone(tl: Timeline, notes: NoteEvent[], note: NoteEvent, now: number): boolean {
  const { beat } = tl;
  const off = note.off ?? now;
  if (off - note.on >= beat / 2) return false;
  if (note.off === null && now - note.on < beat / 2) return false;
  // 拍の頭（前後1/8拍）ではない
  const origin = tl.bars[0]?.start ?? 0;
  const pos = (note.on - origin) / beat;
  const distToBeat = Math.abs(pos - Math.round(pos));
  if (distToBeat <= 1 / 8) return false;
  // 半拍以内に、全音以内の構成音・テンションへ進む
  return notes.some((m) => {
    if (m === note || m.on <= note.on || m.on - note.on > beat / 2) return false;
    const dist = Math.abs(m.midi - note.midi);
    if (dist === 0 || dist > 2) return false;
    const owner = ownerBar(tl, m.on, m.midi);
    return owner >= 0 && fits(tl.bars[owner].rules, m.midi);
  });
}

/** 上声の移動量（最小になる対応）。片方が空なら null */
export function voiceMovement(prev: number[], cur: number[]): number | null {
  if (prev.length === 0 || cur.length === 0) return null;
  const [small, large] = prev.length <= cur.length ? [prev, cur] : [cur, prev];
  const s = small.slice(0, 8);
  const l = large.slice(0, 8);
  let best = Infinity;
  const used = new Array(l.length).fill(false);
  const rec = (i: number, acc: number) => {
    if (acc >= best) return;
    if (i === s.length) {
      // 対応しなかった音は、最も近い音への距離を足す
      let extra = 0;
      for (let j = 0; j < l.length; j++) {
        if (!used[j]) extra += Math.min(...s.map((x) => Math.abs(x - l[j])));
      }
      best = Math.min(best, acc + extra);
      return;
    }
    for (let j = 0; j < l.length; j++) {
      if (used[j]) continue;
      used[j] = true;
      rec(i + 1, acc + Math.abs(s[i] - l[j]));
      used[j] = false;
    }
  };
  rec(0, 0);
  return best;
}

/** 小節 i を判定する。小節頭から1拍半過ぎ（次の小節頭 +1.5拍）以降に呼ぶ */
export function judgeBar(tl: Timeline, notes: NoteEvent[], i: number, state: JudgeState, now: number): BarResult {
  const { bars, beat } = tl;
  const bar = bars[i];
  const rules = bar.rules;
  const owned = notes.filter((n) => ownerBar(tl, n.on, n.midi) === i);
  // 小節頭の前後1拍で弾いた「両方に合う音」は前の小節に数えるが、共通音として今のコードの音にも数える
  const shared =
    i > 0
      ? notes.filter(
          (n) =>
            n.on >= bar.start - beat &&
            n.on < bar.start + beat &&
            ownerBar(tl, n.on, n.midi) === i - 1 &&
            fits(rules, n.midi),
        )
      : [];

  const fitting = [...owned.filter((n) => fits(rules, n.midi)), ...shared];
  // 次の小節頭を過ぎてから弾いた「両方に合う音」は次のコードのための音なので、ボーナスの対象にしない
  const nextBar = bars[i + 1];
  const forBonus = nextBar
    ? fitting.filter((n) => !(n.on >= nextBar.start && fits(nextBar.rules, n.midi)))
    : fitting;
  const nonFitting = owned.filter((n) => !fits(rules, n.midi) && !isPassingTone(tl, notes, n, now));

  const playedPcs = new Set(fitting.map((n) => mod12(n.midi)));
  const missing = [...rules.required].filter((pc) => !playedPcs.has(pc));
  const changeInTime = notes.some(
    (n) => n.on >= bar.start - beat && n.on < bar.start + beat && rules.chordTones.has(mod12(n.midi)),
  );
  const wrongPcs = [...new Set(nonFitting.map((n) => mod12(n.midi)))];
  const penalty = wrongPcs.length * SCORE.wrongNote;
  const correct = missing.length === 0 && changeInTime;

  // 小節の前半で弾いた構成音・テンションをヴォイシングとみなす
  const half = bar.start + (beat * tl.beatsPerBar) / 2;
  let voiceNotes = forBonus.filter((n) => n.on < half);
  if (voiceNotes.length === 0) voiceNotes = forBonus;
  const voicing = [...new Set(voiceNotes.map((n) => n.midi))].sort((a, b) => a - b);
  const shape = voicing.map((m) => roleOf(rules, m)).join('-');
  const tensionPcs = [...new Set(forBonus.map((n) => mod12(n.midi)))].filter((pc) => rules.tensions.has(pc));

  const bonus: BarBonus = { tension: 0, voiceLeading: 0, bassRoot: 0, inversion: 0 };
  let movement: number | null = null;
  // ルート段階はボーナスなし（根音がそろえば100点）
  if (correct && rules.level !== 'root') {
    bonus.tension = Math.min(SCORE.tensionMax, tensionPcs.length * SCORE.tensionEach);
    if (state.prevVoicing) {
      movement = voiceMovement(state.prevVoicing.slice(1), voicing.slice(1));
      if (movement !== null) {
        if (movement <= 3) bonus.voiceLeading = SCORE.voiceLeadingClose;
        else if (movement <= 6) bonus.voiceLeading = SCORE.voiceLeadingNear;
      }
    }
    if (rules.level !== 'rootless' && voicing.length > 0 && mod12(voicing[0]) === rules.chord.rootPc) {
      bonus.bassRoot = SCORE.bassRoot;
    }
    const last = state.lastShape.get(rules.chord.id);
    if (last !== undefined && last !== shape) bonus.inversion = SCORE.inversion;
  }
  const bonusTotal = Math.min(SCORE.bonusMax, bonus.tension + bonus.voiceLeading + bonus.bassRoot + bonus.inversion);
  const score = correct ? Math.max(0, SCORE.base + bonusTotal - penalty) : 0;

  // ルート段階はどの音も「合う音」になるので、反応時間は根音で測る
  const timed = rules.level === 'root' ? fitting.filter((n) => rules.required.has(mod12(n.midi))) : fitting;
  const firstFit = timed.reduce<number | null>((m, n) => (m === null || n.on < m ? n.on : m), null);
  const reactionMs = firstFit === null ? null : Math.max(0, (firstFit - bar.start) * 1000);

  if (correct) {
    state.prevVoicing = voicing;
    state.lastShape.set(rules.chord.id, shape);
  } else {
    state.prevVoicing = null;
  }

  return {
    index: i,
    correct,
    changeInTime,
    missing,
    wrongPcs,
    tensionPcs,
    penalty,
    bonus,
    bonusTotal,
    score,
    voicing,
    shape,
    movement,
    reactionMs,
  };
}

export type Rank = 'S' | 'A' | 'B' | 'C';

/** 満点は基本点（100×小節数）とする */
export function rankFor(total: number, bars: number): Rank {
  const ratio = bars === 0 ? 0 : total / (SCORE.base * bars);
  if (ratio >= 0.9) return 'S';
  if (ratio >= 0.75) return 'A';
  if (ratio >= 0.6) return 'B';
  return 'C';
}
