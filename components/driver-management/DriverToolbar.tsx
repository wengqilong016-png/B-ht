import React from 'react';
import { LayoutGrid, BarChart3, Plus, Search, SlidersHorizontal, ArrowUp, ArrowDown } from 'lucide-react';

export type SortField = 'name' | 'revenue' | 'debt' | 'status';

interface DriverToolbarProps {
  viewMode: 'grid' | 'analytics';
  setViewMode: (mode: 'grid' | 'analytics') => void;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  sortBy: SortField;
  setSortBy: (v: SortField) => void;
  sortDir: 'asc' | 'desc';
  setSortDir: (v: 'asc' | 'desc') => void;
  onAddNew: () => void;
}

const DriverToolbar: React.FC<DriverToolbarProps> = ({
  viewMode, setViewMode, searchTerm, setSearchTerm, sortBy, setSortBy, sortDir, setSortDir, onAddNew
}) => (
  <div className="space-y-4">
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Fleet Management</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Manage Drivers, Salaries, and Performance</p>
      </div>

      <div className="flex gap-2 flex-shrink-0">
        <div className="flex bg-slate-100 p-1 rounded-2xl">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all flex items-center gap-1.5 whitespace-nowrap ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
          >
            <LayoutGrid size={12} /> Cards
          </button>
          <button
            onClick={() => setViewMode('analytics')}
            className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all flex items-center gap-1.5 whitespace-nowrap ${viewMode === 'analytics' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
          >
            <BarChart3 size={12} /> Analytics
          </button>
        </div>
        <button
          onClick={onAddNew}
          className="px-4 py-2 bg-indigo-600 text-white rounded-2xl text-[9px] font-black uppercase flex items-center gap-2 shadow-lg active:scale-95 transition-all whitespace-nowrap hover:bg-indigo-700"
        >
          <Plus size={13} /> Add New Driver
        </button>
      </div>
    </div>

    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search Name / Phone..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-[20px] py-3 pl-11 pr-4 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 transition-all shadow-sm"
        />
      </div>
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-[20px] px-4 py-2 shadow-sm min-w-[200px]">
        <SlidersHorizontal size={14} className="text-slate-400" />
        <span className="text-[10px] font-bold text-slate-400 uppercase mr-2">Sort By:</span>
        <select
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value as SortField); setSortDir('desc'); }}
          className="bg-transparent text-xs font-black text-slate-900 outline-none flex-1 uppercase"
        >
          <option value="revenue">总营收 Revenue</option>
          <option value="debt">欠款 Debt</option>
          <option value="name">姓名 Name</option>
          <option value="status">状态 Status</option>
        </select>
        <button
          onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
          className="p-1 rounded hover:bg-slate-100 text-indigo-600"
        >
          {sortDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        </button>
      </div>
    </div>
  </div>
);

export default DriverToolbar;
