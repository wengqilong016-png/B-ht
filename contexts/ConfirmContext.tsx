import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (result: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue>({
  confirm: () => Promise.resolve(false),
});

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolveRef = useRef<((result: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      resolveRef.current = resolve;
      setState({ ...options, resolve });
    });
  }, []);

  const handleResult = (result: boolean) => {
    setState(null);
    resolveRef.current?.(result);
    resolveRef.current = null;
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 px-4 py-4"
          onClick={() => handleResult(false)}
          aria-modal="true"
          role="dialog"
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full flex flex-col max-h-[90vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 flex flex-col gap-4 overflow-y-auto flex-1 min-h-0">
              {state.title && (
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {state.title}
                </h3>
              )}
              <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                {state.message}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex-shrink-0 bg-slate-50/80 dark:bg-slate-900/40">
              <button
                onClick={() => handleResult(false)}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              >
                {state.cancelLabel ?? '取消 / Cancel'}
              </button>
              <button
                onClick={() => handleResult(true)}
                className={`inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-sm font-black shadow-sm transition-colors ${
                  state.destructive
                    ? 'border border-rose-700 bg-rose-600 text-white hover:bg-rose-700'
                    : 'border border-amber-600 bg-amber-500 text-white hover:bg-amber-600'
                }`}
              >
                {state.confirmLabel ?? '确认 / Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
