import { midi, useMidiState } from '../midi/midi';
import { NoteNameMode, updateProgress, updateSettings, useProgress } from '../store/progress';
import { markLocalReset, useServerState } from '../store/server';
import { signIn, signOut, syncNow, useSyncStatus } from '../store/sync';

interface Props {
  onExit: () => void;
  onCalibrate: () => void;
}

export function Settings({ onExit, onCalibrate }: Props) {
  const progress = useProgress();
  const s = progress.settings;
  const sync = useSyncStatus();
  const server = useServerState();
  useMidiState();
  const inputs = midi.inputs();

  return (
    <div className="screen">
      <header className="bar">
        <button className="ghost" onClick={onExit}>
          ← 戻る
        </button>
        <h2>設定</h2>
      </header>

      <section>
        <h3>MIDI入力</h3>
        {!midi.supported && <div className="warn">このブラウザはWeb MIDIに対応していません。</div>}
        {midi.error && <div className="warn">MIDIの許可が得られませんでした：{midi.error}</div>}
        <div className="form">
          <label>
            入力機器
            <select
              value={s.midiInputId ?? ''}
              onChange={(e) => updateSettings({ midiInputId: e.target.value || null })}
            >
              <option value="">すべての機器（{inputs.length}台接続中）</option>
              {inputs.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.state !== 'connected' ? '（未接続）' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={s.monitorMidi} onChange={(e) => updateSettings({ monitorMidi: e.target.checked })} />
            MIDI入力をアプリで鳴らす（音源のないキーボード向け）
          </label>
          <label className="check">
            <input type="checkbox" checked={s.pcKeyboard} onChange={(e) => updateSettings({ pcKeyboard: e.target.checked })} />
            PCキーボードで入力（テスト用：A〜;で白鍵、W E T Y U O Pで黒鍵、Z/Xでオクターブ）
          </label>
          <button onClick={onCalibrate}>遅延補正を測定する</button>
        </div>
      </section>

      <section>
        <h3>構成音パズル</h3>
        <div className="form">
          <label>
            音名の表示
            <select value={s.noteNames} onChange={(e) => updateSettings({ noteNames: e.target.value as NoteNameMode })}>
              <option value="show">表示</option>
              <option value="after">完了後だけ表示</option>
              <option value="hide">非表示</option>
            </select>
          </label>
          <label>
            1セッションの問題数
            <select value={s.puzzleQuestions} onChange={(e) => updateSettings({ puzzleQuestions: Number(e.target.value) })}>
              {[5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section>
        <h3>進捗の同期</h3>
        {import.meta.env.STATIC_ONLY ? (
          <p className="muted">進捗はこの端末のブラウザにだけ保存されます（ブラウザのデータを消すと消えます）。</p>
        ) : (
          <>
            <p className="muted small">
              {server === 'online'
                ? '進捗は起動中のサーバーの SQLite（data/progress.db）に保存されます。'
                : server === 'connecting'
                  ? 'サーバーに接続中…'
                  : 'サーバーに接続できないため、進捗はこの端末にだけ保存しています（つながったら SQLite に送ります）。'}
            </p>
            {sync.state === 'unavailable' ? (
              <p className="muted">
                同期は未設定です（進捗はこの端末にだけ保存されます）。Supabaseの URL と anon key を .env.local に設定すると、Googleログインで端末間の同期ができます。詳しくは README を参照してください。
              </p>
            ) : sync.state === 'signedOut' ? (
              <button className="primary" onClick={signIn}>
                Googleでログイン
              </button>
            ) : (
              <div className="form">
                <div>
                  {sync.email} でログイン中
                  {sync.state === 'syncing' && '同期中…'}
                  {sync.state === 'synced' && `同期済み（${new Date(sync.lastSync!).toLocaleTimeString()}）`}
                  {sync.state === 'error' && <span className="ng-text">同期エラー：{sync.message}</span>}
                </div>
                <div className="row">
                  <button onClick={syncNow}>今すぐ同期</button>
                  <button onClick={signOut}>ログアウト</button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <h3>テスト用</h3>
        <div className="form">
          <label className="check">
            <input type="checkbox" checked={s.unlockAll} onChange={(e) => updateSettings({ unlockAll: e.target.checked })} />
            すべてのテーマ・キーを解放する
          </label>
          <button
            className="danger"
            onClick={() => {
              if (!confirm('解放状況・統計・ハイスコアをすべて消去します。よろしいですか？')) return;
              markLocalReset();
              updateProgress((p) => {
                p.units = {};
                p.chordStats = {};
                p.highScores = {};
              });
            }}
          >
            進捗をリセット
          </button>
        </div>
      </section>
    </div>
  );
}
