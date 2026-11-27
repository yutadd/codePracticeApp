// start.mjs で起動したアプリを終了する
import { execFileSync } from 'node:child_process';
import { clearPid, runningPid } from './common.mjs';

const pid = runningPid();
if (!pid) {
  console.log('起動していません。');
  process.exit(0);
}

try {
  if (process.platform === 'win32') {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    process.kill(-pid, 'SIGTERM'); // detached で起動したのでプロセスグループごと
  }
} catch {
  // すでに終了している
}
clearPid();
console.log(`終了しました（PID ${pid}）。`);
