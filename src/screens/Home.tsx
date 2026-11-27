import { fullscreenSupported, toggleFullscreen, useFullscreen } from '../fullscreen';
import { isUnlocked, UnitInfo, unitInfo, UnitRef } from '../game';
import { levelLabelFor, THEMES } from '../music/themes';
import { midi, useMidiState } from '../midi/midi';
import { useProgress } from '../store/progress';
import { PUZZLE_LABEL, PuzzleKind } from './Puzzle';

interface HomeProps {
  onSelect: (ref: UnitRef) => void;
  onSettings: () => void;
  onStats: () => void;
  onJam: () => void;
}

export function Home({ onSelect, onSettings, onStats, onJam }: HomeProps) {
  const p = useProgress();
  useMidiState();
  const fullscreen = useFullscreen();

  return (
    <div className="screen">
      <header className="bar">
        <h1>コード練習ゲーム</h1>
        <span className="spacer" />
        {fullscreenSupported && (
          <button className="ghost" onClick={() => void toggleFullscreen()}>
            {fullscreen ? '全画面解除' : '全画面'}
          </button>
        )}
        <button className="ghost" onClick={onStats}>
          記録
        </button>
        <button className="ghost" onClick={onSettings}>
          設定
        </button>
      </header>
      <p className="muted">
        MIDI：{midi.supported ? (midi.hasInput() ? `接続中（${midi.currentDeviceName()}）` : '未接続') : '非対応（パズルのみ）'}
      </p>
      <button className="mode-btn jam-entry" onClick={onJam}>
        <span>🎸 フリー演奏</span>
        <span className="small muted">YouTube の曲に合わせて、登録したコードをタイルで鳴らす（MIDI不要）</span>
      </button>
      <div className="themes">
        {THEMES.map((theme) => {
          const themeOpen = theme.levels.some((level) => isUnlocked(p, { themeId: theme.id, keyIndex: 0, level }));
          return (
            <section key={theme.id} className={`theme-card ${themeOpen ? '' : 'locked'}`}>
              <div className="theme-head">
                <h3>{theme.name}</h3>
                <span className="muted small">
                  {theme.description}　{theme.beatsPerBar}/4
                </span>
              </div>
              {!themeOpen && <div className="muted small">基礎テーマのCキー（4和音）をクリアすると解放</div>}
              {theme.levels.map((level) => (
                <div key={level} className="key-row">
                  {theme.levels.length > 1 && <span className="level-tag">{levelLabelFor(theme, level)}</span>}
                  {theme.keys.map((k, keyIndex) => {
                    const ref = { themeId: theme.id, keyIndex, level };
                    const info = unitInfo(ref);
                    const open = isUnlocked(p, ref);
                    const u = p.units[info.id];
                    return (
                      <button
                        key={k.id}
                        className={`key-chip ${open ? '' : 'locked'} ${u?.cleared ? 'cleared' : ''}`}
                        disabled={!open}
                        onClick={() => onSelect(ref)}
                        title={u ? `最高正解率 ${Math.round(u.bestAccuracy * 100)}%` : ''}
                      >
                        {open ? k.display : '🔒'}
                        {u?.cleared && <span className="check-mark">✓</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

interface UnitMenuProps {
  info: UnitInfo;
  onBack: () => void;
  onFlash: () => void;
  onPuzzle: (kind: PuzzleKind) => void;
}

export function UnitMenu({ info, onBack, onFlash, onPuzzle }: UnitMenuProps) {
  const p = useProgress();
  useMidiState();
  const u = p.units[info.id];
  const pool = info.theme.pool(info.ref.level);
  const progs = info.theme.progressions(info.ref.level);

  return (
    <div className="screen">
      <header className="bar">
        <button className="ghost" onClick={onBack}>
          ← 戻る
        </button>
        <h2>{info.title}</h2>
      </header>
      <p className="muted">
        {u
          ? `プレイ ${u.plays}回　最高正解率 ${Math.round(u.bestAccuracy * 100)}%　${u.cleared ? 'クリア済み' : '正解率90%でクリア'}`
          : '正解率90%以上でクリア（次のキーが解放されます）'}
      </p>
      <p className="small muted">
        出題：{pool.length}種のコード／進行：{progs.map((x) => x.name).join('、')}
      </p>

      <h3>構成音パズル</h3>
      <p className="small muted">画面の鍵盤で構成音を1つずつ選ぶ。自分のペースで考えられるので、まずはこちらから。</p>
      {(Object.keys(PUZZLE_LABEL) as PuzzleKind[])
        // ルートは1音だけなので、ミッシングノートは成り立たない
        .filter((kind) => !(info.ref.level === 'root' && kind === 'missing'))
        .map((kind) => (
        <button key={kind} className="mode-btn" onClick={() => onPuzzle(kind)}>
          <span>{PUZZLE_LABEL[kind]}</span>
          <span className="small muted">ハイスコア {p.highScores[`puzzle-${kind}|${info.id}`] ?? 0}</span>
        </button>
      ))}

      <h3>ディグリー・フラッシュ</h3>
      <button className="mode-btn" onClick={onFlash}>
        <span>メトロノームに合わせてお題のコードを弾く</span>
        <span className="small muted">
          {midi.supported ? 'MIDI鍵盤が必要' : 'このブラウザはMIDI非対応'}　ハイスコア {p.highScores[`flash|${info.id}`] ?? 0}
        </span>
      </button>
    </div>
  );
}
