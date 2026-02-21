
import React, { useState } from 'react';
import { Search, Store, Pencil, MapPin, Eye, ImageIcon, User, Trash2 } from 'lucide-react';
import { Location } from '../../types';

interface SiteMonitoringProps {
  locations: Location[];
  siteSearch: string;
  onSetSiteSearch: (val: string) => void;
  onEdit: (loc: Location) => void;
  onDelete?: (id: string) => void;
}

const SiteMonitoring: React.FC<SiteMonitoringProps> = ({ locations, siteSearch, onSetSiteSearch, onEdit, onDelete }) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'maintenance' | 'broken'>('all');

  const filtered = locations.filter(l => {
    const matchSearch = l.name.toLowerCase().includes(siteSearch.toLowerCase()) || 
                        l.machineId.toLowerCase().includes(siteSearch.toLowerCase());
    const matchFilter = filter === 'all' || l.status === filter;
    return matchSearch && matchFilter;
  }).sort((a, b) => (b.isSynced ? 0 : 1) - (a.isSynced ? 0 : 1)); // Show unsynced first

  return (
    <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-100 rounded-xl text-slate-600"><Store size={20} /></div>
            <div>
               <h3 className="text-lg font-black text-slate-900 uppercase leading-none">点位库 SITES</h3>
               <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">Total: {locations.length}</p>
            </div>
          </div>
          <div className="relative flex-1 max-w-xs w-full">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="搜索编号/点位..." 
              value={siteSearch} 
              onChange={e => onSetSiteSearch(e.target.value)} 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-11 pr-4 text-xs font-bold" 
            />
          </div>
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-1">
           {['all', 'active', 'maintenance', 'broken'].map((f: any) => (
             <button key={f} onClick={() => setFilter(f)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${filter === f ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>{f}</button>
           ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase">
             <tr>
                <th className="px-6 py-4">Machine / Site</th>
                <th className="px-6 py-4 text-center">Identity</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Last Score</th>
                <th className="px-6 py-4 text-right">Actions</th>
             </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(loc => (
              <tr key={loc.id} className="hover:bg-slate-50/80 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                        {loc.machinePhotoUrl ? <img src={loc.machinePhotoUrl} className="w-full h-full object-cover rounded-xl" /> : <Store size={18}/>}
                     </div>
                     <div>
                        <p className="text-xs font-black text-slate-900">{loc.name}</p>
                        <p className="text-[9px] font-bold text-indigo-600 uppercase">{loc.machineId} • {loc.area}</p>
                     </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                   <div className="flex justify-center gap-1.5">
                      <div className={`p-1.5 rounded-lg ${loc.machinePhotoUrl ? 'text-emerald-500 bg-emerald-50' : 'text-slate-200 bg-slate-50'}`}><ImageIcon size={14}/></div>
                      <div className={`p-1.5 rounded-lg ${loc.ownerPhotoUrl ? 'text-indigo-500 bg-indigo-50' : 'text-slate-200 bg-slate-50'}`}><User size={14}/></div>
                      <div className={`p-1.5 rounded-lg ${loc.coords ? 'text-amber-500 bg-amber-50' : 'text-slate-200 bg-slate-50'}`}><MapPin size={14}/></div>
                   </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${loc.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{loc.status}</span>
                </td>
                <td className="px-6 py-4 text-right">
                   <p className="text-xs font-black text-slate-900">{loc.lastScore.toLocaleString()}</p>
                   {loc.isSynced === false && <span className="text-[7px] font-black text-rose-500 uppercase">Unsynced</span>}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1">
                     <button onClick={() => onEdit(loc)} className="p-2.5 bg-slate-50 text-slate-400 rounded-xl group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-all"><Pencil size={14}/></button>
                     {onDelete && <button onClick={() => onDelete(loc.id)} className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:text-rose-600 hover:bg-rose-50 transition-all"><Trash2 size={14}/></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-20 text-center space-y-3">
             <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-200"><Store size={32}/></div>
             <p className="text-xs font-black text-slate-400 uppercase">未找到匹配机器 No Records</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SiteMonitoring;
