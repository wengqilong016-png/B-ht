import { Phone, ShieldCheck, Calculator, Trash2, Percent } from 'lucide-react';
import React from 'react';

import { useAuth } from '../../contexts/AuthContext';
import { TRANSLATIONS } from '../../types';

import { DriverWithStats } from './hooks/useDriverManagement';

interface DriverGridProps {
  paginatedDrivers: DriverWithStats[];
  driversWithStats: DriverWithStats[];
  onEdit: (driver: DriverWithStats) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onShowSalary: (id: string) => void;
}

const DriverGrid: React.FC<DriverGridProps> = ({
  paginatedDrivers, driversWithStats, onEdit, onDelete, onToggleStatus, onShowSalary
}) => {
  const { lang } = useAuth();
  const t = TRANSLATIONS[lang];
  const revenueMax = Math.max(...driversWithStats.map(d => d.stats.totalRevenue), 1);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 animate-in slide-in-from-bottom-2">
      {paginatedDrivers.map(driver => {
        const revProgress = Math.min(100, (driver.stats.totalRevenue / revenueMax) * 100);
        return (
          <div key={driver.id} className="bg-white/95 rounded-card border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-btn bg-gradient-to-br from-slate-900 to-amber-700 text-white flex items-center justify-center font-black text-base shadow-md">
                  {driver.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm uppercase tracking-wide">{driver.name}</h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${driver.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className={`text-caption font-black uppercase ${driver.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {driver.status}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => onToggleStatus(driver.id)}
                className="p-1.5 bg-slate-50 rounded-xl border border-slate-100 text-slate-400 hover:text-amber-600 hover:border-amber-200 hover:bg-amber-50 transition-all"
              >
                <ShieldCheck size={14} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 px-5 pb-4">
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                <p className="text-caption font-black text-slate-400 uppercase flex items-center gap-1 mb-1">
                  <span className="text-amber-500">$</span> {t.baseSalaryShort}
                </p>
                <p className="text-xs font-black text-slate-900">TZS {(driver.baseSalary || 300000).toLocaleString()}</p>
              </div>
              <div className="bg-amber-50 rounded-2xl p-3 border border-amber-100">
                <p className="text-caption font-black text-amber-500 uppercase flex items-center gap-1 mb-1">
                  <Percent size={8} /> {t.commissionShort}
                </p>
                <p className="text-xs font-black text-amber-700">{((driver.commissionRate ?? 0.05) * 100).toFixed(0)}%</p>
              </div>
            </div>

            <div className="px-5 pb-4">
              <div className="flex justify-between items-center mb-1.5">
                <p className="text-caption font-black text-slate-400 uppercase tracking-wider">{t.totalRevenue}</p>
                <p className="text-caption font-black text-slate-900">TZS {driver.stats.totalRevenue.toLocaleString()}</p>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${revProgress}%` }} />
              </div>
            </div>

            <div className="flex items-center justify-between px-5 pb-5 pt-1 border-t border-slate-50">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Phone size={10} />
                <span className="text-caption font-bold">{driver.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => onDelete(driver.id)} className="p-1.5 bg-rose-50 border border-rose-100 text-rose-400 rounded-xl text-caption font-black uppercase hover:bg-rose-100 transition-all">
                  <Trash2 size={10} />
                </button>
                <button onClick={() => onShowSalary(driver.id)} className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-caption font-black uppercase hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 transition-all flex items-center gap-1">
                  <Calculator size={10} /> {t.payrollTitle}
                </button>
                <button onClick={() => onEdit(driver)} className="px-3 py-1.5 bg-amber-600 text-white rounded-xl text-caption font-black uppercase hover:bg-amber-700 transition-all">
                  {t.settings}
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {paginatedDrivers.length === 0 && (
        <div className="col-span-full py-12 text-center text-slate-400">
          <p className="text-xs font-black uppercase">{t.noDriversFound}</p>
        </div>
      )}
    </div>
  );
};

export default DriverGrid;
