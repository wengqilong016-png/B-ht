import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

const ICON: Record<ToastType, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

const BG: Record<ToastType, string> = {
  success: 'bg-emerald-700',
  error: 'bg-red-700',
  warning: 'bg-amber-600',
  info: 'bg-slate-700',
};

const DURATION_MS = 3500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, DURATION_MS);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast stack — bottom-right on desktop, bottom-center on mobile */}
      <div
        className="fixed bottom-6 right-4 left-4 sm:left-auto sm:w-80 z-50 flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            onClick={() => dismiss(toast.id)}
            className={`${BG[toast.type]} text-white text-sm font-medium px-4 py-3 rounded-xl shadow-xl pointer-events-auto cursor-pointer flex items-start gap-3 animate-in slide-in-from-bottom-2 fade-in`}
          >
            <span className="shrink-0 mt-px">{ICON[toast.type]}</span>
            <span className="leading-snug">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
