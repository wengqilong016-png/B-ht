import React from 'react';
import { Search, Plus } from 'lucide-react';

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
  t, lang, searchQuery, onSearchChange, locationFilter, onFilterChange,
  selectedArea, onAreaChange, availableAreas, counts,
  showRegisterButton, onStartRegister,
}) => (
  <div className="space-y-3">
    {/* Search */}
    <div className="relative group">
      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={t.enterId}
        className="w-full bg-white border border-slate-200 rounded-card py-4 pl-12 pr-5 text-sm font-bold shadow-field outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
      />
    </div>

    {/* Quick filters + area dropdown */}
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_130px] gap-3">
      <div className="flex flex-wrap gap-2">
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
            className={`px-3 py-1.5 rounded-btn text-[10px] font-black uppercase transition-all border ${
              locationFilter === key
                ? 'bg-slate-900 text-white border-slate-900 shadow-field'
                : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:text-indigo-600'
            }`}
          >
            {label} <span className="ml-1 opacity-60">{count}</span>
          </button>
        ))}
      </div>
      <select
        value={selectedArea}
        onChange={(e) => onAreaChange(e.target.value)}
        className="w-full bg-white border border-slate-200 rounded-btn px-4 py-2.5 text-[10px] font-black uppercase text-slate-600 outline-none shadow-field"
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
        className="w-full py-3.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-btn font-black uppercase text-xs hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2"
      >
        <Plus size={15} />
        {t.registerNewMachine}
      </button>
    )}
  </div>
);

export default MachineFilterBar;
