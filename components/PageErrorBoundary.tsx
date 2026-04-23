import React from 'react';
import { useAriaButton } from '../src/hooks/useAriaButton'

interface PageErrorBoundaryState {
  hasError: boolean;
  error: string;
}

interface PageErrorBoundaryProps {
  children: React.ReactNode;
  /** Display name for the page — shown in the fallback UI */
  name?: string;
  onReset?: () => void;
}

/**
 * Granular ErrorBoundary for individual pages/tabs.
 * Catches render errors without crashing the entire shell.
 */
export default class PageErrorBoundary extends React.Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  constructor(props: PageErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(err: Error): PageErrorBoundaryState {
    return { hasError: true, error: err?.message || String(err) };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error(`PageErrorBoundary [${this.props.name ?? 'unknown'}] caught:`, err, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: '' });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 px-6 text-center">
          <div className="text-4xl">⚠️</div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            {this.props.name ? `${this.props.name} 页面出错了` : 'Something went wrong'}
          </p>
          <p className="text-xs text-slate-400 max-w-xs">{this.state.error}</p>
          <button
            onClick={this.handleReset}
            className="px-5 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold"
          >
            重试 / Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
