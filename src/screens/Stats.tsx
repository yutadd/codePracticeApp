import { allUnits, unitInfo } from '../game';
import { chordWeight, useProgress } from '../store/progress';
import { PUZZLE_LABEL, PuzzleKind } from './Puzzle';

interface Props {
  onExit: () => void;
}

const MODE_LABEL: Record<string, string> = {
  flash: 'フラッシュ',
  scale: 'スケール練習',
  ...Object.fromEntries(Object.entries(PUZZLE_LABEL).map(([k, v]) => [`puzzle-${k as PuzzleKind}`, v])),
};

export function Stats({ onExit }: Props) {
  const p = useProgress();
  const chords = Object.entries(p.chordStats).sort((a, b) => chordWeight(b[1]) - chordWeight(a[1]));
  const titles = new Map(allUnits().map((u) => [unitInfo(u).id, unitInfo(u).title]));
  const scores = Object.entries(p.highScores).sort();

  return (
    <div className="screen">
      <header className="bar">
        <button className="ghost" onClick={onExit}>
          ← 戻る
        </button>
        <h2>記録</h2>
      </header>

      <section>
        <h3>コード統計（苦手な順）</h3>
        {chords.length === 0 ? (
          <p className="muted">まだ記録がありません。</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>コード</th>
                <th>回数</th>
                <th>正解率</th>
                <th>平均反応</th>
              </tr>
            </thead>
            <tbody>
              {chords.map(([id, s]) => (
                <tr key={id}>
                  <td>{id.replace(':', 'キー ')}</td>
                  <td>{s.attempts}</td>
                  <td>{Math.round((s.correct / s.attempts) * 100)}%</td>
                  <td>{s.timedCount > 0 ? `${(s.timeTotalMs / s.timedCount / 1000).toFixed(2)}秒` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>ハイスコア</h3>
        {scores.length === 0 ? (
          <p className="muted">まだ記録がありません。</p>
        ) : (
          <table className="table">
            <tbody>
              {scores.map(([key, score]) => {
                const [mode, ...rest] = key.split('|');
                const unit = rest.join('|');
                return (
                  <tr key={key}>
                    <td>{titles.get(unit) ?? unit}</td>
                    <td>{MODE_LABEL[mode] ?? mode}</td>
                    <td>{score}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
