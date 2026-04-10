import { Search, Plus } from 'lucide-react';
import React from 'react';

type QuickFilter = 'all' | 'pending' | 'urgent' | 'nearby';

interface MachineFilterBarProps {
  t: Record<string, string>;
  lang: 'zh' | 'sw';
  searchQuery: string;
  onSearchChange: (v: string) => void;
  locationFilter: QuickFilter;
  onFilterChange: (f: QuickFilter) => void;
  selectedArea: string;
  onAreaChange: (area: string) => void;
  availableAreas: string[];
  counts: {
    totalMachines: number;
    pendingStops: number;
    urgentMachines: number;
    nearbySites: number;
  };
  showRegisterButton: boolean;
  onStartRegister: () => void;
}

const MachineFilterBar: React.FC<MachineFilterBarProps> = ({
  t, lang: _lang, searchQuery, onSearchChange, locationFilter, onFilterChange,
  selectedArea, onAreaChange, availableAreas, counts,
  showRegisterButton, onStartRegister,
}) => (
  <div className="sticky top-2 z-20 space-y-2 rounded-[22px] border border-slate-200 bg-white/92 p-2.5 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur">
    {/* Search */}
    <div className="relative group">
      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={t.enterId}
        className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-10 pr-4 text-[13px] font-bold shadow-field outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 transition-all"
      />
    </div>

    {/* Quick filters + area dropdown */}
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_130px]">
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          ['all',     t.quickFilterAll,     counts.totalMachines],
          ['pending', t.quickFilterPending, counts.pendingStops],
          ['urgent',  t.quickFilterUrgent,  counts.urgentMachines],
          ['nearby',  t.quickFilterNearby,  counts.nearbySites],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilterChange(key)}
            className={`shrink-0 px-3 py-1.5 rounded-2xl text-[10px] font-black uppercase transition-all border ${
              locationFilter === key
                ? 'bg-slate-900 text-white border-slate-900 shadow-field'
                : 'bg-white text-slate-500 border-slate-200 hover:border-amber-200 hover:text-amber-600'
            }`}
          >
            {label} <span className="ml-1 opacity-60">{count}</span>
          </button>
        ))}
      </div>
      <select
        value={selectedArea}
        onChange={(e) => onAreaChange(e.target.value)}
        className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-[10px] font-black uppercase text-slate-600 outline-none shadow-field"
      >
        <option value="all">{t.allAreas}</option>
        {availableAreas.map(area => (
          <option key={area} value={area}>{area}</option>
        ))}
      </select>
    </div>

    {/* Register new machine */}
    {showRegisterButton && (
      <button
        onClick={onStartRegister}
        className="w-full py-3 bg-amber-50 border border-amber-100 text-amber-600 rounded-2xl font-black uppercase text-[11px] hover:bg-amber-100 transition-colors flex items-center justify-center gap-2"
      >
        <Plus size={15} />
        {t.registerNewMachine}
      </button>
    )}
  </div>
);

export default MachineFilterBar;
