import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initServerStore } from './store/server';
import { initSync } from './store/sync';
import './styles.css';

// 静的配信版（npm run build:static）はサーバーも同期も使わず、localStorage だけに保存する
if (!import.meta.env.STATIC_ONLY) {
  initServerStore();
  initSync();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
