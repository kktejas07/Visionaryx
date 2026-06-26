import { useEffect, useRef } from 'react';

type Props = {
  uri: string;
  style?: React.CSSProperties;
};

export default function MjpegStreamView({ uri, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!uri) return;

    const abort = new AbortController();
    abortRef.current = abort;

    let cancelled = false;
    let buffer = new Uint8Array(0);

    (async () => {
      try {
        const resp = await fetch(uri, { signal: abort.signal });
        if (!resp.ok || !resp.body) return;

        const reader = resp.body.getReader();
        const boundary = new Uint8Array([0x0d, 0x0a, 0x2d, 0x2d, 0x66, 0x72, 0x61, 0x6d, 0x65, 0x0d, 0x0a]);
        const jpegStart = new Uint8Array([0xff, 0xd8]);
        const jpegEnd = new Uint8Array([0xff, 0xd9]);

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;

          const tmp = new Uint8Array(buffer.length + value.length);
          tmp.set(buffer);
          tmp.set(value, buffer.length);
          buffer = tmp;

          while (true) {
            const s = findSequence(buffer, jpegStart);
            if (s === -1) break;
            const e = findSequence(buffer, jpegEnd, s + 2);
            if (e === -1) break;

            const frame = buffer.slice(s, e + 2);
            buffer = buffer.slice(e + 2);

            try {
              const blob = new Blob([frame], { type: 'image/jpeg' });
              const bitmap = await createImageBitmap(blob);
              const canvas = canvasRef.current;
              if (canvas && !cancelled) {
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                }
              }
              bitmap.close();
            } catch {
              // skip bad frame
            }
          }
        }
      } catch {
        // stream ended or aborted
      }
    })();

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [uri]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        display: 'block',
        ...(style as React.CSSProperties),
      }}
    />
  );
}

function findSequence(data: Uint8Array, seq: Uint8Array, start = 0): number {
  outer: for (let i = start; i <= data.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (data[i + j] !== seq[j]) continue outer;
    }
    return i;
  }
  return -1;
}
