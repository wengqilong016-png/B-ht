import React, { useMemo, useState } from 'react';
import { Search, User, Store, ChevronRight } from 'lucide-react';
import type { Driver, Location } from '../../types';

interface DriverLookupProps {
  drivers: Driver[];
  locations: Location[];
  onSelectDriver: (driverId: string) => void;
}

const DriverLookup: React.FC<DriverLookupProps> = ({ drivers, locations, onSelectDriver }) => {
  const [search, setSearch] = useState('');

  const machineCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const loc of locations) {
      if (loc.assignedDriverId) {
        map.set(loc.assignedDriverId, (map.get(loc.assignedDriverId) || 0) + 1);
      }
    }
    return map;
  }, [locations]);

  const filtered = useMemo(() => {
    if (!search.trim()) return drivers;
    const q = search.toLowerCase();
    return drivers.filter(
      d => d.name.toLowerCase().includes(q) || d.phone.includes(q),
    );
  }, [drivers, search]);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div>
        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">司机查询 Driver Lookup</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
          Select a driver to view assigned machines
        </p>
      </div>

      <div className="relative w-full max-w-md">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search drivers by name or phone"
          className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-11 pr-4 text-xs font-bold"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(driver => {
          const count = machineCountMap.get(driver.id) || 0;
          return (
            <button
              key={driver.id}
              onClick={() => onSelectDriver(driver.id)}
              className="bg-white rounded-[24px] border border-slate-200 shadow-sm p-5 text-left hover:shadow-md hover:border-indigo-200 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-sm flex-shrink-0">
                  <User size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-900 uppercase truncate">{driver.name}</p>
                  <p className="text-[9px] font-bold text-slate-400">{driver.phone}</p>
                </div>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 flex-shrink-0 transition-colors" />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-50 rounded-xl px-3 py-1.5">
                  <Store size={12} className="text-slate-400" />
                  <span className="text-[10px] font-black text-slate-700">{count}</span>
                  <span className="text-[9px] font-bold text-slate-400">machines</span>
                </div>
                <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                  driver.status === 'active'
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-slate-100 text-slate-400'
                }`}>
                  {driver.status}
                </div>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400">
            <p className="text-xs font-black uppercase">No Drivers Found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverLookup;
