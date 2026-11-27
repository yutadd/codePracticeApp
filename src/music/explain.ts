// 構成音パズルで表示する、特殊なコードの解説
import { Chord, Level, scaleNames } from './theory';

export interface Explanation {
  title: string;
  /** 回答前から見せてよい、作り方の説明 */
  lines: string[];
  /** 答えになる具体的な音名（回答後に見せる） */
  answer: string[];
}

const INTERVAL_NAME: Record<number, string> = {
  0: '根音',
  3: '短3度',
  4: '長3度',
  6: '減5度（♭5）',
  7: '完全5度',
  10: '短7度',
  11: '長7度',
};

const toneList = (chord: Chord) => chord.tones.map((t) => `${INTERVAL_NAME[t.interval]} ${t.name}`).join('・');

/** 解説が必要なコード（dim、m7(♭5)、7、マイナーキーのⅤ、ルートレス）なら解説を返す */
export function explainChord(chord: Chord, level: Level): Explanation | null {
  if (level === 'root') {
    const scale = scaleNames(chord.key);
    const modeName = chord.key.mode === 'minor' ? 'マイナー' : 'メジャー';
    return {
      title: `スケールの${chord.deg}番目の音`,
      lines: [
        `ディグリーの数字は、キーのスケール（${chord.key.tonic}${modeName}）の何番目の音を根音にするかを表します。`,
        'メジャーキーのダイアトニックでは、Ⅰ・Ⅳ・Ⅴがメジャー、Ⅱm・Ⅲm・Ⅵmがマイナー、Ⅶdimがディミニッシュになります。',
      ],
      answer: [
        `${chord.key.tonic}${modeName}スケール：` +
          scale.map((n, i) => (i === chord.deg - 1 ? `［${n}］` : n)).join(' '),
        `${chord.label} = ${chord.name}`,
      ],
    };
  }
  const lines: string[] = [];
  const answer: string[] = [];
  let title = '';
  const toneOf = (role: string) => chord.tones.find((t) => t.role === role)?.name ?? '';
  const minorFive = chord.key.mode === 'minor' && chord.deg === 5;

  switch (chord.quality) {
    case 'dim':
      title = 'dim（ディミニッシュ）';
      lines.push(
        '短3度を2つ重ねた和音。マイナーコードの5度を半音下げた形です（根音・短3度・減5度）。',
        '5度が完全5度より半音低いのがポイント。メジャーキーでは Ⅶ の上にできます。',
      );
      break;
    case 'm7b5':
      title = 'm7(♭5)（マイナーセブン・フラットファイブ）';
      lines.push(
        'dim に短7度を足した形で、「ハーフディミニッシュ」とも呼びます（根音・短3度・減5度・短7度）。',
        '♭5 は省略できません。省くと m7 と区別がつかなくなるためです。メジャーキーでは Ⅶ の上にできます。',
      );
      break;
    case 'dom7':
      title = '7（セブンス／ドミナントセブンス）';
      lines.push(
        'メジャーコード（長3和音）に短7度を足した形（根音・長3度・完全5度・短7度）。M7（長7度）と違い、7度は根音の全音下です。',
        '3度と7度の間はトライトーン（増4度）。不安定な響きで、Ⅰ へ解決したがります。',
      );
      answer.push(`トライトーン：${toneOf('3')} と ${toneOf('7')}`);
      if (minorFive) {
        lines.push('マイナーキーでは、Ⅴ の3度をナチュラルマイナーから半音上げます（和声的短音階）。');
        answer.push(`${chord.key.tonic}マイナーの Ⅴ の3度は ${toneOf('3')}`);
      }
      break;
    default:
      if (minorFive) {
        title = 'マイナーキーの Ⅴ';
        lines.push('3度をナチュラルマイナーから半音上げます（和声的短音階）。');
        answer.push(`${chord.key.tonic}マイナーの Ⅴ の3度は ${toneOf('3')}`);
      }
  }

  if (level === 'rootless' && chord.tones.length === 4) {
    if (!title) title = 'ルートレス';
    lines.push(
      chord.quality === 'm7b5'
        ? 'ルートレスでは根音を省略できます。3度・♭5・7度がそろえば完成です。'
        : 'ルートレスでは根音と5度を省略できます。3度と7度がそろえば完成です。',
    );
  }

  if (!title) return null;
  answer.unshift(`構成音：${toneList(chord)}`);
  return { title, lines, answer };
}
