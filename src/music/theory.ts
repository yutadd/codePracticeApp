// 音楽理論の基礎：キー、ディグリー、コード、必須音・テンションの定義

export type Quality = 'maj' | 'min' | 'dim' | 'maj7' | 'min7' | 'dom7' | 'm7b5';
/** 'scale' は④スケール練習だけで使う段階 */
export type Level = 'root' | 'scale' | 'triad' | 'seventh' | 'rootless';
export type KeyMode = 'major' | 'minor';
export type ToneRole = 'R' | '3' | '5' | '7';

export const LEVEL_LABEL: Record<Level, string> = {
  root: 'ルート',
  scale: 'スケール',
  triad: '3和音',
  seventh: '4和音',
  rootless: '上級（ルートレス）',
};

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
export const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ'];
export const SCALE: Record<KeyMode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const QUALITY_TONES: Record<Quality, [number, ToneRole][]> = {
  maj: [[0, 'R'], [4, '3'], [7, '5']],
  min: [[0, 'R'], [3, '3'], [7, '5']],
  dim: [[0, 'R'], [3, '3'], [6, '5']],
  maj7: [[0, 'R'], [4, '3'], [7, '5'], [11, '7']],
  min7: [[0, 'R'], [3, '3'], [7, '5'], [10, '7']],
  dom7: [[0, 'R'], [4, '3'], [7, '5'], [10, '7']],
  m7b5: [[0, 'R'], [3, '3'], [6, '5'], [10, '7']],
};

const QUALITY_SUFFIX: Record<Quality, string> = {
  maj: '',
  min: 'm',
  dim: 'dim',
  maj7: 'M7',
  min7: 'm7',
  dom7: '7',
  m7b5: 'm7(♭5)',
};

const ROLE_LETTER_OFFSET: Record<ToneRole, number> = { R: 0, '3': 2, '5': 4, '7': 6 };

export const isSeventh = (q: Quality) => q === 'maj7' || q === 'min7' || q === 'dom7' || q === 'm7b5';

export const mod12 = (n: number) => ((n % 12) + 12) % 12;

const ACCIDENTALS: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };

/** 文字（C〜B のインデックス）を指定して音名を綴る */
export function spell(pc: number, letterIdx: number): string {
  const li = ((letterIdx % 7) + 7) % 7;
  let diff = mod12(pc - LETTER_PC[li]);
  if (diff > 6) diff -= 12;
  return LETTERS[li] + (ACCIDENTALS[diff] ?? '?');
}

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

export function pcName(pc: number, preferFlat = false): string {
  return (preferFlat ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];
}

export function midiName(midi: number, preferFlat = false): string {
  return pcName(midi, preferFlat) + (Math.floor(midi / 12) - 1);
}

export interface KeyDef {
  /** 例: 'B♭', 'A' */
  tonic: string;
  mode: KeyMode;
}

export function parseTonic(tonic: string): { letter: number; pc: number } {
  const letter = LETTERS.indexOf(tonic[0]);
  if (letter < 0) throw new Error(`bad tonic ${tonic}`);
  const acc = tonic.slice(1);
  const shift = acc === '♭' ? -1 : acc === '♯' ? 1 : 0;
  return { letter, pc: mod12(LETTER_PC[letter] + shift) };
}

export function keyName(key: KeyDef): string {
  return key.tonic + (key.mode === 'minor' ? 'm' : '');
}

export function keyId(key: KeyDef): string {
  return keyName(key);
}

/** 鍵盤の音名表示で♭を使うか */
export function keyPrefersFlat(key: KeyDef): boolean {
  const flatMajor = ['F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭'];
  const flatMinor = ['D', 'G', 'C', 'F', 'B♭', 'E♭'];
  return key.tonic.includes('♭') || (key.mode === 'major' ? flatMajor : flatMinor).includes(key.tonic);
}

export interface ChordSpec {
  deg: number; // 1〜7
  quality: Quality;
}

export interface ChordTone {
  pc: number;
  role: ToneRole;
  interval: number;
  name: string;
}

export interface Chord {
  id: string; // 'C:Ⅱm7'
  key: KeyDef;
  deg: number;
  quality: Quality;
  label: string; // 'Ⅱm7'
  name: string; // 'Dm7'
  rootPc: number;
  rootLetter: number;
  tones: ChordTone[];
}

export function degreeLabel(spec: ChordSpec): string {
  return ROMAN[spec.deg - 1] + QUALITY_SUFFIX[spec.quality];
}

export function resolveChord(key: KeyDef, spec: ChordSpec): Chord {
  const t = parseTonic(key.tonic);
  const rootLetter = t.letter + spec.deg - 1;
  const rootPc = mod12(t.pc + SCALE[key.mode][spec.deg - 1]);
  const tones = QUALITY_TONES[spec.quality].map(([interval, role]) => {
    const pc = mod12(rootPc + interval);
    return { pc, role, interval, name: spell(pc, rootLetter + ROLE_LETTER_OFFSET[role]) };
  });
  const label = degreeLabel(spec);
  return {
    id: `${keyId(key)}:${label}`,
    key,
    deg: spec.deg,
    quality: spec.quality,
    label,
    name: spell(rootPc, rootLetter) + QUALITY_SUFFIX[spec.quality],
    rootPc,
    rootLetter,
    tones,
  };
}

// ---- テンション（Cキー基準の表を、根音からの音程で持つ） ----

interface TensionDef {
  interval: number;
  name: string;
  letterOffset: number;
}
const T = (interval: number, name: string): TensionDef => ({
  interval,
  name,
  letterOffset: name.endsWith('13') ? 5 : name.endsWith('11') ? 3 : 1,
});

const TENSIONS: Record<KeyMode, Record<number, { bonus: TensionDef[]; advanced?: TensionDef[] }>> = {
  major: {
    1: { bonus: [T(2, '9'), T(9, '13')] },
    2: { bonus: [T(2, '9'), T(5, '11')] },
    3: { bonus: [T(5, '11')] },
    4: { bonus: [T(2, '9'), T(6, '♯11'), T(9, '13')] },
    5: { bonus: [T(2, '9'), T(9, '13')], advanced: [T(1, '♭9'), T(3, '♯9'), T(8, '♭13')] },
    6: { bonus: [T(2, '9'), T(5, '11')] },
    7: { bonus: [T(5, '11'), T(8, '♭13')] },
  },
  minor: {
    1: { bonus: [T(2, '9'), T(5, '11')] },
    4: { bonus: [T(2, '9'), T(5, '11')] },
    5: { bonus: [T(1, '♭9'), T(8, '♭13')] },
  },
};

export interface TensionInfo {
  pc: number;
  name: string; // '9', '♯11' など
  noteName: string;
}

export interface ChordRules {
  chord: Chord;
  level: Level;
  /** そろえる必要がある音 */
  required: Set<number>;
  /** 弾いてもよい（減点なし・ボーナスなし）音 */
  optional: Set<number>;
  /** コードの構成音（必須＋省略可の構成音） */
  chordTones: Set<number>;
  /** ボーナスになるテンション */
  tensions: Map<number, TensionInfo>;
}

export function chordRules(chord: Chord, level: Level): ChordRules {
  // ルート段階：根音だけをそろえればよく、ほかの音は何を弾いても減点しない
  if (level === 'root') {
    const required = new Set([chord.rootPc]);
    const optional = new Set<number>();
    for (let pc = 0; pc < 12; pc++) if (pc !== chord.rootPc) optional.add(pc);
    return { chord, level, required, optional, chordTones: new Set(required), tensions: new Map() };
  }
  const required = new Set<number>();
  const optional = new Set<number>();
  const seventh = isSeventh(chord.quality);
  for (const tone of chord.tones) {
    let req = true;
    if (seventh && level !== 'triad') {
      // m7♭5 の ♭5 は必須
      if (tone.role === '5' && chord.quality !== 'm7b5') req = false;
      if (tone.role === 'R' && level === 'rootless') req = false;
    }
    (req ? required : optional).add(tone.pc);
  }
  const chordTones = new Set([...required, ...optional]);

  const tensions = new Map<number, TensionInfo>();
  if (level === 'seventh' || level === 'rootless') {
    // 3和音にダイアトニックの7度を足すのは許容（減点もボーナスもなし）
    if (!seventh) {
      const scale = SCALE[chord.key.mode];
      const t = parseTonic(chord.key.tonic);
      const seventhPc = mod12(t.pc + scale[(chord.deg - 1 + 6) % 7]);
      if (!chordTones.has(seventhPc)) optional.add(seventhPc);
    }
    const def = TENSIONS[chord.key.mode][chord.deg];
    if (def) {
      const list = [...def.bonus, ...(level === 'rootless' && def.advanced ? def.advanced : [])];
      for (const td of list) {
        const pc = mod12(chord.rootPc + td.interval);
        if (chordTones.has(pc) || optional.has(pc)) continue;
        tensions.set(pc, { pc, name: td.name, noteName: spell(pc, chord.rootLetter + td.letterOffset) });
      }
    }
  }
  return { chord, level, required, optional, chordTones, tensions };
}

export function fits(rules: ChordRules, pc: number): boolean {
  const p = mod12(pc);
  return rules.required.has(p) || rules.optional.has(p) || rules.tensions.has(p);
}

export function roleOf(rules: ChordRules, pc: number): string {
  const p = mod12(pc);
  const tone = rules.chord.tones.find((t) => t.pc === p);
  if (tone) return tone.role;
  if (rules.tensions.has(p)) return rules.tensions.get(p)!.name;
  if (rules.optional.has(p)) return '7';
  return 'x';
}

/** 表示用：根音（ルートレスは3度）から積み上げたクローズド・ヴォイシング */
export function closeVoicing(rules: ChordRules, lowest = 48, includeOptional = true): number[] {
  const order: ToneRole[] = ['R', '3', '5', '7'];
  const tones = rules.chord.tones
    .filter((t) => rules.required.has(t.pc) || (includeOptional && rules.chordTones.has(t.pc)))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  const result: number[] = [];
  let prev = lowest - 1;
  for (const t of tones) {
    let m = prev + 1 + mod12(t.pc - (prev + 1));
    result.push(m);
    prev = m;
  }
  return result;
}

/** キーのスケールを綴る（例：Gメジャー → G A B C D E F♯） */
export function scaleNames(key: KeyDef): string[] {
  const t = parseTonic(key.tonic);
  return SCALE[key.mode].map((iv, i) => spell(mod12(t.pc + iv), t.letter + i));
}
