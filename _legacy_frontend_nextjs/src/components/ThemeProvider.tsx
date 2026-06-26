'use client';

import { ToastProvider } from '@/contexts/ToastContext';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  );
}
