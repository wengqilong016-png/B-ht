import React, { useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';

export interface MobileNavItem {
  id: string;
  icon: React.ReactElement;
  label: string;
  badge?: number;
  stat?: { value: number; label: string };
  hideStatOnBadge?: boolean;
}

interface ShellMobileNavProps {
  /** Primary items shown directly in the tab bar */
  items: MobileNavItem[];
  /** Overflow items shown in the "More" popover */
  overflowItems?: MobileNavItem[];
  activeView: string;
  onSelectView: (id: string) => void;
  /** 'bottom' = fixed at bottom (driver), 'top' = inline in header (admin) */
  position: 'bottom' | 'top';
  lang: 'zh' | 'sw';
}

const ShellMobileNav: React.FC<ShellMobileNavProps> = ({
  items,
  overflowItems,
  activeView,
  onSelectView,
  position,
  lang,
}) => {
  const [showOverflow, setShowOverflow] = useState(false);
  const hasOverflow = overflowItems && overflowItems.length > 0;
  const isActiveInOverflow = hasOverflow && overflowItems.some(item => item.id === activeView);
  const gridCols = hasOverflow ? items.length + 1 : items.length;

  const wrapperClass = position === 'bottom'
    ? 'fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur supports-[padding:max(0px)]:pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden'
    : 'md:hidden border-t border-slate-200 px-2 py-2';

  return (
    <div className={wrapperClass}>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = activeView === item.id;
          const showStat = item.stat && !(item.hideStatOnBadge && item.badge && item.badge > 0);
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`flex flex-col items-center gap-1 rounded-subcard px-2 py-2 text-caption font-black uppercase whitespace-nowrap transition-all relative ${
                active ? 'bg-slate-900 text-white' : 'text-slate-400'
              }`}
            >
              {item.icon}
              <span className="truncate text-caption">{item.label}</span>
              {showStat && (
                <span className={`text-caption font-bold normal-case ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                  {item.stat!.value}
                </span>
              )}
              {item.badge != null && item.badge > 0 && (
                <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-amber-500 text-white rounded-full text-caption font-black flex items-center justify-center">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </button>
          );
        })}

        {hasOverflow && (
          <div className="relative">
            <button
              onClick={() => setShowOverflow(!showOverflow)}
              className={`flex flex-col items-center gap-1 rounded-subcard px-2 py-2 text-caption font-black uppercase whitespace-nowrap transition-all w-full ${
                isActiveInOverflow ? 'bg-slate-900 text-white' : showOverflow ? 'bg-slate-200 text-slate-700' : 'text-slate-400'
              }`}
            >
              {showOverflow ? <X size={16} /> : <MoreHorizontal size={16} />}
              <span className="truncate text-caption">{lang === 'zh' ? '更多' : 'More'}</span>
            </button>

            {showOverflow && (
              <div className={`absolute z-50 ${position === 'bottom' ? 'bottom-full mb-2' : 'top-full mt-2'} right-0 min-w-[160px] rounded-card border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10`}>
                {overflowItems.map((item) => {
                  const active = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectView(item.id);
                        setShowOverflow(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-btn text-left transition-colors ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex-shrink-0">{item.icon}</span>
                      <span className="text-caption uppercase leading-tight truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ShellMobileNav;
