// 起動中のサーバー（vite dev / preview）の SQLite に進捗を保存する。
// サーバーがない配信（静的ホスティング）では何もせず、localStorage だけで動く。
import { useSyncExternalStore } from 'react';
import { getProgress, mergeProgress, normalizeProgress, onProgressSave, Progress, setProgress } from './progress';

const API = '/api/progress';
const EPOCH_KEY = 'codePractice.serverEpoch';

export type ServerState = 'connecting' | 'online' | 'offline';

interface Remote {
  data: Progress | null;
  revision: number;
  epoch: number;
}

let state: ServerState = 'connecting';
let revision = 0;
let epoch: number | null = loadEpoch();
let applying = false;
let pushing = false;
let dirty = false;
let bumpEpoch = false;
let pushTimer: number | undefined;
const listeners = new Set<() => void>();

function loadEpoch(): number | null {
  try {
    const v = localStorage.getItem(EPOCH_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

function setEpoch(e: number) {
  epoch = e;
  try {
    localStorage.setItem(EPOCH_KEY, String(e));
  } catch {
    // 無視
  }
}

function setState(s: ServerState) {
  state = s;
  listeners.forEach((l) => l());
}

export function useServerState(): ServerState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** サーバーの内容で置き換える（保存フックからの送り返しはしない） */
function apply(p: Progress) {
  applying = true;
  try {
    setProgress(p, false);
  } finally {
    applying = false;
  }
}

/**
 * サーバーの内容を取り込む。
 * epoch が違えば（リセット・全クリのスクリプトなど）サーバーを正とし、同じなら手元とマージして送り返す。
 */
function absorb(remote: Remote) {
  revision = remote.revision;
  if (!remote.data) {
    dirty = true; // サーバーが空なら手元の進捗を移す
    return;
  }
  const data = normalizeProgress(remote.data);
  if (epoch !== remote.epoch) {
    setEpoch(remote.epoch);
    apply(data);
    return;
  }
  apply(mergeProgress(getProgress(), data));
  dirty = true;
}

async function fetchRemote(): Promise<Remote | null> {
  const res = await fetch(API, { cache: 'no-store' });
  if (!res.ok || !res.headers.get('Content-Type')?.includes('application/json')) return null;
  return (await res.json()) as Remote;
}

async function pushOnce() {
  const res = await fetch(API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: getProgress(), baseRevision: revision, bumpEpoch }),
  });
  if (res.ok) {
    const r = (await res.json()) as { revision: number; epoch: number };
    revision = r.revision;
    setEpoch(r.epoch);
    bumpEpoch = false;
  } else if (res.status === 409) {
    const remote = (await res.json()) as Remote;
    if (bumpEpoch) {
      // リセットの書き込みは、ぶつかってもマージせずに手元の内容で上書きし直す
      revision = remote.revision;
      dirty = true;
    } else {
      absorb(remote);
    }
  } else {
    throw new Error(`HTTP ${res.status}`);
  }
}

async function flush() {
  if (state !== 'online') return;
  if (pushing) {
    dirty = true;
    return;
  }
  pushing = true;
  try {
    do {
      dirty = false;
      await pushOnce();
    } while (dirty);
  } catch {
    setState('offline');
  } finally {
    pushing = false;
  }
}

async function refresh() {
  if (pushing) return;
  try {
    const remote = await fetchRemote();
    if (!remote) {
      setState('offline');
      return;
    }
    setState('online');
    if (remote.revision !== revision || !remote.data) absorb(remote);
    if (dirty) await flush();
  } catch {
    setState('offline');
  }
}

/** アプリ内のリセット：他の端末の古い進捗がマージで戻ってこないよう、サーバーの内容を正とさせる */
export function markLocalReset() {
  bumpEpoch = true;
}

export function initServerStore() {
  onProgressSave(() => {
    if (applying) return;
    if (state !== 'online') {
      dirty = true; // つながったら送る
      return;
    }
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(flush, 300);
  });
  // 起動時は epoch が分からなければサーバーを正とする
  void refresh();
  // 別の端末やスクリプトでの変更を、画面に戻ったときに取り込む
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh();
  });
}
