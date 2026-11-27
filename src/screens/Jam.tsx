// ⑤フリー演奏：登録した曲のコードをタイルで鳴らす。YouTube を埋め込んで、曲に合わせて弾く
import { useEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { KeyMark, Keyboard } from '../components/Keyboard';
import { YouTubeHandle, YouTubePlayer } from '../components/YouTubePlayer';
import {
  bassNote,
  diatonicSpecs,
  JAM_PRESETS,
  JAM_QUALITIES,
  JAM_QUALITY_ORDER,
  JamChord,
  JamChordSpec,
  JamQuality,
  jamDegreeLabel,
  resolveJamChord,
  sameSpec,
  tonicForMode,
  tonicsFor,
  voiceChord,
  youtubeId,
  youtubeStart,
} from '../music/jam';
import { KeyDef, keyName, KeyMode, mod12, ROMAN } from '../music/theory';
import {
  DEFAULT_JAM_SOUND,
  deleteSong,
  JamSong,
  JamSound,
  JamSustain,
  listSongs,
  saveSong,
  useProgress,
} from '../store/progress';

const SUSTAIN_LABEL: Record<JamSustain, string> = {
  fixed: '決まった長さ',
  hold: '押している間',
  untilNext: '次のコードまで',
};

/** タイルに割り当てるキー（PCキーボード） */
const TILE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '^'];

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function newSong(): JamSong {
  const now = Date.now();
  return {
    id: newId(),
    title: '',
    youtube: '',
    key: { tonic: 'C', mode: 'major' },
    chords: diatonicSpecs('major', false).slice(0, 6),
    sound: { ...DEFAULT_JAM_SOUND },
    videoVolume: 70,
    createdAt: now,
    updatedAt: now,
  };
}

// ---- 一覧 ----

interface ListProps {
  onBack: () => void;
  onPlay: (id: string) => void;
  onEdit: (id: string | null) => void;
}

export function JamList({ onBack, onPlay, onEdit }: ListProps) {
  const p = useProgress();
  const songs = listSongs(p);
  return (
    <div className="screen">
      <header className="bar">
        <button className="ghost" onClick={onBack}>
          ← 戻る
        </button>
        <h2>フリー演奏</h2>
        <span className="spacer" />
        <button className="primary" onClick={() => onEdit(null)}>
          ＋ 曲を登録
        </button>
      </header>
      <p className="small muted">
        曲ごとに YouTube の URL・キー・使うコードを登録しておくと、次からはタップするだけで始められます。
      </p>
      {songs.length === 0 && (
        <section>
          <p>まだ曲がありません。「＋ 曲を登録」から追加してください。</p>
        </section>
      )}
      <div className="song-list">
        {songs.map((s) => (
          <div key={s.id} className="song-row">
            <button className="song-main" onClick={() => onPlay(s.id)}>
              <span className="song-title">{s.title || '（無題）'}</span>
              <span className="small muted">
                キー {keyName(s.key)}　{s.chords.length}コード{youtubeId(s.youtube) ? '　▶ 動画あり' : ''}
              </span>
              <span className="small muted song-chords">
                {s.chords.map((c) => resolveJamChord(s.key, c).name).join(' ')}
              </span>
            </button>
            <button onClick={() => onEdit(s.id)}>編集</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- キーの選択 ----

function KeyPicker({ value, onChange }: { value: KeyDef; onChange: (k: KeyDef) => void }) {
  return (
    <span className="key-picker">
      <select value={value.tonic} onChange={(e) => onChange({ ...value, tonic: e.target.value })} aria-label="主音">
        {tonicsFor(value.mode).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select
        value={value.mode}
        onChange={(e) => {
          const mode = e.target.value as KeyMode;
          onChange({ tonic: tonicForMode(value.tonic, mode), mode });
        }}
        aria-label="メジャー／マイナー"
      >
        <option value="major">メジャー</option>
        <option value="minor">マイナー</option>
      </select>
    </span>
  );
}

// ---- 編集 ----

interface EditProps {
  songId: string | null;
  onCancel: () => void;
  onSaved: (id: string, play: boolean) => void;
  onDeleted: () => void;
}

export function JamEdit({ songId, onCancel, onSaved, onDeleted }: EditProps) {
  const p = useProgress();
  const stored = songId ? p.songs[songId] : undefined;
  const [song, setSong] = useState<JamSong>(() => (stored ? structuredClone(stored) : newSong()));
  const [palette, setPalette] = useState<'triad' | 'seventh'>('triad');
  const [custom, setCustom] = useState<JamChordSpec>({ deg: 7, acc: -1, quality: 'maj' });
  const preview = useChordVoice();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const vid = youtubeId(song.youtube);
  const set = (patch: Partial<JamSong>) => setSong((s) => ({ ...s, ...patch }));
  const add = (spec: JamChordSpec) => {
    set({ chords: [...song.chords, spec] });
    preview.play(resolveJamChord(song.key, spec), { ...song.sound, sustain: 'fixed' });
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= song.chords.length) return;
    const chords = [...song.chords];
    [chords[i], chords[j]] = [chords[j], chords[i]];
    set({ chords });
  };
  const remove = (i: number) => set({ chords: song.chords.filter((_, k) => k !== i) });

  const save = (play: boolean) => {
    saveSong({ ...song, title: song.title.trim() });
    onSaved(song.id, play);
  };

  if (songId && !stored) {
    return (
      <div className="screen">
        <header className="bar">
          <button className="ghost" onClick={onCancel}>
            ← 戻る
          </button>
        </header>
        <p>この曲は削除されました。</p>
      </div>
    );
  }

  return (
    <div className="screen jam-edit">
      <header className="bar">
        <button className="ghost" onClick={onCancel}>
          ← 戻る
        </button>
        <h2>{stored ? '曲を編集' : '曲を登録'}</h2>
      </header>

      <section>
        <h3>曲</h3>
        <div className="form">
          <label>
            曲名
            <input type="text" value={song.title} placeholder="例：〇〇のサビ" onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label>
            YouTube の URL（なくても可）
            <input
              type="url"
              inputMode="url"
              value={song.youtube}
              placeholder="https://www.youtube.com/watch?v=…"
              onChange={(e) => set({ youtube: e.target.value })}
            />
            {song.youtube.trim() !== '' && (
              <span className={`small ${vid ? 'ok-text' : 'ng-text'}`}>
                {vid
                  ? `動画ID ${vid}${youtubeStart(song.youtube) ? `（${youtubeStart(song.youtube)}秒から）` : ''}`
                  : 'URL から動画を見つけられません'}
              </span>
            )}
          </label>
          <label>
            キー
            <KeyPicker value={song.key} onChange={(key) => set({ key })} />
          </label>
        </div>
      </section>

      <section>
        <h3>使うコード（{song.chords.length}）</h3>
        <p className="small muted">タイルの順に並びます。キーを変えると、同じディグリーのまま移調されます。</p>
        <div className="tile-edit-list">
          {song.chords.map((c, i) => {
            const chord = resolveJamChord(song.key, c);
            return (
              <div key={i} className="tile-edit">
                <button className="ghost tiny" onClick={() => move(i, -1)} disabled={i === 0} aria-label="左へ">
                  ‹
                </button>
                <span className="tile-edit-name">
                  <b>{chord.name}</b>
                  <span className="small muted">{chord.degree}</span>
                </span>
                <button className="ghost tiny" onClick={() => move(i, 1)} disabled={i === song.chords.length - 1} aria-label="右へ">
                  ›
                </button>
                <button className="ghost tiny ng-text" onClick={() => remove(i)} aria-label="削除">
                  ×
                </button>
              </div>
            );
          })}
          {song.chords.length === 0 && <span className="muted small">下から追加してください。</span>}
        </div>

        <h3>追加する</h3>
        <div className="row">
          <button className={palette === 'triad' ? 'primary' : ''} onClick={() => setPalette('triad')}>
            3和音
          </button>
          <button className={palette === 'seventh' ? 'primary' : ''} onClick={() => setPalette('seventh')}>
            4和音
          </button>
          <span className="small muted">キー {keyName(song.key)} のダイアトニックコード（タップで追加）</span>
        </div>
        <div className="palette">
          {diatonicSpecs(song.key.mode, palette === 'seventh').map((spec) => {
            const chord = resolveJamChord(song.key, spec);
            const used = song.chords.some((c) => sameSpec(c, spec));
            return (
              <button key={chord.degree} className={`palette-chip ${used ? 'used' : ''}`} onClick={() => add(spec)}>
                <b>{chord.name}</b>
                <span className="small muted">{chord.degree}</span>
              </button>
            );
          })}
        </div>

        <div className="row custom-chord">
          <span className="small">そのほかのコード：</span>
          <select
            value={custom.acc}
            onChange={(e) => setCustom({ ...custom, acc: Number(e.target.value) as -1 | 0 | 1 })}
            aria-label="変化記号"
          >
            <option value={-1}>♭</option>
            <option value={0}>（なし）</option>
            <option value={1}>♯</option>
          </select>
          <select value={custom.deg} onChange={(e) => setCustom({ ...custom, deg: Number(e.target.value) })} aria-label="ディグリー">
            {ROMAN.map((r, i) => (
              <option key={r} value={i + 1}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={custom.quality}
            onChange={(e) => setCustom({ ...custom, quality: e.target.value as JamQuality })}
            aria-label="コードの種類"
          >
            {JAM_QUALITY_ORDER.map((q) => (
              <option key={q} value={q}>
                {JAM_QUALITIES[q].label}
              </option>
            ))}
          </select>
          <button onClick={() => add(custom)}>
            {resolveJamChord(song.key, custom).name}（{jamDegreeLabel(custom)}）を追加
          </button>
        </div>

        <div className="row custom-chord">
          <span className="small">進行のプリセット：</span>
          <select
            value=""
            onChange={(e) => {
              const preset = JAM_PRESETS[Number(e.target.value)];
              if (!preset) return;
              const fresh = preset.chords.filter((c) => !song.chords.some((x) => sameSpec(x, c)));
              set({ chords: [...song.chords, ...fresh] });
            }}
          >
            <option value="">選んで追加…</option>
            {JAM_PRESETS.map((pr, i) => (
              <option key={pr.name} value={i}>
                {pr.name}
                {pr.mode !== song.key.mode ? `（${pr.mode === 'major' ? 'メジャー' : 'マイナー'}キー向け）` : ''}
              </option>
            ))}
          </select>
          {song.chords.length > 0 && (
            <button className="ghost" onClick={() => set({ chords: [] })}>
              すべて外す
            </button>
          )}
        </div>
      </section>

      <section>
        <h3>音</h3>
        <SoundControls sound={song.sound} onChange={(sound) => set({ sound })} />
      </section>

      <div className="row edit-actions">
        <button className="primary big" onClick={() => save(true)} disabled={song.chords.length === 0}>
          保存して演奏
        </button>
        <button onClick={() => save(false)} disabled={song.chords.length === 0}>
          保存
        </button>
        <span className="spacer" />
        {stored &&
          (confirmDelete ? (
            <>
              <span className="small">「{stored.title || '（無題）'}」を削除しますか？</span>
              <button
                className="danger"
                onClick={() => {
                  deleteSong(stored.id);
                  onDeleted();
                }}
              >
                削除する
              </button>
              <button onClick={() => setConfirmDelete(false)}>やめる</button>
            </>
          ) : (
            <button className="danger" onClick={() => setConfirmDelete(true)}>
              削除
            </button>
          ))}
      </div>
    </div>
  );
}

// ---- 音の設定 ----

function SoundControls({ sound, onChange }: { sound: JamSound; onChange: (s: JamSound) => void }) {
  const set = (patch: Partial<JamSound>) => onChange({ ...sound, ...patch });
  return (
    <div className="form sound-form">
      <label>
        音の長さ
        <select value={sound.sustain} onChange={(e) => set({ sustain: e.target.value as JamSustain })}>
          {(Object.keys(SUSTAIN_LABEL) as JamSustain[]).map((k) => (
            <option key={k} value={k}>
              {SUSTAIN_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      {sound.sustain === 'fixed' && (
        <label>
          長さ：{sound.length.toFixed(1)}秒
          <input
            type="range"
            min={0.1}
            max={6}
            step={0.1}
            value={sound.length}
            onChange={(e) => set({ length: Number(e.target.value) })}
          />
        </label>
      )}
      <label>
        ストローク：{sound.strum === 0 ? 'なし（同時）' : `${Math.round(sound.strum * 1000)}ms`}
        <input
          type="range"
          min={0}
          max={0.08}
          step={0.005}
          value={sound.strum}
          onChange={(e) => set({ strum: Number(e.target.value) })}
        />
      </label>
      <label>
        コードの音量
        <input type="range" min={0} max={1} step={0.05} value={sound.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={sound.bass} onChange={(e) => set({ bass: e.target.checked })} />
        左手でベース（根音）も鳴らす
      </label>
    </div>
  );
}

// ---- 発音 ----

interface Sounding {
  chord: JamChord;
  upper: number[];
  bass: number | null;
}

/** コードを鳴らし、前のコードからのヴォイスリーディングを保つ */
function useChordVoice() {
  const state = useRef({
    notes: [] as { midi: number; at: number }[],
    prev: null as number[] | null,
    timer: 0 as number | undefined,
    token: 0,
  });
  const [current, setCurrent] = useState<Sounding | null>(null);
  const [active, setActive] = useState(false);

  const stop = () => {
    const s = state.current;
    window.clearTimeout(s.timer);
    const now = audio.now();
    for (const n of s.notes) audio.noteOff(n.midi, Math.max(now, n.at + 0.01));
    s.notes = [];
    setActive(false);
  };

  const play = (chord: JamChord, sound: JamSound): number => {
    const s = state.current;
    stop();
    if (!audio.isReady) void audio.start();
    audio.setPianoVolume(sound.volume);
    const upper = voiceChord(chord, s.prev);
    s.prev = upper;
    const bass = sound.bass ? bassNote(chord) : null;
    const notes = bass !== null ? [bass, ...upper] : upper;
    const t0 = audio.now() + 0.005;
    s.notes = notes.map((m, i) => ({ midi: m, at: t0 + i * sound.strum }));
    for (const n of s.notes) audio.noteOn(n.midi, n.midi === bass ? 0.75 : 0.62, n.at);
    const token = ++s.token;
    if (sound.sustain === 'fixed') {
      s.timer = window.setTimeout(() => {
        if (state.current.token === token) stop();
      }, (sound.length + sound.strum * notes.length) * 1000);
    }
    setCurrent({ chord, upper, bass });
    setActive(true);
    return token;
  };

  /** 押している間だけ鳴らすとき：離したコードがまだ鳴っていれば止める */
  const release = (token: number) => {
    if (state.current.token === token) stop();
  };

  useEffect(
    () => () => {
      stop();
      audio.setPianoVolume(1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { play, release, stop, current, active, resetVoicing: () => (state.current.prev = null) };
}

// ---- 演奏 ----

interface PlayProps {
  songId: string;
  onBack: () => void;
  onEdit: () => void;
}

export function JamPlay({ songId, onBack, onEdit }: PlayProps) {
  const p = useProgress();
  const stored = p.songs[songId];
  // 演奏中の変更（キー・音・音量）は曲に保存して、次回もそのまま始められるようにする
  const [song, setSong] = useState<JamSong | undefined>(() => (stored ? structuredClone(stored) : undefined));
  const dirty = useRef(false);
  const update = (patch: Partial<JamSong>) => {
    dirty.current = true;
    setSong((s) => (s ? { ...s, ...patch } : s));
  };
  useEffect(() => {
    if (!dirty.current || !song) return;
    const t = window.setTimeout(() => {
      saveSong(song);
      dirty.current = false;
    }, 600);
    return () => window.clearTimeout(t);
  }, [song]);
  // 画面を出るときに保存し損ねないように
  const latest = useRef(song);
  latest.current = song;
  useEffect(
    () => () => {
      if (dirty.current && latest.current) saveSong(latest.current);
    },
    [],
  );

  const voice = useChordVoice();
  const player = useRef<YouTubeHandle>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [showSound, setShowSound] = useState(false);
  const [pressed, setPressed] = useState<number | null>(null);

  const chords = useMemo(() => (song ? song.chords.map((c) => resolveJamChord(song.key, c)) : []), [song?.key, song?.chords]);
  const vid = song ? youtubeId(song.youtube) : null;
  const start = song ? youtubeStart(song.youtube) : 0;

  // 押している間の発音トークン（タイル番号 → トークン）
  const holds = useRef(new Map<number, number>());
  const down = (i: number) => {
    if (!song) return;
    const token = voice.play(chords[i], song.sound);
    holds.current.set(i, token);
    setPressed(i);
  };
  const up = (i: number) => {
    const token = holds.current.get(i);
    holds.current.delete(i);
    if (token !== undefined && song?.sound.sustain === 'hold') voice.release(token);
    setPressed((x) => (x === i ? null : x));
  };

  // PCキーボード：数字キーでタイル、スペースで動画の再生／一時停止、←→で5秒戻る／進む
  const downRef = useRef(down);
  const upRef = useRef(up);
  downRef.current = down;
  upRef.current = up;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = TILE_KEYS.indexOf(e.key);
      if (e.type === 'keydown') {
        if (i >= 0 && i < chords.length) {
          e.preventDefault();
          if (!e.repeat) downRef.current(i);
        } else if (e.key === ' ') {
          e.preventDefault();
          player.current?.togglePlay();
        } else if (e.key === 'ArrowLeft') {
          player.current?.seekBy(-5);
        } else if (e.key === 'ArrowRight') {
          player.current?.seekBy(5);
        }
      } else if (i >= 0) {
        upRef.current(i);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [chords.length]);

  if (!song || !stored || stored.deleted) {
    return (
      <div className="screen">
        <header className="bar">
          <button className="ghost" onClick={onBack}>
            ← 戻る
          </button>
        </header>
        <p>この曲は見つかりません（削除された可能性があります）。</p>
      </div>
    );
  }

  const cur = voice.current;
  const kbStart = song.sound.bass ? 36 : 48;
  const kbOctaves = song.sound.bass ? 4 : 3;
  const marks = new Map<number, KeyMark>();
  const names = new Map<number, string>();
  if (cur) {
    const nameOf = (m: number) => cur.chord.tones.find((t) => t.pc === mod12(m))?.name ?? '';
    for (const m of cur.upper) {
      marks.set(m, 'lit');
      names.set(m, nameOf(m));
    }
    if (cur.bass !== null) {
      marks.set(cur.bass, 'held');
      names.set(cur.bass, nameOf(cur.bass));
    }
  }

  return (
    <div className={`screen jam-play ${vid ? 'has-video' : ''}`}>
      <header className="bar">
        <button className="ghost" onClick={onBack}>
          ← 戻る
        </button>
        <h2 className="jam-title">{song.title || '（無題）'}</h2>
        <span className="spacer" />
        <KeyPicker
          value={song.key}
          onChange={(key) => {
            voice.resetVoicing();
            update({ key });
          }}
        />
        <button className="ghost" onClick={onEdit}>
          編集
        </button>
      </header>

      <div className="jam-main">
        {vid && (
          <div className="jam-video">
            <YouTubePlayer ref={player} videoId={vid} start={start} volume={song.videoVolume} onPlayingChange={setVideoPlaying} />
            <div className="row video-controls">
              <button onClick={() => player.current?.togglePlay()}>{videoPlaying ? '⏸ 一時停止' : '▶ 再生'}</button>
              <button onClick={() => player.current?.seekBy(-5)}>−5秒</button>
              <button onClick={() => player.current?.seekBy(5)}>＋5秒</button>
              <button onClick={() => player.current?.restart()}>最初から</button>
              <label className="inline-range">
                曲
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={song.videoVolume}
                  onChange={(e) => update({ videoVolume: Number(e.target.value) })}
                  aria-label="動画の音量"
                />
              </label>
              <label className="inline-range">
                コード
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={song.sound.volume}
                  onChange={(e) => update({ sound: { ...song.sound, volume: Number(e.target.value) } })}
                  aria-label="コードの音量"
                />
              </label>
            </div>
          </div>
        )}

        <div className="jam-side">
          <div className="tiles" style={{ ['--cols' as string]: Math.min(4, Math.max(2, Math.ceil(Math.sqrt(chords.length)))) }}>
            {chords.map((c, i) => (
              <button
                key={i}
                className={`tile ${pressed === i ? 'pressed' : ''} ${cur?.chord === c && voice.active ? 'sounding' : ''}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                  down(i);
                }}
                onPointerUp={() => up(i)}
                onPointerCancel={() => up(i)}
                onContextMenu={(e) => e.preventDefault()}
              >
                <span className="tile-name">{c.name}</span>
                <span className="tile-degree">{c.degree}</span>
                {i < TILE_KEYS.length && <span className="tile-key">{TILE_KEYS[i]}</span>}
              </button>
            ))}
          </div>

          <div className="row sound-bar">
            <button className="ghost" onClick={() => setShowSound((x) => !x)}>
              音の設定 {showSound ? '▲' : '▼'}
            </button>
            <span className="small muted">
              {SUSTAIN_LABEL[song.sound.sustain]}
              {song.sound.sustain === 'fixed' && `（${song.sound.length.toFixed(1)}秒）`}
            </span>
            {voice.active && (
              <button className="ghost" onClick={voice.stop}>
                ■ 音を止める
              </button>
            )}
          </div>
          {showSound && <SoundControls sound={song.sound} onChange={(sound) => update({ sound })} />}
        </div>
      </div>

      <div className="jam-now">
        {cur ? (
          <>
            <b>{cur.chord.name}</b>
            <span className="muted">{cur.chord.degree}</span>
            <span className="small">{cur.chord.tones.map((t) => t.name).join(' ・ ')}</span>
          </>
        ) : (
          <span className="muted small">タイルを押すと、押さえる鍵盤がここに表示されます（緑：左手のベース、青：右手）</span>
        )}
      </div>
      <Keyboard start={kbStart} octaves={kbOctaves} marks={marks} label={(m) => names.get(m) ?? null} height="22vh" />
    </div>
  );
}
