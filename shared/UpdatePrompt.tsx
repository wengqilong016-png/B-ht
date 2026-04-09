import { RefreshCw, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { TRANSLATIONS } from '../types';

interface UpdatePromptProps {
  lang: 'zh' | 'sw';
}

/**
 * Shows a non-blocking banner when a new service-worker version is waiting to
 * activate.  Clicking the refresh button sends SKIP_WAITING to the SW and then
 * reloads the page to apply the update.
 */
const UpdatePrompt: React.FC<UpdatePromptProps> = ({ lang }) => {
  const [visible, setVisible] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const reg = (event as CustomEvent<{ registration: ServiceWorkerRegistration }>).detail?.registration ?? null;
      setRegistration(reg);
      setVisible(true);
    };
    window.addEventListener('sw-update-ready', handler);
    return () => window.removeEventListener('sw-update-ready', handler);
  }, []);

  if (!visible) return null;

  const t = TRANSLATIONS[lang];

  const handleRefresh = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  const handleDismiss = () => setVisible(false);

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-[200] flex items-center justify-between gap-3 px-4 py-3 bg-indigo-600 text-white shadow-lg animate-in slide-in-from-top-2"
      style={{ paddingTop: 'max(0.75rem, calc(0.75rem + env(safe-area-inset-top)))' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <RefreshCw size={15} className="flex-shrink-0" />
        <p className="text-[11px] font-black uppercase tracking-wide truncate">
          {lang === 'zh' ? '检测到新版本，点击刷新以更新' : 'New version available — tap to refresh'}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleRefresh}
          className="rounded-xl bg-white text-indigo-600 px-3 py-1.5 text-[10px] font-black uppercase hover:bg-indigo-50 transition-colors"
        >
          {lang === 'zh' ? '立即刷新' : 'Refresh'}
        </button>
        <button
          onClick={handleDismiss}
          aria-label={t.close}
          className="p-1 rounded-lg hover:bg-white/20 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default UpdatePrompt;
