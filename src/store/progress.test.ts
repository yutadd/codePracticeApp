import { describe, expect, it } from 'vitest';
import { DEFAULT_JAM_SOUND, JamSong, mergeProgress, normalizeProgress } from './progress';

const song = (id: string, updatedAt: number, extra: Partial<JamSong> = {}): JamSong => ({
  id,
  title: id,
  youtube: '',
  key: { tonic: 'C', mode: 'major' },
  chords: [],
  sound: { ...DEFAULT_JAM_SOUND },
  videoVolume: 70,
  createdAt: 0,
  updatedAt,
  ...extra,
});

describe('曲のマージ', () => {
  it('両方の曲を残し、同じ曲は新しい方を採用する', () => {
    const a = normalizeProgress({ songs: { x: song('x', 10, { title: 'old' }), y: song('y', 5) } });
    const b = normalizeProgress({ songs: { x: song('x', 20, { title: 'new' }), z: song('z', 1) } });
    const m = mergeProgress(a, b);
    expect(Object.keys(m.songs).sort()).toEqual(['x', 'y', 'z']);
    expect(m.songs.x.title).toBe('new');
  });

  it('削除は新しければ復活しない', () => {
    const a = normalizeProgress({ songs: { x: song('x', 30, { deleted: true }) } });
    const b = normalizeProgress({ songs: { x: song('x', 20) } });
    expect(mergeProgress(a, b).songs.x.deleted).toBe(true);
    expect(mergeProgress(b, a).songs.x.deleted).toBe(true);
  });

  it('古いデータ（songs なし）も読める', () => {
    expect(normalizeProgress({ units: {} }).songs).toEqual({});
  });
});
