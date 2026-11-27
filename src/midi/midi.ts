// Web MIDI API の入力と、テスト用のPCキーボード入力
import { useEffect, useState } from 'react';

export interface NoteInput {
  type: 'on' | 'off';
  midi: number;
  velocity: number;
  /** performance.now() 基準の時刻(ms) */
  time: number;
  /** 入力元の機器名（遅延補正値のキー） */
  device: string;
}

type Listener = (e: NoteInput) => void;

export const PC_KEYBOARD_NAME = 'PCキーボード';

// A W S E D F T G Y H U J K O L P ; → C4〜E5
const PC_KEYS: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9,
  KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16,
};

class MidiManager {
  supported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  private access: MIDIAccess | null = null;
  private requesting: Promise<boolean> | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<() => void>();
  private selectedId: string | null = null;
  private pcEnabled = false;
  private pcOctave = 0;
  private pcHeld = new Set<string>();
  error: string | null = null;
  lastDevice: string | null = null;

  init(): Promise<boolean> {
    if (!this.supported) return Promise.resolve(false);
    if (!this.requesting) {
      this.requesting = navigator
        .requestMIDIAccess()
        .then((access) => {
          this.access = access;
          access.onstatechange = () => {
            this.attach();
            this.emitState();
          };
          this.attach();
          this.emitState();
          return true;
        })
        .catch((e) => {
          this.error = String(e?.message ?? e);
          this.emitState();
          return false;
        });
    }
    return this.requesting;
  }

  inputs(): MIDIInput[] {
    return this.access ? [...this.access.inputs.values()] : [];
  }

  /** null はすべての入力を受け付ける */
  select(id: string | null) {
    this.selectedId = id;
    this.attach();
    this.emitState();
  }

  /** 遅延補正値のキーに使う機器名 */
  currentDeviceName(): string | null {
    if (this.lastDevice) return this.lastDevice;
    const ins = this.activeInputs();
    if (ins.length > 0) return ins[0].name ?? 'MIDI';
    return this.pcEnabled ? PC_KEYBOARD_NAME : null;
  }

  hasInput(): boolean {
    return this.activeInputs().length > 0 || this.pcEnabled;
  }

  private activeInputs() {
    return this.inputs().filter((i) => i.state === 'connected' && (!this.selectedId || i.id === this.selectedId));
  }

  private attach() {
    for (const input of this.inputs()) {
      input.onmidimessage = !this.selectedId || input.id === this.selectedId ? (e) => this.handle(input, e) : null;
    }
  }

  private handle(input: MIDIInput, e: MIDIMessageEvent) {
    const data = e.data;
    if (!data || data.length < 3) return;
    const cmd = data[0] & 0xf0;
    const midi = data[1];
    const vel = data[2];
    if (cmd !== 0x90 && cmd !== 0x80) return;
    const device = input.name ?? 'MIDI';
    this.lastDevice = device;
    this.emit({
      type: cmd === 0x90 && vel > 0 ? 'on' : 'off',
      midi,
      velocity: vel / 127,
      time: e.timeStamp,
      device,
    });
  }

  setPcKeyboard(enabled: boolean) {
    if (enabled === this.pcEnabled) return;
    this.pcEnabled = enabled;
    if (enabled) {
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
    } else {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
    }
    this.emitState();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === 'KeyZ') this.pcOctave = Math.max(-3, this.pcOctave - 1);
    if (e.code === 'KeyX') this.pcOctave = Math.min(3, this.pcOctave + 1);
    const off = PC_KEYS[e.code];
    if (off === undefined || e.repeat || this.pcHeld.has(e.code)) return;
    e.preventDefault();
    this.pcHeld.add(e.code);
    this.lastDevice = PC_KEYBOARD_NAME;
    this.emit({ type: 'on', midi: 60 + this.pcOctave * 12 + off, velocity: 0.8, time: e.timeStamp, device: PC_KEYBOARD_NAME });
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const off = PC_KEYS[e.code];
    if (off === undefined || !this.pcHeld.has(e.code)) return;
    this.pcHeld.delete(e.code);
    this.emit({ type: 'off', midi: 60 + this.pcOctave * 12 + off, velocity: 0, time: e.timeStamp, device: PC_KEYBOARD_NAME });
  };

  onNote(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  onState(l: () => void) {
    this.stateListeners.add(l);
    return () => {
      this.stateListeners.delete(l);
    };
  }

  private emit(e: NoteInput) {
    this.listeners.forEach((l) => l(e));
  }

  private emitState() {
    this.stateListeners.forEach((l) => l());
  }
}

export const midi = new MidiManager();

/** MIDI機器の接続状態が変わったら再描画する */
export function useMidiState() {
  const [, setTick] = useState(0);
  useEffect(() => midi.onState(() => setTick((t) => t + 1)), []);
  return midi;
}

/** 押している音の集合 */
export function useHeldNotes(): Set<number> {
  const [held, setHeld] = useState<Set<number>>(new Set());
  useEffect(
    () =>
      midi.onNote((e) =>
        setHeld((prev) => {
          const next = new Set(prev);
          if (e.type === 'on') next.add(e.midi);
          else next.delete(e.midi);
          return next;
        }),
      ),
    [],
  );
  return held;
}
