// 進捗・統計・設定の保存（localStorage。サーバーがあれば SQLite にも：server.ts）と、デバイス間マージ
import { useSyncExternalStore } from 'react';
import type { JamChordSpec } from '../music/jam';
import type { KeyDef } from '../music/theory';

export type ClickMode = 'all' | 'downbeat' | 'backbeat';
export type NoteNameMode = 'show' | 'after' | 'hide';

export interface Settings {
  tempo: number;
  bars: number;
  metronomeOn: boolean;
  metronomeVolume: number; // 0〜1
  clickMode: ClickMode;
  accompVolume: number; // 0〜1
  drumsOn: boolean;
  bassOn: Record<string, boolean>; // テーマID → ON/OFF（未設定はテーマの初期値）
  noteNames: NoteNameMode;
  showChordName: boolean;
  midiInputId: string | null;
  monitorMidi: boolean;
  pcKeyboard: boolean;
  puzzleQuestions: number;
  unlockAll: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  tempo: 60,
  bars: 16,
  metronomeOn: true,
  metronomeVolume: 0.7,
  clickMode: 'all',
  accompVolume: 0.7,
  drumsOn: true,
  bassOn: {},
  noteNames: 'show',
  showChordName: false,
  midiInputId: null,
  monitorMidi: false,
  pcKeyboard: false,
  puzzleQuestions: 10,
  unlockAll: false,
};

export interface UnitProgress {
  plays: number;
  bestAccuracy: number;
  lastAccuracy: number;
  cleared: boolean;
}

export interface ChordStat {
  attempts: number;
  correct: number;
  timeTotalMs: number;
  timedCount: number;
}

/** ⑤フリー演奏の音の長さ */
export type JamSustain = 'hold' | 'fixed' | 'untilNext';

export interface JamSound {
  sustain: JamSustain;
  /** sustain が 'fixed' のときの長さ（秒） */
  length: number;
  bass: boolean;
  /** コードの音量 0〜3（1 が標準） */
  volume: number;
}

export const DEFAULT_JAM_SOUND: JamSound = { sustain: 'fixed', length: 1.5, bass: true, volume: 1.5 };

/** ⑤フリー演奏に登録した曲 */
export interface JamSong {
  id: string;
  title: string;
  /** YouTube の URL（空なら動画なし） */
  youtube: string;
  key: KeyDef;
  chords: JamChordSpec[];
  sound: JamSound;
  /** YouTube の音量 0〜100 */
  videoVolume: number;
  createdAt: number;
  updatedAt: number;
  /** 削除済み（端末間マージで復活しないよう残す） */
  deleted?: boolean;
}

export interface Progress {
  version: 1;
  units: Record<string, UnitProgress>;
  chordStats: Record<string, ChordStat>;
  highScores: Record<string, number>;
  settings: Settings;
  settingsUpdatedAt: number;
  /** 'MIDI機器名@端末ID' → 補正値(ms) */
  latency: Record<string, number>;
  /** ⑤フリー演奏の曲（ID → 曲）。進捗のリセットでは消さない */
  songs: Record<string, JamSong>;
  updatedAt: number;
}

const STORAGE_KEY = 'codePractice.progress.v1';
const TERMINAL_KEY = 'codePractice.terminalId';

export const CLEAR_ACCURACY = 0.9;
export const MIN_QUESTIONS_FOR_CLEAR = 8;

function emptyProgress(): Progress {
  return {
    version: 1,
    units: {},
    chordStats: {},
    highScores: {},
    settings: { ...DEFAULT_SETTINGS },
    settingsUpdatedAt: 0,
    latency: {},
    songs: {},
    updatedAt: 0,
  };
}

function normalize(p: Partial<Progress> | null | undefined): Progress {
  const base = emptyProgress();
  if (!p) return base;
  return {
    ...base,
    ...p,
    settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
    songs: p.songs ?? {},
  } as Progress;
}

function load(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return emptyProgress();
  }
}

let current: Progress = load();
const listeners = new Set<() => void>();
const changeHooks = new Set<(p: Progress) => void>();
const saveHooks = new Set<(p: Progress) => void>();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // 保存できなくても遊べるようにする
  }
  saveHooks.forEach((h) => h(current));
}

export function getProgress(): Progress {
  return current;
}

export function setProgress(p: Progress, notifyHooks = true) {
  current = p;
  save();
  listeners.forEach((l) => l());
  if (notifyHooks) changeHooks.forEach((h) => h(current));
}

export function updateProgress(fn: (draft: Progress) => void) {
  const next: Progress = structuredClone(current);
  fn(next);
  next.updatedAt = Date.now();
  setProgress(next);
}

export function updateSettings(patch: Partial<Settings>) {
  updateProgress((p) => {
    p.settings = { ...p.settings, ...patch };
    p.settingsUpdatedAt = Date.now();
  });
}

export function onProgressChange(hook: (p: Progress) => void) {
  changeHooks.add(hook);
  return () => changeHooks.delete(hook);
}

/** 保存のたびに呼ばれる（同期由来の更新も含む） */
export function onProgressSave(hook: (p: Progress) => void) {
  saveHooks.add(hook);
  return () => saveHooks.delete(hook);
}

export function useProgress(): Progress {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function useSettings(): Settings {
  return useProgress().settings;
}

export function terminalId(): string {
  try {
    let id = localStorage.getItem(TERMINAL_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(TERMINAL_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

export const latencyKey = (deviceName: string) => `${deviceName}@${terminalId()}`;

// ---- 記録 ----

export function recordChord(p: Progress, chordId: string, correct: boolean, timeMs: number | null) {
  const s = (p.chordStats[chordId] ??= { attempts: 0, correct: 0, timeTotalMs: 0, timedCount: 0 });
  s.attempts++;
  if (correct) s.correct++;
  if (timeMs !== null && correct) {
    s.timeTotalMs += timeMs;
    s.timedCount++;
  }
}

/** セッション結果を反映。新しくクリアしたら true */
export function recordSession(p: Progress, unit: string, accuracy: number, questions: number): boolean {
  const u = (p.units[unit] ??= { plays: 0, bestAccuracy: 0, lastAccuracy: 0, cleared: false });
  u.plays++;
  u.lastAccuracy = accuracy;
  u.bestAccuracy = Math.max(u.bestAccuracy, accuracy);
  if (!u.cleared && accuracy >= CLEAR_ACCURACY && questions >= MIN_QUESTIONS_FOR_CLEAR) {
    u.cleared = true;
    return true;
  }
  return false;
}

/** ハイスコアを更新したら true */
export function recordHighScore(p: Progress, key: string, score: number): boolean {
  if (score > (p.highScores[key] ?? 0)) {
    p.highScores[key] = score;
    return true;
  }
  return false;
}

// ---- 苦手コードの出題 ----

export function chordWeight(stat: ChordStat | undefined): number {
  if (!stat || stat.attempts === 0) return 2; // 未出題は少し多めに
  const errRate = 1 - stat.correct / stat.attempts;
  const avgSec = stat.timedCount > 0 ? stat.timeTotalMs / stat.timedCount / 1000 : 2;
  const slow = Math.min(2, Math.max(0, (avgSec - 1.5) / 1.5));
  return 1 + errRate * 4 + slow;
}

export function pickWeighted<T>(items: T[], weight: (item: T) => number, exclude?: (item: T) => boolean): T {
  const candidates = items.filter((it) => !exclude?.(it));
  const list = candidates.length > 0 ? candidates : items;
  const ws = list.map(weight);
  let r = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) {
    r -= ws[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

// ---- デバイス間マージ ----

export function mergeProgress(a: Progress, b: Progress): Progress {
  const out = emptyProgress();
  for (const key of new Set([...Object.keys(a.units), ...Object.keys(b.units)])) {
    const x = a.units[key];
    const y = b.units[key];
    if (!x || !y) {
      out.units[key] = { ...(x ?? y)! };
      continue;
    }
    out.units[key] = {
      plays: Math.max(x.plays, y.plays),
      bestAccuracy: Math.max(x.bestAccuracy, y.bestAccuracy),
      lastAccuracy: a.updatedAt >= b.updatedAt ? x.lastAccuracy : y.lastAccuracy,
      cleared: x.cleared || y.cleared,
    };
  }
  for (const key of new Set([...Object.keys(a.chordStats), ...Object.keys(b.chordStats)])) {
    const x = a.chordStats[key];
    const y = b.chordStats[key];
    // 試行回数が多い方を採用（各端末の記録は単調増加するため）
    out.chordStats[key] = { ...(!y || (x && x.attempts >= y.attempts) ? x : y) };
  }
  for (const key of new Set([...Object.keys(a.highScores), ...Object.keys(b.highScores)])) {
    out.highScores[key] = Math.max(a.highScores[key] ?? 0, b.highScores[key] ?? 0);
  }
  const newerSettings = a.settingsUpdatedAt >= b.settingsUpdatedAt ? a : b;
  // MIDI入力の選択は端末ごとなので、手元の値を保つ
  out.settings = { ...newerSettings.settings, midiInputId: a.settings.midiInputId };
  out.settingsUpdatedAt = newerSettings.settingsUpdatedAt;
  out.latency = { ...b.latency, ...a.latency };
  for (const id of new Set([...Object.keys(a.songs), ...Object.keys(b.songs)])) {
    const x = a.songs[id];
    const y = b.songs[id];
    // 新しく保存した方を採用（削除も1つの更新として扱う）
    out.songs[id] = structuredClone(!y || (x && x.updatedAt >= y.updatedAt) ? x : y);
  }
  out.updatedAt = Math.max(a.updatedAt, b.updatedAt);
  return out;
}

export { normalize as normalizeProgress };

// ---- ⑤フリー演奏の曲 ----

export function saveSong(song: JamSong) {
  updateProgress((p) => {
    p.songs[song.id] = { ...structuredClone(song), updatedAt: Date.now() };
  });
}

export function deleteSong(id: string) {
  updateProgress((p) => {
    const s = p.songs[id];
    if (s) p.songs[id] = { ...s, deleted: true, updatedAt: Date.now() };
  });
}

/** 一覧用：削除済みを除き、最近使った（保存した）順 */
export function listSongs(p: Progress): JamSong[] {
  return Object.values(p.songs)
    .filter((s) => !s.deleted)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
