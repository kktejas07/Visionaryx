'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

type AlertColor = 'success' | 'info' | 'warning' | 'error';

interface ToastState {
  open: boolean;
  message: string;
  severity: AlertColor;
}

interface ToastContextType {
  toast: (message: string, severity?: AlertColor) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ToastState>({
    open: false,
    message: '',
    severity: 'info',
  });

  const hide = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  useEffect(() => {
    if (state.open) {
      const t = setTimeout(hide, 4000);
      return () => clearTimeout(t);
    }
  }, [state.open, hide]);

  const show = useCallback((message: string, severity: AlertColor = 'info') => {
    setState({ open: true, message, severity });
  }, []);

  const toast = useCallback((message: string, severity: AlertColor = 'info') => show(message, severity), [show]);
  const success = useCallback((message: string) => show(message, 'success'), [show]);
  const error = useCallback((message: string) => show(message, 'error'), [show]);
  const info = useCallback((message: string) => show(message, 'info'), [show]);
  const warning = useCallback((message: string) => show(message, 'warning'), [show]);

  const getStyles = (severity: AlertColor) => {
    switch (severity) {
      case 'success': return 'bg-[#00aa54] text-white border-[#57e082]/20';
      case 'error': return 'bg-[#93000a] text-white border-[#ffb4ab]/20';
      case 'warning': return 'bg-[#915f00] text-white border-[#ffb950]/20';
      default: return 'bg-[#2065d1] text-white border-[#afc6ff]/20';
    }
  };

  const getIcon = (severity: AlertColor) => {
    switch (severity) {
      case 'success': return 'check_circle';
      case 'error': return 'error';
      case 'warning': return 'warning';
      default: return 'info';
    }
  };

  return (
    <ToastContext.Provider value={{ toast, success, error, info, warning }}>
      {children}
      
      {/* Toast Overlay */}
      <div className={`fixed top-6 right-6 z-[100] transition-all duration-300 transform ${state.open ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-12 opacity-0 scale-90 pointer-events-none'}`}>
        <div className={`flex items-center gap-4 px-6 py-4 rounded-xl shadow-2xl border ${getStyles(state.severity)} min-w-[320px] max-w-md`}>
           <span className="material-symbols-outlined text-2xl">{getIcon(state.severity)}</span>
           <p className="flex-1 font-[Inter] font-bold text-sm leading-tight">{state.message}</p>
           <button onClick={hide} className="p-1 hover:bg-black/10 rounded-full transition-colors shrink-0">
             <span className="material-symbols-outlined text-lg">close</span>
           </button>
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
      warning: () => {},
    };
  }
  return ctx;
}
