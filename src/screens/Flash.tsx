// モード① ディグリー・フラッシュ（MIDI専用）
import { useEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { Sequencer } from '../audio/sequencer';
import { KeyMark, Keyboard } from '../components/Keyboard';
import { makePlayChord, pickChord, PlayChord, UnitInfo, unitPool, unlockedSet } from '../game';
import {
  BarResult,
  judgeBar,
  JudgeState,
  newJudgeState,
  NoteEvent,
  rankFor,
  Rank,
  Timeline,
} from '../music/flashScoring';
import { fits, keyPrefersFlat, mod12, pcName } from '../music/theory';
import { midi, useHeldNotes, useMidiState } from '../midi/midi';
import {
  ClickMode,
  getProgress,
  latencyKey,
  recordChord,
  recordHighScore,
  recordSession,
  updateProgress,
  updateSettings,
  useProgress,
} from '../store/progress';

interface Props {
  info: UnitInfo;
  onExit: () => void;
  onCalibrate: () => void;
}

interface Run {
  t0: number;
  beat: number;
  bpb: number;
  chords: PlayChord[];
  timeline: Timeline;
  notes: NoteEvent[];
  held: Map<number, NoteEvent>;
  results: BarResult[];
  state: JudgeState;
  seq: Sequencer;
  latencySec: number;
}

interface Summary {
  total: number;
  rank: Rank;
  accuracy: number;
  maxCombo: number;
  newHigh: boolean;
  newUnlocks: number;
}

const JUDGE_DELAY_BEATS = 1.5;

export function Flash({ info, onExit, onCalibrate }: Props) {
  const progress = useProgress();
  const s = progress.settings;
  const theme = info.theme;
  useMidiState();
  const held = useHeldNotes();
  const pool = useMemo(() => unitPool(info), [info]);
  const progressions = theme.progressions(info.ref.level);
  const preferFlat = keyPrefersFlat(info.themeKey.key);

  const [order, setOrder] = useState<string>('random');
  const [phase, setPhase] = useState<'setup' | 'play' | 'result'>('setup');
  const [, setFrame] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const runRef = useRef<Run | null>(null);
  const rafRef = useRef<number>();

  const bassOn = s.bassOn[theme.id] ?? theme.bassDefault;
  const deviceName = midi.currentDeviceName();
  const latencyMs = deviceName ? (progress.latency[latencyKey(deviceName)] ?? 0) : 0;

  useEffect(() => {
    audio.setMetronomeVolume(s.metronomeVolume);
    audio.setAccompVolume(s.accompVolume);
  }, [s.metronomeVolume, s.accompVolume]);

  // 鍵盤入力を記録
  useEffect(
    () =>
      midi.onNote((e) => {
        const run = runRef.current;
        if (!run) return;
        const t = audio.perfToAudioTime(e.time) - run.latencySec;
        if (e.type === 'on') {
          const n: NoteEvent = { midi: e.midi, on: t, off: null };
          run.notes.push(n);
          run.held.set(e.midi, n);
        } else {
          const n = run.held.get(e.midi);
          if (n) {
            n.off = t;
            run.held.delete(e.midi);
          }
        }
      }),
    [],
  );

  useEffect(
    () => () => {
      runRef.current?.seq.stop();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const buildChords = (n: number): PlayChord[] => {
    if (order !== 'random') {
      const prog = progressions.find((p) => p.id === order) ?? progressions[0];
      return Array.from({ length: n }, (_, i) => makePlayChord(info, prog.chords[i % prog.chords.length]));
    }
    const out: PlayChord[] = [];
    const p = getProgress();
    for (let i = 0; i < n; i++) out.push(pickChord(p, pool, out[i - 1] ?? null));
    return out;
  };

  const start = async () => {
    await audio.start();
    audio.setMetronomeVolume(s.metronomeVolume);
    audio.setAccompVolume(s.accompVolume);
    const beat = 60 / s.tempo;
    const bpb = theme.beatsPerBar;
    const barDur = beat * bpb;
    const chords = buildChords(s.bars);
    const t0 = audio.now() + 0.3 + barDur; // 1小節のカウントイン
    const timeline: Timeline = {
      beat,
      beatsPerBar: bpb,
      bars: chords.map((c, i) => ({ start: t0 + i * barDur, rules: c.rules })),
    };
    const seq = new Sequencer({
      t0,
      beat,
      beatsPerBar: bpb,
      bars: s.bars,
      countInBars: 1,
      clickOn: s.metronomeOn,
      clickMode: s.clickMode,
      drums: s.drumsOn ? theme.drums : 'none',
      bass: bassOn ? theme.bass : 'none',
      swing: theme.swing,
      chordAt: (i) => chords[i]?.chord ?? null,
    });
    runRef.current = {
      t0,
      beat,
      bpb,
      chords,
      timeline,
      notes: [],
      held: new Map(),
      results: [],
      state: newJudgeState(),
      seq,
      latencySec: latencyMs / 1000,
    };
    seq.start();
    setPhase('play');
    loop();
  };

  const loop = () => {
    const run = runRef.current;
    if (!run) return;
    const now = audio.now();
    const barDur = run.beat * run.bpb;
    // 次の小節頭 +1.5拍を過ぎた小節から判定する
    while (run.results.length < run.chords.length) {
      const i = run.results.length;
      const judgeAt = run.t0 + (i + 1) * barDur + run.beat * JUDGE_DELAY_BEATS;
      if (now < judgeAt) break;
      run.results.push(judgeBar(run.timeline, run.notes, i, run.state, now));
    }
    setFrame((f) => f + 1);
    if (run.results.length >= run.chords.length) {
      finish(run);
      return;
    }
    rafRef.current = requestAnimationFrame(loop);
  };

  const finish = (run: Run) => {
    run.seq.stop();
    const total = run.results.reduce((a, r) => a + r.score, 0);
    const correctCount = run.results.filter((r) => r.correct).length;
    const accuracy = correctCount / run.results.length;
    let combo = 0;
    let maxCombo = 0;
    for (const r of run.results) {
      combo = r.correct ? combo + 1 : 0;
      maxCombo = Math.max(maxCombo, combo);
    }
    let newHigh = false;
    const before = unlockedSet(getProgress());
    updateProgress((p) => {
      run.results.forEach((r, i) => recordChord(p, run.chords[i].chord.id, r.correct, r.reactionMs));
      recordSession(p, info.id, accuracy, run.results.length);
      newHigh = recordHighScore(p, `flash|${info.id}`, total);
    });
    const after = unlockedSet(getProgress());
    setSummary({
      total,
      rank: rankFor(total, run.results.length),
      accuracy,
      maxCombo,
      newHigh,
      newUnlocks: [...after].filter((u) => !before.has(u)).length,
    });
    setPhase('result');
  };

  const stop = () => {
    runRef.current?.seq.stop();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    runRef.current = null;
    setPhase('setup');
  };

  // ---------- 設定 ----------
  if (phase === 'setup') {
    const canPlay = midi.hasInput();
    return (
      <div className="screen">
        <header className="bar">
          <button className="ghost" onClick={onExit}>
            ← 戻る
          </button>
          <h2>ディグリー・フラッシュ</h2>
        </header>
        <p className="muted">{info.title}</p>
        {!canPlay && (
          <div className="warn">
            {midi.supported
              ? 'MIDI機器が見つかりません。電子ピアノをUSB/Bluetoothで接続してください（設定でPCキーボード入力も使えます）。'
              : 'このブラウザはWeb MIDIに対応していません（PC・AndroidのChrome/Edgeで遊べます）。設定でPCキーボード入力に切り替えるとテストできます。'}
          </div>
        )}
        <div className="form">
          <label>
            お題
            <select value={order} onChange={(e) => setOrder(e.target.value)}>
              <option value="random">ランダム（苦手なコードを多めに）</option>
              {progressions.map((p) => (
                <option key={p.id} value={p.id}>
                  進行：{p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            テンポ {s.tempo}
            <input
              type="range"
              min={40}
              max={160}
              value={s.tempo}
              onChange={(e) => updateSettings({ tempo: Number(e.target.value) })}
            />
          </label>
          <label>
            小節数
            <select value={s.bars} onChange={(e) => updateSettings({ bars: Number(e.target.value) })}>
              {[4, 8, 12, 16, 24, 32].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={s.metronomeOn} onChange={(e) => updateSettings({ metronomeOn: e.target.checked })} />
            メトロノーム
          </label>
          <label>
            クリック位置
            <select value={s.clickMode} onChange={(e) => updateSettings({ clickMode: e.target.value as ClickMode })}>
              <option value="all">全拍</option>
              <option value="downbeat">拍頭のみ</option>
              <option value="backbeat">{theme.beatsPerBar === 3 ? '2・3拍目' : '2・4拍目'}</option>
            </select>
          </label>
          <label>
            メトロノーム音量
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.metronomeVolume}
              onChange={(e) => updateSettings({ metronomeVolume: Number(e.target.value) })}
            />
          </label>
          {theme.drums !== 'none' && (
            <label className="check">
              <input type="checkbox" checked={s.drumsOn} onChange={(e) => updateSettings({ drumsOn: e.target.checked })} />
              ドラム
            </label>
          )}
          {theme.bass !== 'none' && (
            <label className="check">
              <input
                type="checkbox"
                checked={bassOn}
                onChange={(e) => updateSettings({ bassOn: { ...s.bassOn, [theme.id]: e.target.checked } })}
              />
              ベース
            </label>
          )}
          {(theme.drums !== 'none' || theme.bass !== 'none') && (
            <label>
              伴奏音量
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.accompVolume}
                onChange={(e) => updateSettings({ accompVolume: Number(e.target.value) })}
              />
            </label>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={s.showChordName}
              onChange={(e) => updateSettings({ showChordName: e.target.checked })}
            />
            コード名も表示する
          </label>
        </div>
        <div className="muted">
          入力：{deviceName ?? 'なし'}　遅延補正：{latencyMs.toFixed(0)}ms{' '}
          <button className="link" onClick={onCalibrate}>
            測定する
          </button>
        </div>
        <div className="row">
          <button className="primary big" disabled={!canPlay} onClick={start}>
            スタート
          </button>
        </div>
      </div>
    );
  }

  // ---------- 結果 ----------
  if (phase === 'result' && summary && runRef.current) {
    const run = runRef.current;
    return (
      <div className="screen">
        <header className="bar">
          <button className="ghost" onClick={onExit}>
            ← 戻る
          </button>
          <h2>結果</h2>
        </header>
        <div className="result-card">
          <div className={`rank rank-${summary.rank}`}>{summary.rank}</div>
          <div className="big-score">{summary.total}</div>
          <div>
            正解率 {Math.round(summary.accuracy * 100)}%　最大コンボ {summary.maxCombo}
            {summary.newHigh && <span className="badge gold">ハイスコア！</span>}
          </div>
          {summary.accuracy >= 0.9 && <div className="ok">正解率90%以上：このキーをクリア</div>}
          {summary.newUnlocks > 0 && <div className="badge gold">新しく {summary.newUnlocks} 件解放されました</div>}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>小節</th>
              <th>お題</th>
              <th>判定</th>
              <th>点</th>
            </tr>
          </thead>
          <tbody>
            {run.results.map((r, i) => (
              <tr key={i} className={r.correct ? '' : 'ng'}>
                <td>{i + 1}</td>
                <td>
                  {run.chords[i].chord.label}（{run.chords[i].chord.name}）
                </td>
                <td>{describeResult(r, run.chords[i], preferFlat)}</td>
                <td>{r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <button className="primary" onClick={start}>
            もう一度
          </button>
          <button onClick={() => setPhase('setup')}>設定に戻る</button>
        </div>
      </div>
    );
  }

  // ---------- プレイ中 ----------
  const run = runRef.current;
  if (!run) return null;
  const now = audio.now();
  const barDur = run.beat * run.bpb;
  const pos = (now - run.t0) / barDur;
  const barIdx = Math.floor(pos);
  const beatInBar = Math.floor((now - run.t0 - barIdx * barDur) / run.beat);
  const cur = barIdx >= 0 ? run.chords[barIdx] : null;
  const next = run.chords[barIdx + 1] ?? null;
  const total = run.results.reduce((a, r) => a + r.score, 0);
  let combo = 0;
  for (let i = run.results.length - 1; i >= 0 && run.results[i].correct; i--) combo++;
  const last = run.results[run.results.length - 1];

  const marks = new Map<number, KeyMark>();
  held.forEach((m) => marks.set(m, !cur || fits(cur.rules, m) ? 'held' : 'heldBad'));

  return (
    <div className="screen flash">
      <header className="bar">
        <button className="ghost" onClick={stop}>
          ■ 中止
        </button>
        <span>
          {Math.max(0, Math.min(barIdx + 1, run.chords.length))}/{run.chords.length}小節
        </span>
        <span>
          {total}点　{combo > 1 && <b className="combo">{combo} combo</b>}
        </span>
      </header>
      <div className="beats">
        {Array.from({ length: run.bpb }, (_, i) => (
          <span key={i} className={`dot ${i === beatInBar ? 'on' : ''} ${i === 0 ? 'accent' : ''}`} />
        ))}
      </div>
      <div className="stage">
        {cur ? (
          <>
            <div className="degree huge">{cur.chord.label}</div>
            {s.showChordName && <div className="chord-name">{cur.chord.name}</div>}
          </>
        ) : barIdx < 0 ? (
          <div className="degree huge muted">Ready</div>
        ) : (
          <div className="degree huge muted">終了</div>
        )}
        <div className="next">
          {(barIdx < 0 ? run.chords[0] : next) && (
            <>
              次：<b>{(barIdx < 0 ? run.chords[0] : next)!.chord.label}</b>
              {s.showChordName && <span className="muted">（{(barIdx < 0 ? run.chords[0] : next)!.chord.name}）</span>}
            </>
          )}
        </div>
      </div>
      <div className={`feedback ${last ? (last.correct ? 'ok' : 'ng') : ''}`}>
        {last && (
          <>
            {run.chords[last.index].chord.label}：{last.correct ? `+${last.score}` : '×'}{' '}
            <span className="muted">{describeResult(last, run.chords[last.index], preferFlat)}</span>
          </>
        )}
      </div>
      <Keyboard start={36} octaves={4} marks={marks} height="22vh" />
    </div>
  );
}

function describeResult(r: BarResult, pc: PlayChord, preferFlat: boolean): string {
  const name = (p: number) => {
    const tone = pc.chord.tones.find((t) => t.pc === p);
    return tone?.name ?? pc.rules.tensions.get(p)?.noteName ?? pcName(p, preferFlat);
  };
  const parts: string[] = [];
  if (!r.changeInTime) parts.push('チェンジ遅れ');
  if (r.missing.length > 0) parts.push(`不足：${r.missing.map(name).join('・')}`);
  if (r.wrongPcs.length > 0) parts.push(`余分：${r.wrongPcs.map((p) => pcName(p, preferFlat)).join('・')} −${r.penalty}`);
  if (r.correct) {
    if (r.bonus.tension) parts.push(`テンション ${r.tensionPcs.map((p) => pc.rules.tensions.get(mod12(p))?.name).join(',')} +${r.bonus.tension}`);
    if (r.bonus.voiceLeading) parts.push(`VL(${r.movement}) +${r.bonus.voiceLeading}`);
    if (r.bonus.bassRoot) parts.push(`ベース根音 +${r.bonus.bassRoot}`);
    if (r.bonus.inversion) parts.push(`転回 +${r.bonus.inversion}`);
  }
  return parts.join('　') || (r.correct ? 'OK' : '');
}
