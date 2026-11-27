// 進捗（解放状況・コードごとの統計・ハイスコア）を消す。設定と遅延補正値は残す
import { DB_PATH, modifyProgress } from '../server/progressDb.mjs';

modifyProgress((data) => ({
  ...(data ?? {}),
  units: {},
  chordStats: {},
  highScores: {},
  updatedAt: Date.now(),
}));
console.log(`進捗をリセットしました：${DB_PATH}`);
console.log('起動中のアプリは、画面に戻ったとき（または再読み込みで）反映されます。');
