import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

// BeforeInstallPromptEvent is not yet in TypeScript's lib — define a minimal shape
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Module-level storage: the install prompt survives component re-renders
let deferredPrompt: BeforeInstallPromptEvent | null = null;

interface PwaInstallPromptProps {
  /** Visual variant – admin uses 'light', driver uses 'dark' */
  variant?: 'light' | 'dark';
  lang?: 'zh' | 'sw';
}

const LABELS: Record<'zh' | 'sw', string> = {
  zh: '安装 App',
  sw: 'Sakinisha',
};

/**
 * Shows a "Install App" button when the browser fires `beforeinstallprompt`.
 * Hidden automatically if the app is already running in standalone (PWA) mode.
 */
const PwaInstallPrompt: React.FC<PwaInstallPromptProps> = ({
  variant = 'light',
  lang = 'zh',
}) => {
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    // Already installed — nothing to show
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () =>
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
  }, []);

  if (!isInstallable) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    deferredPrompt = null;
  };

  if (variant === 'dark') {
    return (
      <button
        onClick={handleInstall}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-white/20 rounded-btn text-white text-[9px] font-black uppercase hover:bg-white/20 transition-colors"
      >
        <Download size={11} />
        {LABELS[lang]}
      </button>
    );
  }

  return (
    <button
      onClick={handleInstall}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-btn text-indigo-600 text-[9px] font-black uppercase hover:bg-indigo-100 transition-colors shadow-silicone-sm"
    >
      <Download size={11} />
      {LABELS[lang]}
    </button>
  );
};

export default PwaInstallPrompt;
