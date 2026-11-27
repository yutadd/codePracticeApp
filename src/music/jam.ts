// ⑤フリー演奏：タイルのコード（ディグリー＋変化記号＋種類）と、キーへの当てはめ・ヴォイシング
import { KeyDef, KeyMode, mod12, parseTonic, ROMAN, SCALE, spell } from './theory';

export type JamQuality =
  | 'maj'
  | 'min'
  | 'dim'
  | 'aug'
  | 'sus4'
  | 'sus2'
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
  sus2: { suffix: 'sus2', tones: [[0, 0], [2, 1], [7, 4]], label: 'sus2' },
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

// ---- コード名から選ぶ（ディグリーを知らなくても登録できるように） ----

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

/** コード名の根音の選択肢 */
export const ROOT_NAMES = ['C', 'C♯', 'D♭', 'D', 'D♯', 'E♭', 'E', 'F', 'F♯', 'G♭', 'G', 'G♯', 'A♭', 'A', 'A♯', 'B♭', 'B'];

export interface ParsedChord {
  /** 文字（C=0 … B=6） */
  letter: number;
  pc: number;
  quality: JamQuality;
  /** 分数コードのベース（例：C/G の G）。今は鳴らさないので表示用 */
  slash?: string;
  /** テンションなどを省いて近いコードにした（例：C7(9) → C7） */
  approx?: boolean;
}

// 長いものから順に照合する
const SUFFIXES: [string, JamQuality][] = [
  ['m7(♭5)', 'm7b5'],
  ['m7(b5)', 'm7b5'],
  ['m7-5', 'm7b5'],
  ['m7♭5', 'm7b5'],
  ['m7b5', 'm7b5'],
  ['7sus4', '7sus4'],
  ['maj7', 'maj7'],
  ['Maj7', 'maj7'],
  ['dim7', 'dim7'],
  ['add9', 'add9'],
  ['sus4', 'sus4'],
  ['sus2', 'sus2'],
  ['sus', 'sus4'],
  ['min7', 'min7'],
  ['M7', 'maj7'],
  ['△7', 'maj7'],
  ['m7', 'min7'],
  ['-7', 'min7'],
  ['ø7', 'm7b5'],
  ['ø', 'm7b5'],
  ['°7', 'dim7'],
  ['dim', 'dim'],
  ['°', 'dim'],
  ['aug', 'aug'],
  ['+', 'aug'],
  ['min', 'min'],
  ['m', 'min'],
  ['-', 'min'],
  ['7', 'dom7'],
  ['6', 'six'],
  ['', 'maj'],
];

/** 'F♯m7' 'Bb' 'C/G' などを読む。読めなければ null */
export function parseChordName(text: string): ParsedChord | null {
  let s = text.trim().replace(/＃/g, '#').replace(/♭/g, 'b').replace(/♯/g, '#');
  if (!s) return null;
  let slash: string | undefined;
  const sl = s.match(/^(.+?)\/([A-Ga-g][#b]?)$/);
  if (sl) {
    s = sl[1];
    slash = sl[2][0].toUpperCase() + sl[2].slice(1).replace('#', '♯').replace('b', '♭');
  }
  const m = s.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!m) return null;
  const letter = LETTERS.indexOf(m[1].toUpperCase());
  const shift = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const rest = m[3].replace(/\s/g, '').replace(/#/g, '♯');
  // (♭5) 表記をそろえる
  const restNorm = rest.replace('(b5)', '(♭5)').replace('b5', '♭5');
  let hit = SUFFIXES.find(([suf]) => suf === rest || suf === restNorm);
  let approx = false;
  if (!hit) {
    // テンション付き（C7(9)、Cm9、CM9、C13、Cadd2 など）は、テンションを省いた近いコードにする
    const base = restNorm.replace(/\(.*\)$/, '');
    const approxMap: [RegExp, JamQuality][] = [
      [/^(m|min|-)(9|11|13)$/, 'min7'],
      [/^(M|maj|△)(9|11|13)$/, 'maj7'],
      [/^(9|11|13)$/, 'dom7'],
      [/^(add2|2)$/, 'add9'],
      [/^(m|min|-)6$/, 'min'],
      [/^(m|min|-)(M7|maj7|△7)$/, 'min'],
      [/^7(♯|♭|b|#|\+|-)\d+$/, 'dom7'],
      [/^(dim|°)(M7)?$/, 'dim'],
    ];
    const exact = SUFFIXES.find(([suf]) => suf === base);
    const q = exact ? exact[1] : approxMap.find(([re]) => re.test(base))?.[1];
    if (!q) return null;
    hit = ['', q];
    approx = true;
  }
  return { letter, pc: mod12(LETTER_PC[letter] + shift), quality: hit[1], slash, ...(approx ? { approx } : {}) };
}

/** キーの中でのディグリーに直す。綴り（文字）が保たれるディグリーを優先する */
export function specFromName(key: KeyDef, letter: number, pc: number, quality: JamQuality): JamChordSpec {
  const t = parseTonic(key.tonic);
  const scale = SCALE[key.mode];
  const deg = (((letter - t.letter) % 7) + 7) % 7; // 0〜6
  const acc = pc - mod12(t.pc + scale[deg]);
  const a = ((acc % 12) + 18) % 12 - 6; // -6〜5
  if (a >= -1 && a <= 1) return { deg: deg + 1, acc: a as -1 | 0 | 1, quality };
  // 文字が合わない（重変化記号になる）ときは、音の高さだけで探す
  for (const want of [0, -1, 1] as const) {
    const i = scale.findIndex((iv) => mod12(t.pc + iv + want) === pc);
    if (i >= 0) return { deg: i + 1, acc: want, quality };
  }
  return { deg: 1, acc: 0, quality };
}

export interface ParsedList {
  chords: ParsedChord[];
  /** 読めなかった語 */
  unknown: string[];
}

/** 'Am F G C' や 'Am - F - G - C'、'| C | G/B | Am |' のようなコード譜の並びを読む */
export function parseChordList(text: string): ParsedList {
  const chords: ParsedChord[] = [];
  const unknown: string[] = [];
  for (const word of text.split(/[\s|,、→>]+|(?:\s-\s)/)) {
    const w = word.trim();
    if (!w || w === '-' || w === '/' || w === '%') continue;
    const c = parseChordName(w);
    if (c) chords.push(c);
    else unknown.push(w);
  }
  return { chords, unknown };
}

/** 並んだコードから、いちばん当てはまるキーを推定する */
export function estimateKey(chords: { pc: number; quality: JamQuality }[]): KeyDef | null {
  if (chords.length === 0) return null;
  let best: { key: KeyDef; score: number } | null = null;
  for (const mode of ['major', 'minor'] as KeyMode[]) {
    for (const tonic of tonicsFor(mode)) {
      const key = { tonic, mode };
      const tpc = parseTonic(tonic).pc;
      const triads = diatonicSpecs(mode, false).map((s) => resolveJamChord(key, s));
      const sevenths = diatonicSpecs(mode, true).map((s) => resolveJamChord(key, s));
      let score = 0;
      for (const c of chords) {
        const tones = JAM_QUALITIES[c.quality].tones.map(([iv]) => mod12(c.pc + iv));
        const fit = tones.filter((pc) => SCALE[mode].some((iv) => mod12(tpc + iv) === pc)).length / tones.length;
        score += fit * 2;
        if ([...triads, ...sevenths].some((d) => d.rootPc === c.pc && d.spec.quality === c.quality)) score += 1;
        // マイナーキーのⅤ7（和声的短音階）は許す
        if (mode === 'minor' && c.pc === mod12(tpc + 7) && c.quality === 'dom7') score += 1.5;
      }
      // 主和音で始まる・終わると、そのキーらしい
      const tonicQ = mode === 'major' ? ['maj', 'maj7', 'six', 'add9'] : ['min', 'min7'];
      const isTonic = (c: { pc: number; quality: JamQuality }) => c.pc === tpc && tonicQ.includes(c.quality);
      if (isTonic(chords[0])) score += 1;
      if (isTonic(chords[chords.length - 1])) score += 0.5;
      if (chords.some(isTonic)) score += 0.5;
      // 平行調（C と Am など）は構成音が同じなので、Ⅴ7 などの手がかりがない限りメジャーにする
      if (mode === 'minor') score -= 1.1;
      if (!best || score > best.score + 1e-9) best = { key, score };
    }
  }
  return best!.key;
}

/** キーを変えても、コード名（鳴る音）を保ったままディグリーを付け直す */
export function respell(from: KeyDef, to: KeyDef, spec: JamChordSpec): JamChordSpec {
  const c = resolveJamChord(from, spec);
  const letter = LETTERS.indexOf(c.name[0]);
  return specFromName(to, letter, c.rootPc, spec.quality);
}
