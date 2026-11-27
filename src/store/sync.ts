// Supabase による Googleログインと進捗の同期（環境変数が未設定なら無効）
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { getProgress, mergeProgress, normalizeProgress, onProgressChange, Progress, setProgress } from './progress';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const syncAvailable = Boolean(url && anonKey);

let client: SupabaseClient | null = null;
let session: Session | null = null;
let pushTimer: number | undefined;
let status: SyncStatus = { state: syncAvailable ? 'signedOut' : 'unavailable' };
const listeners = new Set<() => void>();

export interface SyncStatus {
  state: 'unavailable' | 'signedOut' | 'syncing' | 'synced' | 'error';
  email?: string;
  message?: string;
  lastSync?: number;
}

function setStatus(s: SyncStatus) {
  status = s;
  listeners.forEach((l) => l());
}

export function useSyncStatus(): SyncStatus {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return status;
}

async function pull(): Promise<Progress | null> {
  if (!client || !session) return null;
  const { data, error } = await client.from('progress').select('data').eq('user_id', session.user.id).maybeSingle();
  if (error) throw error;
  return data ? normalizeProgress(data.data as Progress) : null;
}

async function push(p: Progress) {
  if (!client || !session) return;
  const { error } = await client
    .from('progress')
    .upsert({ user_id: session.user.id, data: p, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function syncNow() {
  if (!client || !session) return;
  setStatus({ ...status, state: 'syncing' });
  try {
    const remote = await pull();
    const merged = remote ? mergeProgress(getProgress(), remote) : getProgress();
    setProgress(merged, false);
    await push(merged);
    setStatus({ state: 'synced', email: session.user.email, lastSync: Date.now() });
  } catch (e) {
    setStatus({ state: 'error', email: session.user.email, message: String((e as Error).message ?? e) });
  }
}

export function initSync() {
  if (!syncAvailable || client) return;
  client = createClient(url!, anonKey!);
  client.auth.getSession().then(({ data }) => {
    session = data.session;
    if (session) syncNow();
  });
  client.auth.onAuthStateChange((_event, s) => {
    const wasSignedIn = Boolean(session);
    session = s;
    if (s && !wasSignedIn) syncNow();
    if (!s) setStatus({ state: 'signedOut' });
  });
  onProgressChange(() => {
    if (!session) return;
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(syncNow, 2000);
  });
}

export async function signIn() {
  if (!client) return;
  await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
}

export async function signOut() {
  if (!client) return;
  await client.auth.signOut();
}
