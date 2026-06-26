/**
 * Tiny HLS player wrapper for web — uses native `<video>` HLS support
 * (Safari) when available, falls back to `hls.js` otherwise.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

interface Props {
  src: string;
  style?: any;
}

export function HlsPlayer({ src, style }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !videoRef.current || !src) return;
    const video = videoRef.current;
    // Native HLS support (Safari, iOS web).
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.play().catch(() => {/* user gesture may be required */});
      return;
    }
    let hls: any = null;
    let cancelled = false;
    (async () => {
      const mod = await import('hls.js');
      if (cancelled) return;
      const Hls = mod.default;
      if (Hls.isSupported()) {
        hls = new Hls({ lowLatencyMode: true, maxBufferLength: 6 });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {/* user gesture */});
        });
      } else {
        // Last-ditch: set the src and hope the browser handles it.
        video.src = src;
      }
    })();
    return () => {
      cancelled = true;
      if (hls) { try { hls.destroy(); } catch { /* ignore */ } }
    };
  }, [src]);

  if (Platform.OS !== 'web') return null;
  return (
    // @ts-expect-error — DOM element on web
    <video ref={videoRef} autoPlay muted playsInline controls={false}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#000', ...(style || {}) }}
    />
  );
}
