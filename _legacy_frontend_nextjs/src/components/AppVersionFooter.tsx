'use client';

import { useEffect, useState } from 'react';

type Meta = { app_name?: string; backend_version?: string };

export function AppVersionFooter({ className = '' }: { className?: string }) {
  const web = process.env.NEXT_PUBLIC_APP_VERSION ?? '—';
  const [apiVer, setApiVer] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/meta/version')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Meta | null) => {
        if (!cancelled && data?.backend_version) setApiVer(data.backend_version);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <p className={`tabular-nums ${className}`}>
      Web <span className="text-slate-400">v{web}</span>
      {apiVer != null && (
        <>
          {' · '}
          API <span className="text-slate-400">v{apiVer}</span>
        </>
      )}
    </p>
  );
}
