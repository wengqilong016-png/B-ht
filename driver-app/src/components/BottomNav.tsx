import React from 'react';
import { Package, ClipboardList, User } from 'lucide-react';

type Page = 'collect' | 'history' | 'profile';

interface BottomNavProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const tabs: { page: Page; Icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { page: 'collect', Icon: Package, label: '收款/Collect' },
  { page: 'history', Icon: ClipboardList, label: '记录/History' },
  { page: 'profile', Icon: User, label: '我的/Me' },
];

export default function BottomNav({ currentPage, onNavigate }: BottomNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <nav className="bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 flex items-stretch">
        {tabs.map(({ page, Icon, label }) => {
          const isActive = currentPage === page;
          return (
            <button
              key={page}
              onClick={() => onNavigate(page)}
              className={`flex-1 relative flex flex-col items-center justify-center gap-1 py-3 transition-all ${
                isActive ? 'text-amber-400' : 'text-slate-500'
              }`}
              style={{ minHeight: '60px' }}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-amber-400 rounded-full" />
              )}
              <Icon className="w-5 h-5" />
              <span className="text-[9px] font-black uppercase tracking-wide">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
