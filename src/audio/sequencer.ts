// メトロノームと伴奏（ドラム・ベース）を先読みでスケジュールする
import { BassStyle, DrumStyle } from '../music/themes';
import { Chord, mod12 } from '../music/theory';
import { ClickMode } from '../store/progress';
import { audio } from './engine';

export interface SequencerOptions {
  /** 小節0の頭（オーディオ時刻） */
  t0: number;
  beat: number;
  beatsPerBar: number;
  bars: number;
  countInBars: number;
  clickOn: boolean;
  clickMode: ClickMode;
  drums: DrumStyle;
  bass: BassStyle;
  swing: boolean;
  chordAt: (bar: number) => Chord | null;
}

const LOOKAHEAD = 0.2;
const INTERVAL_MS = 25;

/** 根音を E1〜D♯2 付近に置く */
const bassRoot = (pc: number) => 28 + mod12(pc - 4);

export class Sequencer {
  private timer: number | undefined;
  private nextBeat: number;
  private endBeat: number;

  constructor(private o: SequencerOptions) {
    this.nextBeat = -o.countInBars * o.beatsPerBar;
    this.endBeat = o.bars * o.beatsPerBar;
  }

  start() {
    this.tick();
    this.timer = window.setInterval(() => this.tick(), INTERVAL_MS);
  }

  stop() {
    window.clearInterval(this.timer);
    this.timer = undefined;
  }

  private tick() {
    const horizon = audio.now() + LOOKAHEAD;
    while (this.nextBeat < this.endBeat) {
      const t = this.o.t0 + this.nextBeat * this.o.beat;
      if (t > horizon) break;
      if (t >= audio.now() - 0.05) this.scheduleBeat(this.nextBeat, t);
      this.nextBeat++;
    }
    if (this.nextBeat >= this.endBeat) this.stop();
  }

  private scheduleBeat(g: number, t: number) {
    const { beatsPerBar: bpb, beat } = this.o;
    const bar = Math.floor(g / bpb);
    const b = g - bar * bpb; // 小節内の拍（0始まり）
    const countIn = bar < 0;
    const off = this.o.swing ? (beat * 2) / 3 : beat / 2; // 裏拍の位置

    // メトロノーム（カウントインは必ず鳴らす）
    if (countIn || this.o.clickOn) {
      const mode = countIn ? 'all' : this.o.clickMode;
      const backbeat = bpb === 3 ? b === 1 || b === 2 : b === 1 || b === 3;
      if (mode === 'all' || (mode === 'downbeat' && b === 0) || (mode === 'backbeat' && backbeat)) {
        audio.click(t, b === 0);
      }
    }
    if (countIn) return;

    switch (this.o.drums) {
      case 'eightBeat':
        audio.hat(t, b === 0 ? 0.9 : 0.7);
        audio.hat(t + off, 0.5);
        if (b === 0 || b === 2) audio.kick(t);
        if (b === 2) audio.kick(t + off, 0.7);
        if (b === 1 || b === 3) audio.snare(t);
        break;
      case 'swingRide':
        audio.ride(t, b % 2 === 0 ? 0.8 : 0.6);
        if (b === 1 || b === 3) {
          audio.ride(t + off, 0.5);
          audio.hat(t, 0.4); // ハイハットのフットクローズ
        }
        break;
      case 'fourOnFloor':
        audio.kick(t);
        audio.hat(t + beat / 2, 0.8);
        if (b === 1 || b === 3) audio.snare(t, 0.9);
        break;
    }

    const chord = this.o.chordAt(bar);
    if (!chord) return;
    const root = bassRoot(chord.rootPc);
    const tone = (role: string) => {
      const ct = chord.tones.find((x) => x.role === role);
      return ct ? root + ct.interval : root;
    };
    switch (this.o.bass) {
      case 'eighthRoot':
        audio.bass(root, off * 0.9, t);
        audio.bass(root, (beat - off) * 0.9, t + off, 0.7);
        break;
      case 'downbeatRoot':
        if (b === 0) audio.bass(root, beat * bpb * 0.9, t);
        break;
      case 'walking': {
        // 1拍目：根音、2・3拍目：構成音、最後の拍：次の根音へ半音で近づく
        const next = this.o.chordAt(bar + 1) ?? chord;
        const nextRoot = bassRoot(next.rootPc);
        let note: number;
        if (b === 0) note = root;
        else if (b === bpb - 1) note = nextRoot >= root ? nextRoot - 1 : nextRoot + 1;
        else note = b === 1 ? tone('3') : tone('5');
        audio.bass(note, beat * 0.85, t, b === 0 ? 0.95 : 0.8);
        break;
      }
    }
  }
}
