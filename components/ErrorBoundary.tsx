import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl">
            <AlertTriangle size={40} />
          </div>
          <h1 className="text-xl font-black text-slate-900 uppercase mb-2">系统运行异常</h1>
          <p className="text-xs text-slate-500 font-bold mb-8 uppercase tracking-widest">System Runtime Error</p>
          
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm w-full max-w-md mb-8 overflow-hidden">
            <p className="text-[10px] font-mono text-rose-500 break-all text-left">
              {this.state.error?.toString()}
            </p>
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all"
          >
            <RefreshCcw size={16} /> 尝试重启应用
          </button>
        </div>
      );
    }

    return this.children;
  }
}

export default ErrorBoundary;
