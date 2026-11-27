// アプリ（vite の開発サーバー）をバックグラウンドで起動し、ブラウザで開く
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync } from 'node:fs';
import { get } from 'node:https';
import { resolve } from 'node:path';
import { LOG_FILE, PORT, ROOT, RUN_DIR, isAlive, runningPid, writePid } from './common.mjs';

const url = `https://localhost:${PORT}/`;
const existing = runningPid();
if (existing) {
  console.log(`すでに起動しています（PID ${existing}）：${url}`);
  process.exit(0);
}

// 開発サーバーの証明書は自己署名なので検証しない
const ping = () =>
  new Promise((done) => {
    get(`${url}api/progress`, { rejectUnauthorized: false, timeout: 2000 }, (res) => {
      res.resume();
      done(res.statusCode === 200);
    })
      .on('timeout', function () {
        this.destroy();
      })
      .on('error', () => done(false));
  });
if (await ping()) {
  console.error(`ポート ${PORT} で別のサーバー（npm run dev など）が起動中です。先にそれを終了してください。`);
  process.exit(1);
}

mkdirSync(RUN_DIR, { recursive: true });
const log = openSync(LOG_FILE, 'w');
const args = ['--disable-warning=ExperimentalWarning', resolve(ROOT, 'node_modules/vite/bin/vite.js')];
args.push('--port', String(PORT), '--strictPort');
if (!process.argv.includes('--no-open')) args.push('--open');

const child = spawn(process.execPath, args, {
  cwd: ROOT,
  detached: true,
  stdio: ['ignore', log, log],
  windowsHide: true,
});
writePid(child.pid);
child.unref();

// サーバーが応答するまで待つ
const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  if (!isAlive(child.pid)) break;
  if (await ping()) {
    console.log(`起動しました（PID ${child.pid}）：${url}`);
    console.log(`同じLANのスマホからは https://<PCのIPアドレス>:${PORT}/ で開けます（初回は証明書の警告を許可）。ログ：.run/app.log`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 300));
}

console.error('起動に失敗しました。ログ（.run/app.log）：\n');
console.error(readFileSync(LOG_FILE, 'utf8'));
process.exit(1);
