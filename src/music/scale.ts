// ④スケール練習：お題（始まりのディグリー）と、1音ごとの判定
import { KeyDef, mod12, parseTonic, ROMAN, SCALE, scaleNames } from './theory';

export interface ScaleStep {
  deg: number; // 1〜7
  roman: string;
  pc: number;
  name: string;
}

export interface ScaleTask {
  key: KeyDef;
  startDeg: number;
  /** 弾く順の7音 */
  steps: ScaleStep[];
  /** 記録用の id（例：'G:スケール Ⅳから'） */
  id: string;
}

export function scaleTask(key: KeyDef, startDeg: number): ScaleTask {
  const t = parseTonic(key.tonic);
  const names = scaleNames(key);
  const steps = Array.from({ length: 7 }, (_, i) => {
    const idx = (startDeg - 1 + i) % 7;
    return { deg: idx + 1, roman: ROMAN[idx], pc: mod12(t.pc + SCALE[key.mode][idx]), name: names[idx] };
  });
  const keyName = key.tonic + (key.mode === 'minor' ? 'm' : '');
  return { key, startDeg, steps, id: `${keyName}:スケール ${ROMAN[startDeg - 1]}から` };
}

export type ScaleJudge = 'ok' | 'wrong' | 'ignore';

/**
 * pos 番目（0始まり）を待っているときに pc を弾いたときの判定。
 * 直前に正解した音をもう一度弾いた場合（別のオクターブを含む）は無視する。
 */
export function judgeScaleNote(task: ScaleTask, pos: number, pc: number): ScaleJudge {
  const p = mod12(pc);
  if (pos >= task.steps.length) return 'ignore';
  if (task.steps[pos].pc === p) return 'ok';
  if (pos > 0 && task.steps[pos - 1].pc === p) return 'ignore';
  return 'wrong';
}
