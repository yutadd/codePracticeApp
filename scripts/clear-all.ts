// すべてのテーマ・キー・段階をクリア済みにする（vite-node で実行）
import { DB_PATH, modifyProgress } from '../server/progressDb.mjs';
import { THEMES, unitId } from '../src/music/themes';
import { CLEAR_ACCURACY, normalizeProgress, Progress } from '../src/store/progress';

const res = modifyProgress((data: Partial<Progress> | null) => {
  const p = normalizeProgress(data);
  let count = 0;
  for (const theme of THEMES) {
    for (const level of theme.levels) {
      for (const key of theme.keys) {
        const id = unitId(theme.id, key.id, level);
        const u = (p.units[id] ??= { plays: 0, bestAccuracy: 0, lastAccuracy: 0, cleared: false });
        u.cleared = true;
        u.bestAccuracy = Math.max(u.bestAccuracy, CLEAR_ACCURACY);
        count++;
      }
    }
  }
  p.updatedAt = Date.now();
  console.log(`${count} 個のユニットをクリア済みにしました。`);
  return p;
});
console.log(`保存先：${DB_PATH}（revision ${res.revision}）`);
console.log('起動中のアプリは、画面に戻ったとき（または再読み込みで）反映されます。');
