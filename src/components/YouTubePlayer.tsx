// YouTube の埋め込み（IFrame Player API）。アプリ側から再生・一時停止・シーク・音量を操作する
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<any> | null = null;

function loadApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => {
        apiPromise = null;
        reject(new Error('YouTube を読み込めませんでした'));
      };
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

export interface YouTubeHandle {
  togglePlay: () => void;
  seekBy: (sec: number) => void;
  restart: () => void;
}

interface Props {
  videoId: string;
  start: number;
  /** 0〜100 */
  volume: number;
  onPlayingChange?: (playing: boolean) => void;
}

const ERRORS: Record<number, string> = {
  2: '動画IDが正しくありません。',
  5: 'この動画は埋め込みで再生できません。',
  100: '動画が見つかりません（削除・非公開の可能性）。',
  101: 'この動画は埋め込みが許可されていません。',
  150: 'この動画は埋め込みが許可されていません。',
};

export const YouTubePlayer = forwardRef<YouTubeHandle, Props>(function YouTubePlayer({ videoId, start, volume, onPlayingChange }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const onPlayingRef = useRef(onPlayingChange);
  onPlayingRef.current = onPlayingChange;
  useEffect(() => onPlayingRef.current?.(playing), [playing]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPlaying(false);
    const el = document.createElement('div');
    host.current!.appendChild(el);
    loadApi()
      .then((YT) => {
        if (cancelled) return;
        player.current = new YT.Player(el, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: { start, playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: (e: any) => e.target.setVolume(volumeRef.current),
            onStateChange: (e: any) => setPlaying(e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING),
            onError: (e: any) => setError(ERRORS[e.data] ?? `再生できませんでした（エラー ${e.data}）。`),
          },
        });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      try {
        player.current?.destroy();
      } catch {
        // 破棄に失敗しても画面は閉じる
      }
      player.current = null;
      if (host.current) host.current.innerHTML = '';
    };
  }, [videoId, start]);

  useEffect(() => {
    player.current?.setVolume?.(volume);
  }, [volume]);

  useImperativeHandle(ref, () => ({
    togglePlay: () => {
      const p = player.current;
      if (!p?.getPlayerState) return;
      if (playing) p.pauseVideo();
      else p.playVideo();
    },
    seekBy: (sec) => {
      const p = player.current;
      if (!p?.getCurrentTime) return;
      p.seekTo(Math.max(0, p.getCurrentTime() + sec), true);
    },
    restart: () => {
      const p = player.current;
      if (!p?.seekTo) return;
      p.seekTo(start, true);
      p.playVideo();
    },
  }));

  return (
    <div className="yt-wrap">
      <div className="yt-frame" ref={host} />
      {error && (
        <div className="yt-error">
          <p>{error}</p>
          <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">
            YouTube で開く
          </a>
          <p className="small muted">別のタブ（または別の端末）で流しながら、ここでコードを鳴らせます。</p>
        </div>
      )}
    </div>
  );
});
