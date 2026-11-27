// モード③ 構成音パズル（バーチャルピアノ・MIDI鍵盤の両方で答えられる）
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { KeyMark, Keyboard } from '../components/Keyboard';
import { distractorPool, pickChord, PlayChord, shuffle, UnitInfo, unitPool, unlockedSet } from '../game';
import { midi, useMidiState } from '../midi/midi';
import { explainChord } from '../music/explain';
import { closeVoicing, keyPrefersFlat, mod12, pcName } from '../music/theory';
import {
  getProgress,
  recordChord,
  recordHighScore,
  recordSession,
  updateProgress,
  useSettings,
} from '../store/progress';

export type PuzzleKind = 'degree' | 'reverse' | 'missing';

export const PUZZLE_LABEL: Record<PuzzleKind, string> = {
  degree: 'ディグリー → 構成音',
  reverse: '逆引き（4択）',
  missing: 'ミッシングノート',
};

const KB_START = 48; // C3
const KB_OCTAVES = 2;
const KB_END = KB_START + KB_OCTAVES * 12 + 1;
const TIME_BONUS = 30;
const TIME_BONUS_MS = 5000;
const MISTAKE = 20;

interface Question {
  pc: PlayChord;
  startedAt: number;
  mistakes: number;
  /** 正解で固定された鍵盤（音名 → 押した鍵盤） */
  found: Map<number, number>;
  /** 光らせている鍵盤（逆引き・ミッシング） */
  lit: number[];
  hiddenPc?: number;
  choices?: PlayChord[];
  chosen?: string;
  done: boolean;
  correct: boolean;
  score: number;
  timeMs: number;
}

interface Props {
  info: UnitInfo;
  kind: PuzzleKind;
  onExit: () => void;
}

const timeBonus = (ms: number) => Math.round(TIME_BONUS * Math.max(0, 1 - ms / TIME_BONUS_MS));

/** MIDI の音を画面の鍵盤の範囲に移す（同じ音名） */
const toKeyboard = (m: number) => {
  let x = m;
  while (x < KB_START) x += 12;
  while (x >= KB_END) x -= 12;
  return x;
};

export function Puzzle({ info, kind, onExit }: Props) {
  const settings = useSettings();
  useMidiState();
  const total = settings.puzzleQuestions;
  const pool = useMemo(() => unitPool(info), [info]);
  const distractors = useMemo(() => distractorPool(info), [info]);
  const preferFlat = keyPrefersFlat(info.themeKey.key);

  const [q, setQ] = useState<Question | null>(null);
  const [history, setHistory] = useState<Question[]>([]);
  const [wrongFlash, setWrongFlash] = useState<Set<number>>(new Set());
  const [finished, setFinished] = useState<null | { total: number; accuracy: number; newHigh: boolean; newUnlocks: number }>(
    null,
  );
  const advanceTimer = useRef<number>();
  // MIDI のリスナーから最新の状態を読むための参照
  const qRef = useRef(q);
  qRef.current = q;
  const historyRef = useRef(history);
  historyRef.current = history;

  const makeQuestion = useCallback(
    (prev: PlayChord | null): Question => {
      const pc = pickChord(getProgress(), pool, prev);
      const { rules } = pc;
      // ルートレスは根音を除いて表示する
      const display = closeVoicing(rules, KB_START, true).filter(
        (m) => rules.level !== 'rootless' || mod12(m) !== rules.chord.rootPc,
      );
      const base: Question = {
        pc,
        startedAt: performance.now(),
        mistakes: 0,
        found: new Map(),
        lit: [],
        done: false,
        correct: false,
        score: 0,
        timeMs: 0,
      };
      if (kind === 'reverse') {
        const litSet = new Set(display.map(mod12));
        const ok = (d: PlayChord) => d.chord.id !== pc.chord.id && ![...litSet].every((x) => d.rules.chordTones.has(x));
        // テーマのコードを優先し、足りない分をダイアトニックで補う
        const poolIds = new Set(pool.map((p) => p.chord.id));
        const others = [
          ...shuffle(distractors.filter((d) => ok(d) && poolIds.has(d.chord.id))),
          ...shuffle(distractors.filter((d) => ok(d) && !poolIds.has(d.chord.id))),
        ].slice(0, 3);
        return { ...base, lit: display, choices: shuffle([pc, ...others]) };
      }
      if (kind === 'missing') {
        const candidates = display.filter((m) => rules.required.has(mod12(m)));
        const hidden = candidates[Math.floor(Math.random() * candidates.length)];
        return { ...base, lit: display.filter((m) => m !== hidden), hiddenPc: mod12(hidden) };
      }
      return base;
    },
    [pool, distractors, kind],
  );

  useEffect(() => {
    setQ(makeQuestion(null));
    return () => window.clearTimeout(advanceTimer.current);
  }, [makeQuestion]);

  const finishQuestion = (cur: Question, correct: boolean, score: number) => {
    const timeMs = performance.now() - cur.startedAt;
    const done: Question = { ...cur, done: true, correct, score, timeMs };
    qRef.current = done;
    setQ(done);
    const voicing =
      cur.lit.length > 0 && kind !== 'missing'
        ? cur.lit
        : closeVoicing(cur.pc.rules, KB_START, true);
    audio.playChord(voicing, 1.6, 0.02);
    const nextHistory = [...historyRef.current, done];
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    advanceTimer.current = window.setTimeout(() => advance(nextHistory, done), correct ? 1300 : 2200);
  };

  const advance = (hist: Question[], last: Question) => {
    window.clearTimeout(advanceTimer.current);
    if (hist.length >= total) {
      const sum = hist.reduce((a, h) => a + h.score, 0);
      const accuracy = hist.filter((h) => h.correct).length / hist.length;
      let newHigh = false;
      let newUnlocks = 0;
      const before = unlockedSet(getProgress());
      updateProgress((p) => {
        hist.forEach((h) => recordChord(p, h.pc.chord.id, h.correct, h.timeMs));
        recordSession(p, info.id, accuracy, hist.length);
        newHigh = recordHighScore(p, `puzzle-${kind}|${info.id}`, sum);
      });
      const after = unlockedSet(getProgress());
      newUnlocks = [...after].filter((u) => !before.has(u)).length;
      setFinished({ total: sum, accuracy, newHigh, newUnlocks });
      return;
    }
    setWrongFlash(new Set());
    setQ(makeQuestion(last.pc));
  };

  const flashWrong = (m: number) => {
    setWrongFlash((s) => new Set(s).add(m));
    window.setTimeout(
      () =>
        setWrongFlash((s) => {
          const n = new Set(s);
          n.delete(m);
          return n;
        }),
      350,
    );
  };

  /** 画面の鍵盤・MIDI 共通の入力 */
  const input = (m: number, fromMidi: boolean) => {
    const q = qRef.current;
    if (!q) return;
    if (q.done) {
      // MIDI は弾き終わりの余韻で押してしまいやすいので、次へ進むのは画面のタップだけ
      if (!fromMidi) advance(historyRef.current, q);
      return;
    }
    if (kind === 'reverse') return; // 逆引きは選択肢で答える
    const shown = toKeyboard(m);
    const pc = mod12(m);
    const { rules } = q.pc;
    const miss = () => {
      flashWrong(shown);
      const next = { ...q, mistakes: q.mistakes + 1 };
      qRef.current = next;
      setQ(next);
    };

    if (kind === 'degree') {
      if (q.found.has(pc)) return; // 同じ音名を別オクターブでタップ：無視
      if (!rules.chordTones.has(pc)) {
        miss();
        return;
      }
      const found = new Map(q.found).set(pc, shown);
      const next = { ...q, found };
      if ([...rules.required].every((r) => found.has(r))) {
        const t = performance.now() - q.startedAt;
        finishQuestion(next, q.mistakes === 0, Math.max(0, 100 + timeBonus(t) - q.mistakes * MISTAKE));
      } else {
        qRef.current = next;
        setQ(next);
      }
      return;
    }

    if (kind === 'missing') {
      if (q.lit.some((l) => mod12(l) === pc)) return;
      if (pc !== q.hiddenPc) {
        miss();
        return;
      }
      const t = performance.now() - q.startedAt;
      const next = { ...q, found: new Map([[pc, shown]]) };
      finishQuestion(next, q.mistakes === 0, Math.max(0, 100 + timeBonus(t) - q.mistakes * MISTAKE));
    }
  };
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(
    () =>
      midi.onNote((e) => {
        if (e.type === 'on') inputRef.current(e.midi, true);
      }),
    [],
  );

  const onPress = (m: number) => {
    void audio.start();
    // MIDI の音はモニター設定で鳴るので、画面の鍵盤のときだけ鳴らす
    if (qRef.current && !qRef.current.done) audio.playNote(m, 0.6);
    input(m, false);
  };

  const onChoose = (choice: PlayChord) => {
    void audio.start();
    if (!q || q.done) return;
    const ok = choice.chord.id === q.pc.chord.id;
    const t = performance.now() - q.startedAt;
    finishQuestion({ ...q, chosen: choice.chord.id }, ok, ok ? 100 + timeBonus(t) : 0);
  };

  const marks = useMemo(() => {
    const map = new Map<number, KeyMark>();
    if (!q) return map;
    q.lit.forEach((m) => map.set(m, 'lit'));
    q.found.forEach((m) => map.set(m, 'correct'));
    wrongFlash.forEach((m) => map.set(m, 'wrong'));
    return map;
  }, [q, wrongFlash]);

  const showNames = settings.noteNames === 'show' || (settings.noteNames === 'after' && q?.done);
  const label = useCallback(
    (m: number) => (showNames ? pcName(m, preferFlat) : null),
    [showNames, preferFlat],
  );

  if (finished) {
    const best = getProgress().highScores[`puzzle-${kind}|${info.id}`] ?? 0;
    return (
      <div className="screen">
        <header className="bar">
          <button className="ghost" onClick={onExit}>
            ← 戻る
          </button>
          <h2>結果</h2>
        </header>
        <div className="result-card">
          <div className="big-score">{finished.total}</div>
          <div>
            正解率 {Math.round(finished.accuracy * 100)}%（ミスなしで正解した問題の割合）
            {finished.newHigh && <span className="badge gold">ハイスコア！</span>}
          </div>
          <div className="muted">ハイスコア {best}</div>
          {finished.accuracy >= 0.9 && <div className="ok">正解率90%以上：このキーをクリア</div>}
          {finished.newUnlocks > 0 && <div className="badge gold">新しく {finished.newUnlocks} 件解放されました</div>}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>お題</th>
              <th>時間</th>
              <th>ミス</th>
              <th>点</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i} className={h.correct ? '' : 'ng'}>
                <td>{i + 1}</td>
                <td>
                  {h.pc.chord.label}（{h.pc.chord.name}）
                </td>
                <td>{(h.timeMs / 1000).toFixed(1)}秒</td>
                <td>{kind === 'reverse' ? (h.correct ? '' : '誤答') : h.mistakes}</td>
                <td>{h.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <button
            className="primary"
            onClick={() => {
              setHistory([]);
              setFinished(null);
              setQ(makeQuestion(null));
            }}
          >
            もう一度
          </button>
          <button onClick={onExit}>やめる</button>
        </div>
      </div>
    );
  }

  if (!q) return null;
  const chord = q.pc.chord;
  // 逆引きは答えがわかってしまうので、解説は回答後に出す
  const explanation = explainChord(chord, q.pc.rules.level);
  const sumSoFar = history.reduce((a, h) => a + h.score, 0);

  let prompt: React.ReactNode;
  if (kind === 'degree') {
    prompt = (
      <>
        <div className="muted">{info.themeKey.display}キー</div>
        <div className="degree">{chord.label}</div>
        {q.done && <div className="chord-name">{chord.name}</div>}
      </>
    );
  } else if (kind === 'missing') {
    prompt = (
      <>
        <div className="muted">{info.themeKey.display}キー　足りない1音をタップ</div>
        <div className="degree">{chord.label}</div>
        {q.done && <div className="chord-name">{chord.name}</div>}
      </>
    );
  } else {
    prompt = (
      <>
        <div className="muted">{info.themeKey.display}キー　光っているのはどのコード？</div>
        {q.done && (
          <div className="chord-name">
            {chord.label}（{chord.name}）
          </div>
        )}
      </>
    );
  }

  return (
    <div className="screen puzzle">
      <header className="bar">
        <button className="ghost" onClick={onExit}>
          ← 戻る
        </button>
        <h2>{PUZZLE_LABEL[kind]}</h2>
        <span className="muted">
          {Math.min(history.length + 1, total)}/{total}　{sumSoFar}点
        </span>
      </header>
      <div className={`prompt ${q.done ? (q.correct ? 'flash-ok' : 'flash-ng') : ''}`}>
        {prompt}
        {q.done && (
          <div className="muted">
            +{q.score}点{q.mistakes > 0 && `（ミス ${q.mistakes}）`}　タップで次へ
          </div>
        )}
        {!q.done && kind !== 'reverse' && q.mistakes > 0 && <div className="ng-text">ミス {q.mistakes}</div>}
      </div>
      {explanation && (kind !== 'reverse' || q.done) && (
        <details className="explain" open>
          <summary>{explanation.title}</summary>
          {explanation.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          {q.done &&
            explanation.answer.map((line, i) => (
              <p key={`a${i}`} className="answer">
                {line}
              </p>
            ))}
        </details>
      )}
      {kind === 'reverse' && q.choices && (
        <div className="choices">
          {q.choices.map((c) => {
            const cls =
              q.done && c.chord.id === chord.id ? 'correct' : q.done && c.chord.id === q.chosen ? 'wrong' : '';
            return (
              <button key={c.chord.id} className={`choice ${cls}`} onClick={() => (q.done ? advance(history, q) : onChoose(c))}>
                {c.chord.label}
              </button>
            );
          })}
        </div>
      )}
      {kind !== 'reverse' && (
        <p className="small muted">
          {midi.hasInput() ? 'MIDI鍵盤でも画面の鍵盤でも答えられます。' : '画面の鍵盤をタップして答えます。'}
          オクターブは問いません。
        </p>
      )}
      <div className="rotate-hint">横向きにすると鍵盤が押しやすくなります</div>
      <Keyboard start={KB_START} octaves={KB_OCTAVES} marks={marks} label={label} onPress={onPress} />
    </div>
  );
}
