import React from 'react';
import { Crown } from 'lucide-react';
import SyncStatusPill from '../SyncStatusPill';
import type { SyncStatus } from '../../hooks/useSyncStatus';

export interface SidebarNavItem {
  id: string;
  icon: React.ReactElement;
  label: string;
  badge?: number;
  stat?: { value: number; label: string };
  /** When true, hide stat if badge is visible */
  hideStatOnBadge?: boolean;
}

interface ShellSidebarProps {
  brandTitle: string;
  brandSubtitle: string;
  primaryNav: SidebarNavItem[];
  secondaryNav?: SidebarNavItem[];
  activeView: string;
  onSelectView: (id: string) => void;
  syncStatus: SyncStatus;
  lang: 'zh' | 'sw';
  bottomContent?: React.ReactNode;
}

const ShellSidebar: React.FC<ShellSidebarProps> = ({
  brandTitle,
  brandSubtitle,
  primaryNav,
  secondaryNav,
  activeView,
  onSelectView,
  syncStatus,
  lang,
  bottomContent,
}) => (
  <aside className="hidden md:flex flex-col w-sidebar bg-slate-950 border-r border-slate-800 flex-shrink-0 h-full z-40">
    {/* Brand */}
    <div className="p-4 border-b border-slate-800">
      <div className="flex items-center gap-2.5">
        <div className="bg-amber-400 text-slate-950 p-2 rounded-xl flex-shrink-0 shadow-lg shadow-amber-500/20">
          <Crown size={16} fill="currentColor" />
        </div>
        <div className="min-w-0">
          <p className="text-body-sm font-black text-white leading-tight">{brandTitle}</p>
          <p className="text-caption font-bold text-slate-500 uppercase tracking-wider leading-tight">{brandSubtitle}</p>
        </div>
      </div>
    </div>

    {/* Navigation */}
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {primaryNav.map((item) => {
        const active = activeView === item.id;
        const showStat = item.stat && !(item.hideStatOnBadge && item.badge && item.badge > 0);
        return (
          <button
            key={item.id}
            onClick={() => onSelectView(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-subcard text-left transition-colors relative group ${
              active
                ? 'bg-white text-slate-950'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            <div className="min-w-0 flex-1">
              <span className="block text-caption uppercase leading-tight truncate">{item.label}</span>
              {showStat && (
                <span className={`mt-1 block text-caption font-bold uppercase truncate ${active ? 'text-slate-500' : 'text-slate-600 group-hover:text-slate-300'}`}>
                  {item.stat!.value} {item.stat!.label}
                </span>
              )}
            </div>
            {item.badge != null && item.badge > 0 && (
              <span className={`ml-auto flex-shrink-0 w-5 h-5 rounded-full text-caption flex items-center justify-center ${active ? 'bg-slate-950 text-white' : 'bg-amber-500 text-white'}`}>
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </button>
        );
      })}

      {secondaryNav && secondaryNav.length > 0 && (
        <>
          <div className="h-px bg-slate-800 my-2" />
          {secondaryNav.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-subcard text-left transition-colors ${
                  active
                    ? 'bg-white text-slate-950'
                    : 'text-slate-500 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className="text-caption uppercase leading-tight truncate">{item.label}</span>
              </button>
            );
          })}
        </>
      )}
    </nav>

    {/* Bottom section */}
    <div className="p-3 border-t border-slate-800 space-y-2">
      <SyncStatusPill syncStatus={syncStatus} lang={lang} variant="light" fullWidth />
      {bottomContent}
    </div>
  </aside>
);

export default ShellSidebar;
