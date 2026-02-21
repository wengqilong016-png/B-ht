
import React from 'react';
import { Search, Store, Pencil } from 'lucide-react';
import { Location } from '../../types';

interface SiteMonitoringProps {
  locations: Location[];
  siteSearch: string;
  onSetSiteSearch: (val: string) => void;
  onEdit: (loc: Location) => void;
}

const SiteMonitoring: React.FC<SiteMonitoringProps> = ({ locations, siteSearch, onSetSiteSearch, onEdit }) => (
  <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
      <h3 className="text-lg font-black text-slate-900 uppercase">点位监控 SITES</h3>
      <div className="relative max-w-xs">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input 
          type="text" 
          placeholder="搜索点位..." 
          value={siteSearch} 
          onChange={e => onSetSiteSearch(e.target.value)} 
          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-11 pr-4 text-xs font-bold" 
        />
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <tbody className="divide-y divide-slate-50">
          {locations.filter(l => l.name.toLowerCase().includes(siteSearch.toLowerCase())).slice(0, 10).map(loc => (
            <tr key={loc.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4">
                <p className="text-xs font-black text-slate-900">{loc.name}</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase">{loc.machineId}</p>
              </td>
              <td className="px-6 py-4 text-center">
                <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${loc.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{loc.status}</span>
              </td>
              <td className="px-6 py-4 text-right font-bold text-xs">{loc.lastScore.toLocaleString()}</td>
              <td className="px-6 py-4 text-right">
                <button onClick={() => onEdit(loc)} className="p-2 text-slate-400 hover:text-indigo-600"><Pencil size={14}/></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default SiteMonitoring;
