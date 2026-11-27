// 画面間で共有するユニット（テーマ×キー×レベル）の情報
import { isUnitUnlocked, levelLabelFor, ThemeDef, themeById, ThemeKey, THEMES, unitId } from './music/themes';
import { Chord, ChordRules, chordRules, ChordSpec, Level, resolveChord } from './music/theory';
import { chordWeight, pickWeighted, Progress } from './store/progress';

export interface UnitRef {
  themeId: string;
  keyIndex: number;
  level: Level;
}

export interface UnitInfo {
  ref: UnitRef;
  theme: ThemeDef;
  themeKey: ThemeKey;
  id: string;
  title: string;
}

export function unitInfo(ref: UnitRef): UnitInfo {
  const theme = themeById(ref.themeId);
  const themeKey = theme.keys[ref.keyIndex];
  const levelText = theme.levels.length > 1 ? ` ${levelLabelFor(theme, ref.level)}` : '';
  return {
    ref,
    theme,
    themeKey,
    id: unitId(theme.id, themeKey.id, ref.level),
    title: `${theme.name} / ${themeKey.display}キー${levelText}`,
  };
}

export const isCleared = (p: Progress, id: string) => Boolean(p.units[id]?.cleared);

export function isUnlocked(p: Progress, ref: UnitRef): boolean {
  if (p.settings.unlockAll) return true;
  const theme = themeById(ref.themeId);
  return isUnitUnlocked(theme, ref.keyIndex, ref.level, (id) => isCleared(p, id));
}

export function allUnits(): UnitRef[] {
  const out: UnitRef[] = [];
  for (const theme of THEMES) {
    theme.keys.forEach((_, keyIndex) => theme.levels.forEach((level) => out.push({ themeId: theme.id, keyIndex, level })));
  }
  return out;
}

/** 解放済みユニットの一覧（クリア前後の比較で「新しく解放」を出す） */
export function unlockedSet(p: Progress): Set<string> {
  return new Set(allUnits().filter((u) => isUnlocked(p, u)).map((u) => unitInfo(u).id));
}

export interface PlayChord {
  chord: Chord;
  rules: ChordRules;
}

export function makePlayChord(info: UnitInfo, spec: ChordSpec): PlayChord {
  let chord = resolveChord(info.themeKey.key, spec);
  // ルート段階は3和音と同じ表記なので、統計は id を分けて記録する
  if (info.ref.level === 'root') chord = { ...chord, id: `${chord.id}（ルート）` };
  return { chord, rules: chordRules(chord, info.ref.level) };
}

export function unitPool(info: UnitInfo): PlayChord[] {
  return info.theme.pool(info.ref.level).map((s) => makePlayChord(info, s));
}

/** 苦手なコードほど出やすく、同じコードは続けない */
export function pickChord(p: Progress, pool: PlayChord[], prev?: PlayChord | null): PlayChord {
  return pickWeighted(
    pool,
    (c) => chordWeight(p.chordStats[c.chord.id]),
    (c) => pool.length > 1 && c.chord.id === prev?.chord.id,
  );
}

/** 逆引きの選択肢用：プールが小さいテーマはダイアトニックで補う */
export function distractorPool(info: UnitInfo): PlayChord[] {
  const key = info.themeKey.key;
  const extra: ChordSpec[] =
    key.mode === 'minor'
      ? [
          { deg: 1, quality: 'min' },
          { deg: 2, quality: 'dim' },
          { deg: 3, quality: 'maj' },
          { deg: 4, quality: 'min' },
          { deg: 5, quality: 'dom7' },
          { deg: 5, quality: 'min' },
          { deg: 6, quality: 'maj' },
          { deg: 7, quality: 'maj' },
        ]
      : info.ref.level === 'root'
        ? []
        : info.ref.level === 'triad'
        ? themeById('basic').pool('triad')
        : [...themeById('basic').pool('seventh'), ...themeById('basic').pool('triad')];
  const seen = new Set<string>();
  const out: PlayChord[] = [];
  for (const s of [...info.theme.pool(info.ref.level), ...extra]) {
    const pc = makePlayChord(info, s);
    if (seen.has(pc.chord.id)) continue;
    seen.add(pc.chord.id);
    out.push(pc);
  }
  return out;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
