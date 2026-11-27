import { useSyncExternalStore } from 'react';

// Safari（iPad）は webkit 接頭辞つきの API しか持っていない
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const doc = document as FsDocument;

// iPhone の Safari は要素の全画面表示に非対応（ホーム画面に追加して起動すると全画面になる）
export const fullscreenSupported = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);

function isFullscreen() {
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}

function subscribe(cb: () => void) {
  doc.addEventListener('fullscreenchange', cb);
  doc.addEventListener('webkitfullscreenchange', cb);
  return () => {
    doc.removeEventListener('fullscreenchange', cb);
    doc.removeEventListener('webkitfullscreenchange', cb);
  };
}

export function useFullscreen() {
  return useSyncExternalStore(subscribe, isFullscreen);
}

export async function toggleFullscreen() {
  try {
    if (isFullscreen()) {
      await (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.());
    } else {
      const el = document.documentElement as FsElement;
      await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.());
    }
  } catch {
    // ユーザー操作外の呼び出しなどで拒否された場合は何もしない
  }
}
