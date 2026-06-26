'use client';

import { useEffect } from 'react';

const RELOAD_KEY = '__visioryx_chunk_reload';

function tryReloadOnce(): void {
  if (sessionStorage.getItem(RELOAD_KEY)) return;
  sessionStorage.setItem(RELOAD_KEY, '1');
  window.location.reload();
}

function isStaleWebpackModuleError(message: string): boolean {
  return (
    message.includes('__webpack_modules__') &&
    message.includes('is not a function')
  );
}

/**
 * Recovers from stale Webpack chunks after dev server restarts or hot reload glitches.
 * Next.js throws ChunkLoadError when the browser requests an old hashed chunk that no longer exists.
 * Also handles broken webpack runtime after HMR (TypeError: __webpack_modules__[moduleId] is not a function).
 */
export function ChunkLoadRecovery() {
  useEffect(() => {
    const isChunkFailure = (reason: unknown): boolean => {
      if (!reason || typeof reason !== 'object') return false;
      const r = reason as { name?: string; message?: string };
      if (r.name === 'ChunkLoadError') return true;
      const msg = String(r.message ?? '');
      if (msg.includes('Loading chunk') || msg.includes('ChunkLoadError')) return true;
      if (r.name === 'TypeError' && isStaleWebpackModuleError(msg)) return true;
      return false;
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isChunkFailure(event.reason)) return;
      tryReloadOnce();
    };

    const onError = (event: ErrorEvent) => {
      const msg = String(event.message ?? '');
      if (event.error?.name === 'TypeError' && isStaleWebpackModuleError(msg)) {
        tryReloadOnce();
      }
    };

    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => sessionStorage.removeItem(RELOAD_KEY), 8000);
    return () => window.clearTimeout(t);
  }, []);

  return null;
}
