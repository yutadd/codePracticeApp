// テーマ、キーの解放順、出題するコード・進行、伴奏の定義
import { ChordSpec, KeyDef, Level, Quality } from './theory';

export type DrumStyle = 'none' | 'eightBeat' | 'swingRide' | 'fourOnFloor';
export type BassStyle = 'none' | 'eighthRoot' | 'walking' | 'downbeatRoot';

export interface Progression {
  id: string;
  name: string;
  chords: ChordSpec[];
}

export interface ThemeKey {
  /** テーマ内で一意。表示にも使う（EDMは 'Am' などマイナー名） */
  id: string;
  display: string;
  /** 実際にディグリーを数えるキー */
  key: KeyDef;
}

export interface ThemeDef {
  id: string;
  name: string;
  description: string;
  beatsPerBar: 3 | 4;
  swing: boolean;
  levels: Level[];
  keys: ThemeKey[];
  pool: (level: Level) => ChordSpec[];
  progressions: (level: Level) => Progression[];
  drums: DrumStyle;
  bass: BassStyle;
  bassDefault: boolean;
}

const c = (deg: number, quality: Quality): ChordSpec => ({ deg, quality });

const major = (tonic: string): ThemeKey => ({ id: tonic, display: tonic, key: { tonic, mode: 'major' } });
const minor = (tonic: string): ThemeKey => ({
  id: tonic + 'm',
  display: tonic + 'm',
  key: { tonic, mode: 'minor' },
});
/** マイナーのキー名で表示し、平行長調のディグリーで数える（EDM用） */
const relMinor = (minorTonic: string, relMajor: string): ThemeKey => ({
  id: minorTonic + 'm',
  display: `${minorTonic}m`,
  key: { tonic: relMajor, mode: 'major' },
});

const DIATONIC_TRIADS = [c(1, 'maj'), c(2, 'min'), c(3, 'min'), c(4, 'maj'), c(5, 'maj'), c(6, 'min'), c(7, 'dim')];
const DIATONIC_SEVENTHS = [
  c(1, 'maj7'),
  c(2, 'min7'),
  c(3, 'min7'),
  c(4, 'maj7'),
  c(5, 'dom7'),
  c(6, 'min7'),
  c(7, 'm7b5'),
];

const uniqueChords = (progs: Progression[]): ChordSpec[] => {
  const seen = new Map<string, ChordSpec>();
  for (const p of progs) for (const ch of p.chords) seen.set(`${ch.deg}${ch.quality}`, ch);
  return [...seen.values()];
};

const fixed = (progs: Progression[]) => ({
  pool: () => uniqueChords(progs),
  progressions: () => progs,
});

const BASIC_TRIAD_PROGS: Progression[] = [
  { id: 'I-IV-V-I', name: 'Ⅰ→Ⅳ→Ⅴ→Ⅰ', chords: [c(1, 'maj'), c(4, 'maj'), c(5, 'maj'), c(1, 'maj')] },
  { id: 'I-VIm-IV-V', name: 'Ⅰ→Ⅵm→Ⅳ→Ⅴ', chords: [c(1, 'maj'), c(6, 'min'), c(4, 'maj'), c(5, 'maj')] },
];
// ルート段階：表示は3和音と同じ（Ⅵm など）で、判定は根音だけ
const BASIC_ROOT_PROGS: Progression[] = [
  { id: 'scale', name: 'スケール順（Ⅰ→Ⅱm→…→Ⅶdim→Ⅰ）', chords: [...DIATONIC_TRIADS, c(1, 'maj')] },
  ...BASIC_TRIAD_PROGS,
];
const BASIC_SEVENTH_PROGS: Progression[] = [
  { id: 'II-V-I', name: 'Ⅱm7→Ⅴ7→ⅠM7', chords: [c(2, 'min7'), c(5, 'dom7'), c(1, 'maj7'), c(1, 'maj7')] },
  { id: 'royal', name: '王道進行', chords: [c(4, 'maj7'), c(5, 'dom7'), c(3, 'min7'), c(6, 'min7')] },
];

const JPOP_PROGS: Progression[] = [
  { id: 'royal', name: '王道進行（ⅣM7→Ⅴ7→Ⅲm7→Ⅵm）', chords: [c(4, 'maj7'), c(5, 'dom7'), c(3, 'min7'), c(6, 'min')] },
  {
    id: 'canon',
    name: 'カノン進行',
    chords: [c(1, 'maj'), c(5, 'maj'), c(6, 'min'), c(3, 'min'), c(4, 'maj'), c(1, 'maj'), c(4, 'maj'), c(5, 'maj')],
  },
];

export const THEMES: ThemeDef[] = [
  {
    id: 'basic',
    name: '基礎',
    description: 'ダイアトニック7つ（ルート・スケール／3和音→4和音→ルートレス）',
    beatsPerBar: 4,
    swing: false,
    levels: ['root', 'scale', 'triad', 'seventh', 'rootless'],
    keys: ['C', 'G', 'F', 'D', 'B♭', 'A', 'E♭'].map(major),
    pool: (level) => (level === 'seventh' || level === 'rootless' ? DIATONIC_SEVENTHS : DIATONIC_TRIADS),
    progressions: (level) =>
      level === 'root' ? BASIC_ROOT_PROGS : level === 'triad' ? BASIC_TRIAD_PROGS : BASIC_SEVENTH_PROGS,
    drums: 'none',
    bass: 'none',
    bassDefault: false,
  },
  {
    id: 'relax',
    name: 'リラックス',
    description: 'ⅠM7⇄ⅣM7（add9推奨）',
    beatsPerBar: 4,
    swing: false,
    levels: ['seventh'],
    keys: ['C', 'F', 'G', 'D', 'B♭'].map(major),
    ...fixed([{ id: 'I-IV', name: 'ⅠM7⇄ⅣM7', chords: [c(1, 'maj7'), c(4, 'maj7')] }]),
    drums: 'none',
    bass: 'none',
    bassDefault: false,
  },
  {
    id: 'jpop',
    name: 'J-POP',
    description: '王道進行、カノン進行',
    beatsPerBar: 4,
    swing: false,
    levels: ['seventh'],
    keys: ['C', 'G', 'D', 'F', 'A', 'E'].map(major),
    ...fixed(JPOP_PROGS),
    drums: 'eightBeat',
    bass: 'eighthRoot',
    bassDefault: true,
  },
  {
    id: 'lounge',
    name: 'ラウンジ',
    description: 'Ⅱm7→Ⅴ7→ⅠM7、Ⅰ→Ⅵm→Ⅱm→Ⅴ（スウィング）',
    beatsPerBar: 4,
    swing: true,
    levels: ['seventh'],
    keys: ['F', 'B♭', 'C', 'E♭', 'G'].map(major),
    ...fixed([
      { id: 'II-V-I', name: 'Ⅱm7→Ⅴ7→ⅠM7', chords: [c(2, 'min7'), c(5, 'dom7'), c(1, 'maj7'), c(1, 'maj7')] },
      { id: 'I-VI-II-V', name: 'Ⅰ→Ⅵm→Ⅱm→Ⅴ', chords: [c(1, 'maj'), c(6, 'min'), c(2, 'min'), c(5, 'maj')] },
    ]),
    drums: 'swingRide',
    bass: 'walking',
    bassDefault: true,
  },
  {
    id: 'italian',
    name: 'イタリアン',
    description: 'Ⅰm→Ⅳm→Ⅴ7（3拍子）',
    beatsPerBar: 3,
    swing: false,
    levels: ['seventh'],
    keys: ['A', 'D', 'E', 'G', 'C'].map(minor),
    ...fixed([{ id: 'i-iv-V', name: 'Ⅰm→Ⅳm→Ⅴ7→Ⅰm', chords: [c(1, 'min'), c(4, 'min'), c(5, 'dom7'), c(1, 'min')] }]),
    drums: 'none',
    bass: 'downbeatRoot',
    bassDefault: true,
  },
  {
    id: 'edm',
    name: 'EDM',
    description: 'Ⅵm→Ⅳ→Ⅰ→Ⅴ（平行長調のディグリー）',
    beatsPerBar: 4,
    swing: false,
    levels: ['seventh'],
    keys: [relMinor('A', 'C'), relMinor('F', 'A♭'), relMinor('G', 'B♭'), relMinor('C', 'E♭'), relMinor('E', 'G')],
    ...fixed([{ id: 'vi-IV-I-V', name: 'Ⅵm→Ⅳ→Ⅰ→Ⅴ', chords: [c(6, 'min'), c(4, 'maj'), c(1, 'maj'), c(5, 'maj')] }]),
    drums: 'fourOnFloor',
    bass: 'eighthRoot',
    bassDefault: false,
  },
];

export const themeById = (id: string) => THEMES.find((t) => t.id === id)!;

export function levelLabelFor(theme: ThemeDef, level: Level): string {
  if (theme.id !== 'basic') return '標準';
  if (level === 'root') return 'ルート';
  if (level === 'scale') return 'スケール';
  return level === 'triad' ? '3和音' : level === 'seventh' ? '4和音' : 'ルートレス';
}

export const unitId = (themeId: string, keyId: string, level: Level) => `${themeId}|${keyId}|${level}`;

/**
 * 解放判定。cleared(unitId) はそのユニットで正解率90%以上を出したかどうか。
 * - 基礎：各キーで 3和音 → 4和音 → ルートレス。4和音クリアで次のキーの3和音を解放
 *   ルートとスケールは3和音と同時に解放する練習用の段階で、ほかの解放条件には関わらない
 * - 基礎Cの4和音クリアで他テーマを解放。以降はテーマごとに独立して前のキーをクリアで次のキー
 */
export function isUnitUnlocked(
  theme: ThemeDef,
  keyIndex: number,
  level: Level,
  cleared: (unit: string) => boolean,
): boolean {
  if (theme.id === 'basic') {
    const key = theme.keys[keyIndex].id;
    if (level === 'root' || level === 'scale' || level === 'triad') {
      return keyIndex === 0 || cleared(unitId('basic', theme.keys[keyIndex - 1].id, 'seventh'));
    }
    if (level === 'seventh') return cleared(unitId('basic', key, 'triad'));
    return cleared(unitId('basic', key, 'seventh'));
  }
  const themeOpen = cleared(unitId('basic', 'C', 'seventh'));
  if (!themeOpen) return false;
  if (keyIndex === 0) return true;
  return cleared(unitId(theme.id, theme.keys[keyIndex - 1].id, level));
}
