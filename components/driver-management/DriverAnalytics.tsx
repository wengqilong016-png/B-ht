import React from 'react';
import { TrendingUp, AlertCircle, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { FleetStats, DriverWithStats } from './hooks/useDriverManagement';
import { SortField } from './DriverToolbar';

interface SortIndicatorProps {
  column: SortField;
  sortBy: SortField;
  sortDir: 'asc' | 'desc';
}

const SortIndicator: React.FC<SortIndicatorProps> = ({ column, sortBy, sortDir }) => {
  if (sortBy !== column) return <ArrowUpDown size={12} className="opacity-20 ml-1 inline" />;
  return sortDir === 'asc'
    ? <ArrowUp size={12} className="text-indigo-600 ml-1 inline" />
    : <ArrowDown size={12} className="text-indigo-600 ml-1 inline" />;
};

interface DriverAnalyticsProps {
  fleetStats: FleetStats;
  paginatedDrivers: DriverWithStats[];
  sortBy: SortField;
  sortDir: 'asc' | 'desc';
  onToggleSort: (key: SortField) => void;
  onEdit: (driver: DriverWithStats) => void;
  onDelete: (id: string) => void;
}

const DriverAnalytics: React.FC<DriverAnalyticsProps> = ({
  fleetStats, paginatedDrivers, sortBy, sortDir, onToggleSort, onEdit, onDelete
}) => (
  <div className="space-y-6 animate-in slide-in-from-right-2">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-slate-900 text-white p-6 rounded-[28px] relative overflow-hidden">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Revenue (All Time)</p>
        <p className="text-2xl font-black text-white">TZS {fleetStats.totalRev.toLocaleString()}</p>
        <div className="absolute right-4 top-4 p-3 bg-white/10 rounded-full"><TrendingUp size={20} /></div>
      </div>
      <div className="bg-white p-6 rounded-[28px] border border-slate-200 relative overflow-hidden">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">平均收款效率 (Collection)</p>
        <p className="text-2xl font-black text-indigo-600">{fleetStats.avgCollection.toFixed(1)}%</p>
        <div className="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
          <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${fleetStats.avgCollection}%` }}></div>
        </div>
      </div>
      <div className="bg-white p-6 rounded-[28px] border border-slate-200 relative overflow-hidden">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">总欠款风险 (Risk)</p>
        <p className="text-2xl font-black text-rose-600">TZS {fleetStats.totalDebt.toLocaleString()}</p>
        <div className="absolute right-4 top-4 p-3 bg-rose-50 text-rose-500 rounded-full"><AlertCircle size={20} /></div>
      </div>
    </div>

    <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th onClick={() => onToggleSort('name')} className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase cursor-pointer hover:text-indigo-600 transition-colors">
                Driver <SortIndicator column="name" sortBy={sortBy} sortDir={sortDir} />
              </th>
              <th onClick={() => onToggleSort('revenue')} className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase cursor-pointer hover:text-indigo-600 transition-colors text-right">
                Revenue <SortIndicator column="revenue" sortBy={sortBy} sortDir={sortDir} />
              </th>
              <th onClick={() => onToggleSort('status')} className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase cursor-pointer hover:text-indigo-600 transition-colors text-right">
                Efficiency
              </th>
              <th onClick={() => onToggleSort('debt')} className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase cursor-pointer hover:text-indigo-600 transition-colors text-right">
                Debt <SortIndicator column="debt" sortBy={sortBy} sortDir={sortDir} />
              </th>
              <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase text-center">Status</th>
              <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {paginatedDrivers.map(d => (
              <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-black text-slate-500">{d.name.charAt(0)}</div>
                    <div>
                      <p className="text-xs font-black text-slate-900">{d.name}</p>
                      <p className="text-[8px] text-slate-400">{d.stats.txCount} Txns</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right font-bold text-xs text-slate-700">{d.stats.totalRevenue.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs font-black ${d.stats.collectionRate > 80 ? 'text-emerald-600' : d.stats.collectionRate > 50 ? 'text-amber-500' : 'text-rose-500'}`}>
                      {d.stats.collectionRate.toFixed(1)}%
                    </span>
                    <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${d.stats.collectionRate > 80 ? 'bg-emerald-500' : d.stats.collectionRate > 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${d.stats.collectionRate}%` }}></div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right font-bold text-xs text-rose-600">{d.remainingDebt.toLocaleString()}</td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-2 py-1 rounded-full text-[8px] font-black uppercase ${d.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => onEdit(d)} className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600 hover:bg-indigo-100 transition-colors"><Pencil size={12} /></button>
                    <button onClick={() => onDelete(d.id)} className="p-1.5 bg-rose-50 rounded-lg text-rose-500 hover:bg-rose-100 transition-colors"><Trash2 size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {paginatedDrivers.length === 0 && (
          <div className="py-12 text-center text-slate-400">
            <p className="text-xs font-black uppercase">No Drivers Found</p>
          </div>
        )}
      </div>
    </div>
  </div>
);

export default DriverAnalytics;
