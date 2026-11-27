// モード④ スケール練習：始まりのディグリーから順に、キーのスケールの7音を弾く
// MIDI鍵盤と画面の鍵盤の両方で答えられる。テンポはなく、自分のペースで弾く
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { KeyMark, Keyboard } from '../components/Keyboard';
import { UnitInfo, unlockedSet } from '../game';
import { midi, useMidiState } from '../midi/midi';
import { judgeScaleNote, ScaleTask, scaleTask } from '../music/scale';
import { keyPrefersFlat, mod12, pcName } from '../music/theory';
import {
  chordWeight,
  getProgress,
  pickWeighted,
  recordChord,
  recordHighScore,
  recordSession,
  updateProgress,
  useSettings,
} from '../store/progress';

const KB_START = 48; // C3
const KB_OCTAVES = 2;
const KB_END = KB_START + KB_OCTAVES * 12;
const TIME_BONUS = 30;
const TIME_BONUS_MS = 10000; // 7音なので、パズルの倍の時間をかけて0まで減らす
const MISTAKE = 20;

interface Question {
  task: ScaleTask;
  startedAt: number;
  /** 正解した音の数 */
  pos: number;
  mistakes: number;
  /** 正解で固定した鍵盤 → 何番目の音か */
  found: Map<number, number>;
  done: boolean;
  correct: boolean;
  score: number;
  timeMs: number;
}

interface Props {
  info: UnitInfo;
  onExit: () => void;
}

const timeBonus = (ms: number) => Math.round(TIME_BONUS * Math.max(0, 1 - ms / TIME_BONUS_MS));

/** 画面の鍵盤の範囲に収まるよう、オクターブを移す */
const toKeyboard = (m: number) => {
  let x = m;
  while (x < KB_START) x += 12;
  while (x >= KB_END) x -= 12;
  return x;
};

export function ScalePractice({ info, onExit }: Props) {
  const settings = useSettings();
  useMidiState();
  const total = settings.puzzleQuestions;
  const key = info.themeKey.key;
  const preferFlat = keyPrefersFlat(key);
  const tasks = useMemo(() => [1, 2, 3, 4, 5, 6, 7].map((d) => scaleTask(key, d)), [key]);

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
    (prev: ScaleTask | null): Question => {
      // 苦手な始まりの音ほど出やすく、同じお題は続けない
      const p = getProgress();
      const task = pickWeighted(
        tasks,
        (t) => chordWeight(p.chordStats[t.id]),
        (t) => t.id === prev?.id,
      );
      return {
        task,
        startedAt: performance.now(),
        pos: 0,
        mistakes: 0,
        found: new Map(),
        done: false,
        correct: false,
        score: 0,
        timeMs: 0,
      };
    },
    [tasks],
  );

  useEffect(() => {
    setQ(makeQuestion(null));
    return () => window.clearTimeout(advanceTimer.current);
  }, [makeQuestion]);

  const advance = (hist: Question[], last: Question) => {
    window.clearTimeout(advanceTimer.current);
    if (hist.length >= total) {
      const sum = hist.reduce((a, h) => a + h.score, 0);
      const accuracy = hist.filter((h) => h.correct).length / hist.length;
      let newHigh = false;
      const before = unlockedSet(getProgress());
      updateProgress((p) => {
        hist.forEach((h) => recordChord(p, h.task.id, h.correct, h.timeMs));
        recordSession(p, info.id, accuracy, hist.length);
        newHigh = recordHighScore(p, `scale|${info.id}`, sum);
      });
      const after = unlockedSet(getProgress());
      const newUnlocks = [...after].filter((u) => !before.has(u)).length;
      setFinished({ total: sum, accuracy, newHigh, newUnlocks });
      return;
    }
    setWrongFlash(new Set());
    setQ(makeQuestion(last.task));
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

  const finishQuestion = (cur: Question) => {
    const timeMs = performance.now() - cur.startedAt;
    const correct = cur.mistakes === 0;
    const score = Math.max(0, 100 + timeBonus(timeMs) - cur.mistakes * MISTAKE);
    const done: Question = { ...cur, done: true, correct, score, timeMs };
    setQ(done);
    // 答え合わせに、弾いたスケールを上行で鳴らす
    const first = KB_START + cur.task.steps[0].pc;
    const midis = cur.task.steps.map((s) => first + mod12(s.pc - cur.task.steps[0].pc));
    audio.playChord([...midis, first + 12], 0.5, 0.22);
    const nextHistory = [...historyRef.current, done];
    setHistory(nextHistory);
    advanceTimer.current = window.setTimeout(() => advance(nextHistory, done), correct ? 2000 : 2800);
  };

  /** 画面の鍵盤・MIDI 共通の入力 */
  const input = (m: number, fromMidi: boolean) => {
    const cur = qRef.current;
    if (!cur) return;
    if (cur.done) {
      // MIDI は弾き終わりの余韻で押してしまいやすいので、次へ進むのは画面のタップだけ
      if (!fromMidi) advance(historyRef.current, cur);
      return;
    }
    const judge = judgeScaleNote(cur.task, cur.pos, m);
    const shown = toKeyboard(m);
    if (judge === 'ignore') return;
    if (judge === 'wrong') {
      flashWrong(shown);
      const next = { ...cur, mistakes: cur.mistakes + 1 };
      qRef.current = next;
      setQ(next);
      return;
    }
    const found = new Map(cur.found).set(shown, cur.pos);
    const next = { ...cur, pos: cur.pos + 1, found };
    qRef.current = next;
    if (next.pos >= cur.task.steps.length) finishQuestion(next);
    else setQ(next);
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
    audio.playNote(m, 0.6);
    input(m, false);
  };

  const marks = useMemo(() => {
    const map = new Map<number, KeyMark>();
    if (!q) return map;
    q.found.forEach((_, m) => map.set(m, 'correct'));
    wrongFlash.forEach((m) => map.set(m, 'wrong'));
    return map;
  }, [q, wrongFlash]);

  const showNames = settings.noteNames === 'show' || (settings.noteNames === 'after' && q?.done);
  const label = useCallback(
    (m: number) => {
      const idx = q?.found.get(m);
      if (q && idx !== undefined) {
        const step = q.task.steps[idx];
        return showNames ? `${step.roman}\n${step.name}` : step.roman;
      }
      return showNames ? pcName(m, preferFlat) : null;
    },
    [q, showNames, preferFlat],
  );

  if (finished) {
    const best = getProgress().highScores[`scale|${info.id}`] ?? 0;
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
            正解率 {Math.round(finished.accuracy * 100)}%（ミスなしで弾けた問題の割合）
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
                  {h.task.steps[0].roman}から（{h.task.steps.map((s) => s.name).join(' ')}）
                </td>
                <td>{(h.timeMs / 1000).toFixed(1)}秒</td>
                <td>{h.mistakes}</td>
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
  const sumSoFar = history.reduce((a, h) => a + h.score, 0);
  const modeName = key.mode === 'minor' ? 'マイナー' : 'メジャー';

  return (
    <div className="screen puzzle">
      <header className="bar">
        <button className="ghost" onClick={onExit}>
          ← 戻る
        </button>
        <h2>スケール練習</h2>
        <span className="muted">
          {Math.min(history.length + 1, total)}/{total}　{sumSoFar}点
        </span>
      </header>
      <div className={`prompt ${q.done ? (q.correct ? 'flash-ok' : 'flash-ng') : ''}`}>
        <div className="muted">
          {info.themeKey.display}
          {modeName}スケールを、順に7音
        </div>
        <div className="degree">{q.task.steps[0].roman}から</div>
        <div className="scale-steps">
          {q.task.steps.map((s, i) => (
            <div key={i} className={`scale-step ${i < q.pos ? 'done' : i === q.pos && !q.done ? 'current' : ''}`}>
              <span className="roman">{s.roman}</span>
              <span className="name">{i < q.pos ? s.name : '・'}</span>
            </div>
          ))}
        </div>
        {q.done && (
          <div className="muted">
            +{q.score}点{q.mistakes > 0 && `（ミス ${q.mistakes}）`}　タップで次へ
          </div>
        )}
        {!q.done && q.mistakes > 0 && <div className="ng-text">ミス {q.mistakes}</div>}
      </div>
      <p className="small muted">
        {midi.hasInput() ? 'MIDI鍵盤でも画面の鍵盤でも弾けます。' : '画面の鍵盤をタップして答えます。'}
        オクターブは問いません。
      </p>
      <div className="rotate-hint">横向きにすると鍵盤が押しやすくなります</div>
      <Keyboard start={KB_START} octaves={KB_OCTAVES} marks={marks} label={label} onPress={onPress} />
    </div>
  );
}
