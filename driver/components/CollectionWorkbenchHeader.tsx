import { ArrowRight } from 'lucide-react';
import React from 'react';

import { Location, TRANSLATIONS } from '../../types';

interface CollectionWorkbenchHeaderProps {
  selectedLocation: Location;
  lang: 'zh' | 'sw';
  onBack: () => void;
  onSwitchMachine?: () => void;
  nextMachine?: Location | null;
  pendingCount?: number;
}

const CollectionWorkbenchHeader: React.FC<CollectionWorkbenchHeaderProps> = ({
  selectedLocation,
  lang,
  onBack,
  onSwitchMachine,
  nextMachine: _nextMachine,
  pendingCount: _pendingCount = 0,
}) => {
  const t = TRANSLATIONS[lang];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2.5 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-indigo-600 transition-colors flex-shrink-0">
          <ArrowRight size={18} className="rotate-180" />
        </button>
        <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-caption font-black uppercase tracking-[0.18em] text-slate-400">{t.currentTask}</p>
              <h2 className="truncate text-sm font-black text-slate-900 leading-tight">{selectedLocation.name}</h2>
              <p className="text-caption font-black text-indigo-500 uppercase tracking-[0.15em]">
                {selectedLocation.machineId} • {selectedLocation.area || '—'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {onSwitchMachine && (
                <button
                  type="button"
                  onClick={onSwitchMachine}
                  className="rounded-full border border-slate-200 bg-white px-2 py-1 text-caption font-black uppercase text-indigo-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50"
                >
                  {t.switchMachine}
                </button>
              )}
              <span className="rounded-full bg-slate-100 px-2 py-1 text-caption font-black uppercase text-slate-500">
                {(selectedLocation.lastScore ?? 0).toLocaleString()} {lang === 'zh' ? '上次' : 'last'}
              </span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default CollectionWorkbenchHeader;
