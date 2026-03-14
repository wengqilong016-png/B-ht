import React from 'react';

interface OfflineBannerProps {
  onDismiss: () => void;
}

export default function OfflineBanner({ onDismiss }: OfflineBannerProps) {
  return (
    <div className="bg-yellow-500/20 border-b border-yellow-500/50 px-4 py-2 flex items-center justify-between gap-2">
      <p className="text-yellow-300 text-sm flex-1">
        ⚠️ 离线模式 / Hali ya nje ya mtandao — 数据将在联网后自动同步
      </p>
      <button
        onClick={onDismiss}
        className="text-yellow-300 hover:text-yellow-100 flex-shrink-0 p-1"
        style={{ minWidth: '32px', minHeight: '32px' }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
