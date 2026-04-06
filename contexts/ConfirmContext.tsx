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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => handleResult(false)}
          aria-modal="true"
          role="dialog"
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            {state.title && (
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {state.title}
              </h3>
            )}
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
              {state.message}
            </p>
            <div className="flex gap-3 justify-end mt-2">
              <button
                onClick={() => handleResult(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                {state.cancelLabel ?? '取消 / Cancel'}
              </button>
              <button
                onClick={() => handleResult(true)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors ${state.destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}
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
