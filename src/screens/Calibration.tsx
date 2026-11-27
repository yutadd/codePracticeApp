// 遅延補正：クリックに合わせて鍵盤を叩き、ずれを測る（MIDI機器×端末ごとに保存）
import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { midi, useMidiState } from '../midi/midi';
import { latencyKey, updateProgress, useProgress } from '../store/progress';

const TEMPO = 80;
const COUNT_IN = 4;
const TAPS = 12;

interface Props {
  onExit: () => void;
}

export function Calibration({ onExit }: Props) {
  useMidiState();
  const progress = useProgress();
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [offsets, setOffsets] = useState<number[]>([]);
  const [beatNo, setBeatNo] = useState(-1);
  const [result, setResult] = useState<number | null>(null);
  const clicks = useRef<number[]>([]);
  const taps = useRef<number[]>([]);
  const timer = useRef<number>();

  const device = midi.currentDeviceName();
  const key = device ? latencyKey(device) : null;
  const saved = key ? progress.latency[key] : undefined;

  useEffect(
    () =>
      midi.onNote((e) => {
        if (e.type !== 'on' || clicks.current.length === 0) return;
        const t = audio.perfToAudioTime(e.time);
        taps.current.push(t);
      }),
    [],
  );

  useEffect(() => () => window.clearInterval(timer.current), []);

  const start = async () => {
    await audio.start();
    audio.setMetronomeVolume(1);
    const beat = 60 / TEMPO;
    const t0 = audio.now() + 0.4;
    clicks.current = Array.from({ length: COUNT_IN + TAPS }, (_, i) => t0 + i * beat);
    clicks.current.forEach((t, i) => audio.click(t, i % 4 === 0));
    taps.current = [];
    setOffsets([]);
    setResult(null);
    setPhase('running');
    timer.current = window.setInterval(() => {
      const now = audio.now();
      const n = Math.floor((now - t0) / beat);
      setBeatNo(n);
      if (now > clicks.current[clicks.current.length - 1] + beat) {
        window.clearInterval(timer.current);
        compute(beat);
      }
    }, 30);
  };

  const compute = (beat: number) => {
    const targets = clicks.current.slice(COUNT_IN);
    const offs: number[] = [];
    for (const tap of taps.current) {
      const nearest = targets.reduce((a, b) => (Math.abs(b - tap) < Math.abs(a - tap) ? b : a));
      const d = tap - nearest;
      if (Math.abs(d) < beat / 2 && tap > targets[0] - beat / 2) offs.push(d * 1000);
    }
    setOffsets(offs);
    setPhase('done');
    if (offs.length >= 4) {
      const sorted = [...offs].sort((a, b) => a - b);
      setResult(sorted[Math.floor(sorted.length / 2)]);
    }
  };

  const save = () => {
    if (!key || result === null) return;
    updateProgress((p) => {
      p.latency[key] = Math.round(result);
    });
  };

  return (
    <div className="screen">
      <header className="bar">
        <button className="ghost" onClick={onExit}>
          ← 戻る
        </button>
        <h2>遅延補正</h2>
      </header>
      <p>
        クリックが {COUNT_IN} 回鳴ったあと、続く {TAPS} 回のクリックに合わせて鍵盤を1つずつ叩いてください。ずれの中央値を補正値として保存します。
      </p>
      <p className="muted">
        入力：{device ?? 'なし'}　保存済みの補正値：{saved !== undefined ? `${saved}ms` : '未測定（0ms）'}
        <br />
        補正値は「MIDI機器×この端末」の組み合わせごとに保存されます。
      </p>
      {!device && <div className="warn">MIDI機器（またはPCキーボード入力）が必要です。</div>}
      {phase === 'running' && (
        <div className="stage">
          <div className="degree huge">{beatNo < COUNT_IN ? `${Math.max(0, COUNT_IN - beatNo)}` : '♪'}</div>
          <div className="muted">{beatNo < COUNT_IN ? '聞いて…' : '叩いて！'}</div>
        </div>
      )}
      {phase === 'done' && (
        <div className="result-card">
          {result !== null ? (
            <>
              <div className="big-score">{result.toFixed(0)}ms</div>
              <div className="muted">
                {offsets.length}回の入力（{offsets.map((o) => o.toFixed(0)).join(', ')}）
              </div>
              <button className="primary" onClick={save} disabled={!key}>
                この値を保存
              </button>
            </>
          ) : (
            <div className="warn">入力が足りませんでした（4回以上必要）。もう一度試してください。</div>
          )}
        </div>
      )}
      <div className="row">
        <button className="primary big" disabled={!device || phase === 'running'} onClick={start}>
          {phase === 'idle' ? '測定スタート' : 'もう一度測る'}
        </button>
        {key && saved !== undefined && (
          <button
            onClick={() =>
              updateProgress((p) => {
                delete p.latency[key];
              })
            }
          >
            補正値をリセット
          </button>
        )}
      </div>
    </div>
  );
}
