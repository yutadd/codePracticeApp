// ⑤フリー演奏：タイルのコード（ディグリー＋変化記号＋種類）と、キーへの当てはめ・ヴォイシング
import { KeyDef, KeyMode, mod12, parseTonic, ROMAN, SCALE, spell } from './theory';

export type JamQuality =
  | 'maj'
  | 'min'
  | 'dim'
  | 'aug'
  | 'sus4'
  | 'maj7'
  | 'min7'
  | 'dom7'
  | 'm7b5'
  | 'dim7'
  | '7sus4'
  | 'six'
  | 'add9';

interface QualityDef {
  suffix: string;
  /** 根音からの音程と、綴りに使う文字のずれ（3度＝2, 5度＝4 …） */
  tones: [number, number][];
  label: string;
}

export const JAM_QUALITIES: Record<JamQuality, QualityDef> = {
  maj: { suffix: '', tones: [[0, 0], [4, 2], [7, 4]], label: 'メジャー' },
  min: { suffix: 'm', tones: [[0, 0], [3, 2], [7, 4]], label: 'マイナー' },
  dim: { suffix: 'dim', tones: [[0, 0], [3, 2], [6, 4]], label: 'dim' },
  aug: { suffix: 'aug', tones: [[0, 0], [4, 2], [8, 4]], label: 'aug' },
  sus4: { suffix: 'sus4', tones: [[0, 0], [5, 3], [7, 4]], label: 'sus4' },
  maj7: { suffix: 'M7', tones: [[0, 0], [4, 2], [7, 4], [11, 6]], label: 'M7' },
  min7: { suffix: 'm7', tones: [[0, 0], [3, 2], [7, 4], [10, 6]], label: 'm7' },
  dom7: { suffix: '7', tones: [[0, 0], [4, 2], [7, 4], [10, 6]], label: '7' },
  m7b5: { suffix: 'm7(♭5)', tones: [[0, 0], [3, 2], [6, 4], [10, 6]], label: 'm7(♭5)' },
  dim7: { suffix: 'dim7', tones: [[0, 0], [3, 2], [6, 4], [9, 6]], label: 'dim7' },
  '7sus4': { suffix: '7sus4', tones: [[0, 0], [5, 3], [7, 4], [10, 6]], label: '7sus4' },
  six: { suffix: '6', tones: [[0, 0], [4, 2], [7, 4], [9, 5]], label: '6' },
  add9: { suffix: 'add9', tones: [[0, 0], [4, 2], [7, 4], [14, 1]], label: 'add9' },
};

export const JAM_QUALITY_ORDER = Object.keys(JAM_QUALITIES) as JamQuality[];

export interface JamChordSpec {
  /** 1〜7 */
  deg: number;
  /** スケールの音からのずれ（-1＝♭, +1＝♯） */
  acc: -1 | 0 | 1;
  quality: JamQuality;
}

export interface JamChord {
  spec: JamChordSpec;
  /** 例：'♭Ⅶ', 'Ⅴ7' */
  degree: string;
  /** 例：'B♭', 'G7' */
  name: string;
  rootPc: number;
  /** 根音から順の音（pc と綴り） */
  tones: { pc: number; name: string }[];
}

const ACC_PREFIX = { [-1]: '♭', 0: '', 1: '♯' } as const;

export function jamDegreeLabel(spec: JamChordSpec): string {
  return ACC_PREFIX[spec.acc] + ROMAN[spec.deg - 1] + JAM_QUALITIES[spec.quality].suffix;
}

export function resolveJamChord(key: KeyDef, spec: JamChordSpec): JamChord {
  const t = parseTonic(key.tonic);
  const letter = t.letter + spec.deg - 1;
  const rootPc = mod12(t.pc + SCALE[key.mode][spec.deg - 1] + spec.acc);
  const q = JAM_QUALITIES[spec.quality];
  const tones = q.tones.map(([iv, lo]) => {
    const pc = mod12(rootPc + iv);
    return { pc, name: spell(pc, letter + lo) };
  });
  return {
    spec,
    degree: jamDegreeLabel(spec),
    name: spell(rootPc, letter) + q.suffix,
    rootPc,
    tones,
  };
}

/** キーのダイアトニックコード（3和音・4和音） */
export function diatonicSpecs(mode: KeyMode, seventh: boolean): JamChordSpec[] {
  const scale = SCALE[mode];
  return scale.map((_, i) => {
    const third = mod12(scale[(i + 2) % 7] - scale[i]);
    const fifth = mod12(scale[(i + 4) % 7] - scale[i]);
    const sev = mod12(scale[(i + 6) % 7] - scale[i]);
    let quality: JamQuality;
    if (!seventh) quality = fifth === 6 ? 'dim' : third === 4 ? 'maj' : 'min';
    else if (fifth === 6) quality = 'm7b5';
    else if (third === 4) quality = sev === 11 ? 'maj7' : 'dom7';
    else quality = 'min7';
    return { deg: i + 1, acc: 0, quality };
  });
}

export const sameSpec = (a: JamChordSpec, b: JamChordSpec) =>
  a.deg === b.deg && a.acc === b.acc && a.quality === b.quality;

// ---- 進行のプリセット（メジャーキー基準のディグリーで書く） ----

const S = (deg: number, quality: JamQuality, acc: -1 | 0 | 1 = 0): JamChordSpec => ({ deg, acc, quality });

export interface JamPreset {
  name: string;
  mode: KeyMode;
  chords: JamChordSpec[];
}

export const JAM_PRESETS: JamPreset[] = [
  { name: '王道進行（Ⅳ Ⅴ Ⅲm Ⅵm）', mode: 'major', chords: [S(4, 'maj'), S(5, 'maj'), S(3, 'min'), S(6, 'min')] },
  { name: 'カノン進行', mode: 'major', chords: [S(1, 'maj'), S(5, 'maj'), S(6, 'min'), S(3, 'min'), S(4, 'maj'), S(2, 'min')] },
  { name: '小室進行（Ⅵm Ⅳ Ⅴ Ⅰ）', mode: 'major', chords: [S(6, 'min'), S(4, 'maj'), S(5, 'maj'), S(1, 'maj')] },
  { name: 'Ⅱ–Ⅴ–Ⅰ（4和音）', mode: 'major', chords: [S(2, 'min7'), S(5, 'dom7'), S(1, 'maj7')] },
  { name: 'J-POPでよく出る借用和音', mode: 'major', chords: [S(3, 'dom7'), S(7, 'maj', -1), S(6, 'maj', -1), S(4, 'min')] },
  { name: 'マイナーの主要コード', mode: 'minor', chords: [S(1, 'min'), S(4, 'min'), S(5, 'dom7'), S(6, 'maj'), S(7, 'maj')] },
];

// ---- ヴォイシング ----

/** 上声（コードの音）を置く範囲 */
export const VOICE_LOW = 55; // G3
export const VOICE_HIGH = 79; // G5
/** ベース（根音）を置く範囲 */
export const BASS_LOW = 40; // E2
export const BASS_HIGH = 51; // D♯3

/** 指定した最低音から、pc を下から順に積み上げる（転回形の1つ） */
function stack(pcs: number[], lowest: number): number[] {
  const out: number[] = [];
  let prev = lowest - 1;
  for (const pc of pcs) {
    const m = prev + 1 + mod12(pc - (prev + 1));
    out.push(m);
    prev = m;
  }
  return out;
}

function distance(a: number[], b: number[]): number {
  // 少ない方の各音から、もう一方の一番近い音までの距離の和（音数が違っても比べられる）
  const [x, y] = a.length <= b.length ? [a, b] : [b, a];
  let d = 0;
  for (const m of x) d += Math.min(...y.map((n) => Math.abs(n - m)));
  // 外声（最低音・最高音）の動きも重めに見る
  d += Math.abs(a[0] - b[0]) * 0.5 + Math.abs(a[a.length - 1] - b[b.length - 1]) * 0.5;
  return d;
}

/**
 * 上声のヴォイシングを決める。前のコードがあれば、転回形の中から動きが最小のものを選ぶ。
 * 前がなければ、中央（C4 付近）に置いた基本形。
 */
export function voiceChord(chord: JamChord, prev: number[] | null): number[] {
  const pcs = chord.tones.map((t) => t.pc);
  const candidates: number[][] = [];
  for (let inv = 0; inv < pcs.length; inv++) {
    const rotated = [...pcs.slice(inv), ...pcs.slice(0, inv)];
    for (let low = VOICE_LOW; low < VOICE_LOW + 12; low++) {
      if (mod12(low) !== rotated[0]) continue;
      for (let oct = 0; ; oct += 12) {
        const v = stack(rotated, low + oct);
        if (v[v.length - 1] > VOICE_HIGH) break;
        candidates.push(v);
      }
    }
  }
  if (candidates.length === 0) return stack(pcs, VOICE_LOW);
  if (!prev || prev.length === 0) {
    // 基本形で、真ん中に近いもの
    const center = 64;
    const root = candidates.filter((v) => mod12(v[0]) === pcs[0]);
    const pool = root.length > 0 ? root : candidates;
    return pool.reduce((best, v) => (Math.abs(avg(v) - center) < Math.abs(avg(best) - center) ? v : best));
  }
  return candidates.reduce((best, v) => (distance(v, prev) < distance(best, prev) ? v : best));
}

const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

export function bassNote(chord: JamChord): number {
  let m = BASS_LOW + mod12(chord.rootPc - BASS_LOW);
  if (m > BASS_HIGH) m -= 12;
  return m;
}

// ---- キーの選択肢 ----

const MAJOR_TONICS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const MINOR_TONICS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];

export function tonicsFor(mode: KeyMode): string[] {
  return mode === 'major' ? MAJOR_TONICS : MINOR_TONICS;
}

/** モードを切り替えたとき、同じ主音の綴りに寄せる（D♭メジャー→C♯マイナー など） */
export function tonicForMode(tonic: string, mode: KeyMode): string {
  const list = tonicsFor(mode);
  if (list.includes(tonic)) return tonic;
  const pc = parseTonic(tonic).pc;
  return list.find((t) => parseTonic(t).pc === pc) ?? list[0];
}

// ---- YouTube ----

/** URL（または動画ID）から動画IDを取り出す */
export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let url: URL;
  try {
    url = new URL(s.startsWith('http') ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{11})/);
      if (m) id = m[2];
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** URL の t= / start= から開始秒を取り出す（1h2m3s 形式にも対応） */
export function youtubeStart(input: string): number {
  let url: URL;
  try {
    url = new URL(input.trim().startsWith('http') ? input.trim() : `https://${input.trim()}`);
  } catch {
    return 0;
  }
  const t = url.searchParams.get('t') ?? url.searchParams.get('start');
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}
