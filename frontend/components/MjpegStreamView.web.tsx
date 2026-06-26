import { useState, useEffect, useRef } from 'react';

type Props = {
  uri: string;
  style?: React.CSSProperties;
};

export default function MjpegStreamView({ uri, style }: Props) {
  const [frameUrl, setFrameUrl] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!uri) return;

    const poll = () => {
      setFrameUrl(`${uri}&_t=${Date.now()}`);
    };

    poll();
    intervalRef.current = setInterval(poll, 200);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [uri]);

  return (
    <img
      src={frameUrl}
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
