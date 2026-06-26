import { useEffect, useRef } from 'react';

type Props = {
  wsUrl: string;
  style?: React.CSSProperties;
};

export default function H264StreamView({ wsUrl, style }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const msRef = useRef<MediaSource | null>(null);

  useEffect(() => {
    if (!wsUrl || !videoRef.current) return;

    const video = videoRef.current;
    const ms = new MediaSource();
    msRef.current = ms;
    video.src = URL.createObjectURL(ms);

    let ws: WebSocket | null = null;
    let sb: SourceBuffer | null = null;
    let queue: ArrayBuffer[] = [];
    let closed = false;

    const appendNext = () => {
      if (!sb || sb.updating || queue.length === 0) return;
      sb.appendBuffer(queue.shift()!);
    };

    ms.addEventListener('sourceopen', () => {
      try {
        sb = ms.addSourceBuffer('video/mp2t; codecs="avc1.42E01E"');
      } catch {
        try {
          sb = ms.addSourceBuffer('video/mp2t');
        } catch {
          return;
        }
      }
      sb.addEventListener('updateend', appendNext);

      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        // first message must be auth token
        // wsUrl already contains the token logic, but WebSocket
        // connection uses this URL directly
      };

      ws.onmessage = (e) => {
        if (closed) return;
        queue.push(e.data as ArrayBuffer);
        appendNext();
      };

      ws.onclose = () => {
        if (!closed && ms.readyState === 'open') {
          try { ms.endOfStream(); } catch { /* ignore */ }
        }
      };
    });

    return () => {
      closed = true;
      if (ws) ws.close();
      if (ms.readyState === 'open') {
        try { ms.endOfStream(); } catch { /* ignore */ }
      }
    };
  }, [wsUrl]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        display: 'block',
        backgroundColor: '#000',
        ...(style as React.CSSProperties),
      }}
    />
  );
}
