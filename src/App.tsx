import { useEffect, useMemo, useState } from 'react';
import { audio } from './audio/engine';
import { unitInfo, UnitRef } from './game';
import { midi } from './midi/midi';
import { Calibration } from './screens/Calibration';
import { Flash } from './screens/Flash';
import { Home, UnitMenu } from './screens/Home';
import { JamEdit, JamList, JamPlay } from './screens/Jam';
import { Puzzle, PuzzleKind } from './screens/Puzzle';
import { ScalePractice } from './screens/ScalePractice';
import { Settings } from './screens/Settings';
import { Stats } from './screens/Stats';
import { useSettings } from './store/progress';

type Screen =
  | { name: 'home' }
  | { name: 'unit'; ref: UnitRef }
  | { name: 'flash'; ref: UnitRef }
  | { name: 'puzzle'; ref: UnitRef; kind: PuzzleKind }
  | { name: 'scale'; ref: UnitRef }
  | { name: 'settings' }
  | { name: 'stats' }
  | { name: 'jam' }
  | { name: 'jamEdit'; songId: string | null }
  | { name: 'jamPlay'; songId: string }
  | { name: 'calibrate'; back: Screen };

const HOME: Screen = { name: 'home' };

// ブラウザの戻る/進むで SPA 内の画面を行き来できるよう、画面を history に積む
interface HistoryEntry {
  screen: Screen;
  depth: number;
}

function currentEntry(): HistoryEntry | null {
  const s = window.history.state as HistoryEntry | null;
  return s && s.screen ? s : null;
}

export function App() {
  const [screen, setScreen] = useState<Screen>(() => currentEntry()?.screen ?? HOME);
  const settings = useSettings();

  useEffect(() => {
    if (!currentEntry()) window.history.replaceState({ screen: HOME, depth: 0 } satisfies HistoryEntry, '');
    const onPop = () => setScreen(currentEntry()?.screen ?? HOME);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (next: Screen) => {
    window.history.pushState({ screen: next, depth: (currentEntry()?.depth ?? 0) + 1 } satisfies HistoryEntry, '');
    setScreen(next);
  };
  // 今の画面を置き換える（登録→演奏のように、戻るで編集画面に戻らないようにする）
  const replace = (next: Screen) => {
    window.history.replaceState({ screen: next, depth: currentEntry()?.depth ?? 0 } satisfies HistoryEntry, '');
    setScreen(next);
  };
  // 画面内の「戻る」は親画面＝直前の履歴なので history.back() に揃える。
  // 履歴が無い（リロード後の先頭など）場合は親画面に置き換える
  const back = (parent: Screen) => {
    if ((currentEntry()?.depth ?? 0) > 0) {
      window.history.back();
    } else {
      window.history.replaceState({ screen: parent, depth: 0 } satisfies HistoryEntry, '');
      setScreen(parent);
    }
  };

  useEffect(() => {
    void midi.init();
  }, []);
  useEffect(() => midi.select(settings.midiInputId), [settings.midiInputId]);
  useEffect(() => midi.setPcKeyboard(settings.pcKeyboard), [settings.pcKeyboard]);
  useEffect(() => {
    if (!settings.monitorMidi) return;
    return midi.onNote((e) => {
      if (!audio.isReady) return;
      if (e.type === 'on') audio.noteOn(e.midi, e.velocity);
      else audio.noteOff(e.midi);
    });
  }, [settings.monitorMidi]);
  // 最初のタップで音声を有効にする
  useEffect(() => {
    // スマホのタッチでは pointerdown はユーザー操作として扱われず、指を離したとき（pointerup/touchend）に初めて
    // 音声を有効にできる。止められた（suspended）音声も、操作のたびに再開を試みる
    const unlock = () => void audio.start();
    const events = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
    events.forEach((e) => window.addEventListener(e, unlock, { capture: true, passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, unlock, { capture: true }));
  }, []);

  const ref = 'ref' in screen ? screen.ref : null;
  const info = useMemo(() => (ref ? unitInfo(ref) : null), [ref]);

  switch (screen.name) {
    case 'home':
      return (
        <Home
          // スケールの段階は④スケール練習だけなので、メニューを飛ばして直接始める
          onSelect={(r) => go(r.level === 'scale' ? { name: 'scale', ref: r } : { name: 'unit', ref: r })}
          onSettings={() => go({ name: 'settings' })}
          onStats={() => go({ name: 'stats' })}
          onJam={() => go({ name: 'jam' })}
        />
      );
    case 'unit':
      return (
        <UnitMenu
          info={info!}
          onBack={() => back(HOME)}
          onFlash={() => go({ name: 'flash', ref: screen.ref })}
          onPuzzle={(kind) => go({ name: 'puzzle', ref: screen.ref, kind })}
        />
      );
    case 'flash':
      return (
        <Flash
          info={info!}
          onExit={() => back({ name: 'unit', ref: screen.ref })}
          onCalibrate={() => go({ name: 'calibrate', back: screen })}
        />
      );
    case 'puzzle':
      return <Puzzle key={screen.kind} info={info!} kind={screen.kind} onExit={() => back({ name: 'unit', ref: screen.ref })} />;
    case 'scale':
      return <ScalePractice info={info!} onExit={() => back(HOME)} />;
    case 'settings':
      return (
        <Settings
          onExit={() => back(HOME)}
          onCalibrate={() => go({ name: 'calibrate', back: screen })}
        />
      );
    case 'stats':
      return <Stats onExit={() => back(HOME)} />;
    case 'jam':
      return (
        <JamList
          onBack={() => back(HOME)}
          onPlay={(songId) => go({ name: 'jamPlay', songId })}
          onEdit={(songId) => go({ name: 'jamEdit', songId })}
        />
      );
    case 'jamEdit':
      return (
        <JamEdit
          key={screen.songId ?? 'new'}
          songId={screen.songId}
          onCancel={() => back({ name: 'jam' })}
          onSaved={(songId, play) => (play ? replace({ name: 'jamPlay', songId }) : back({ name: 'jam' }))}
          onDeleted={() => back({ name: 'jam' })}
        />
      );
    case 'jamPlay':
      return (
        <JamPlay
          key={screen.songId}
          songId={screen.songId}
          onBack={() => back({ name: 'jam' })}
          onEdit={() => go({ name: 'jamEdit', songId: screen.songId })}
        />
      );
    case 'calibrate':
      return <Calibration onExit={() => back(screen.back)} />;
  }
}
