import React from 'react';

type Page = 'collect' | 'history' | 'profile';

interface BottomNavProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const tabs: { page: Page; icon: string; zh: string; sw: string }[] = [
  { page: 'collect', icon: '📦', zh: '收款', sw: 'Kukusanya' },
  { page: 'history', icon: '📋', zh: '历史', sw: 'Historia' },
  { page: 'profile', icon: '👤', zh: '我的', sw: 'Mimi' },
];

export default function BottomNav({ currentPage, onNavigate }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 flex z-50">
      {tabs.map((tab) => {
        const isActive = currentPage === tab.page;
        return (
          <button
            key={tab.page}
            onClick={() => onNavigate(tab.page)}
            className={`flex-1 flex flex-col items-center justify-center py-2 transition-colors ${
              isActive ? 'text-amber-500' : 'text-slate-400'
            }`}
            style={{ minHeight: '56px', minWidth: '44px' }}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className="text-xs mt-1 font-medium">
              {tab.zh}/{tab.sw}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
