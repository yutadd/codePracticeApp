// スクリプト共通：起動中のサーバーの PID ファイル
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RUN_DIR = resolve(ROOT, '.run');
export const PID_FILE = resolve(RUN_DIR, 'app.pid');
export const LOG_FILE = resolve(RUN_DIR, 'app.log');
export const PORT = Number(process.env.PORT ?? 5173);

export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/** 起動中なら PID、そうでなければ null（古い PID ファイルは消す） */
export function runningPid() {
  if (!existsSync(PID_FILE)) return null;
  const pid = Number(readFileSync(PID_FILE, 'utf8').trim());
  if (pid > 0 && isAlive(pid)) return pid;
  rmSync(PID_FILE, { force: true });
  return null;
}

export function writePid(pid) {
  mkdirSync(RUN_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(pid));
}

export function clearPid() {
  rmSync(PID_FILE, { force: true });
}
