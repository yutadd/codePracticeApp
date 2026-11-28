import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { progressApiPlugin } from './server/progressDb.mjs';

export default defineConfig(({ mode }) => ({
  // `vite build --mode static`：サーバー（SQLite）も Supabase 同期も使わない静的配信版
  define: { 'import.meta.env.STATIC_ONLY': JSON.stringify(mode === 'static') },
  // GitHub Pages（https://<ユーザー>.github.io/<リポジトリ>/）のようにサブパスで配信するときは BASE_PATH で指定する
  base: process.env.BASE_PATH || '/',
  build: mode === 'static' ? { outDir: 'dist-static' } : {},
  // Web MIDI は https か localhost でしか使えないので、スマホから LAN 経由で開けるよう自己署名証明書で https 配信する
  plugins: [react(), basicSsl(), progressApiPlugin()],
  server: { host: true },
  preview: { host: true },
}));
