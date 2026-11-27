import { memo } from 'react';
import { mod12 } from '../music/theory';

export type KeyMark = 'correct' | 'wrong' | 'lit' | 'held' | 'heldBad';

interface Props {
  /** 一番左の音（Cにする） */
  start: number;
  octaves: number;
  marks?: Map<number, KeyMark>;
  label?: (midi: number) => string | null;
  onPress?: (midi: number) => void;
  height?: number | string;
}

const BLACK = new Set([1, 3, 6, 8, 10]);

export const Keyboard = memo(function Keyboard({ start, octaves, marks, label, onPress, height }: Props) {
  const notes = Array.from({ length: octaves * 12 + 1 }, (_, i) => start + i);
  const whites = notes.filter((m) => !BLACK.has(mod12(m)));
  const whiteW = 100 / whites.length;

  const press = (m: number) => (e: React.PointerEvent) => {
    if (!onPress) return;
    e.preventDefault();
    onPress(m);
  };

  return (
    <div className={`keyboard${onPress ? ' interactive' : ''}`} style={{ height }}>
      {whites.map((m) => (
        <div key={m} className={`key white ${marks?.get(m) ?? ''}`} onPointerDown={press(m)}>
          {label?.(m) && <span className="key-label">{label(m)}</span>}
        </div>
      ))}
      {notes
        .filter((m) => BLACK.has(mod12(m)))
        .map((m) => {
          const leftWhites = whites.filter((w) => w < m).length;
          return (
            <div
              key={m}
              className={`key black ${marks?.get(m) ?? ''}`}
              style={{ left: `${leftWhites * whiteW - whiteW * 0.3}%`, width: `${whiteW * 0.6}%` }}
              onPointerDown={press(m)}
            >
              {label?.(m) && <span className="key-label">{label(m)}</span>}
            </div>
          );
        })}
    </div>
  );
});
