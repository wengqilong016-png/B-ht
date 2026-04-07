import React from 'react';
import {
  User, Truck, Banknote, Percent, Clock,
  CheckCircle, XCircle, TrendingUp, AlertCircle
} from 'lucide-react';
import { TRANSLATIONS } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useAppData } from '../../contexts/DataContext';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface DriverStatusPanelProps {}

const DriverStatusPanel: React.FC<DriverStatusPanelProps> = () => {
  const { lang, activeDriverId } = useAuth();
  const { drivers, locations, filteredTransactions: transactions } = useAppData();
  const driver = drivers.find(d => d.id === activeDriverId);
  const t = TRANSLATIONS[lang];

  if (!driver) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <User size={40} className="mb-4 opacity-30" />
        <p className="text-xs font-black uppercase tracking-widest">
          {t.driverProfileNotFound}
        </p>
      </div>
    );
  }

  const recentTx = transactions
    .filter(tx => tx.driverId === driver.id)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  const totalRevenue = transactions
    .filter(tx => tx.driverId === driver.id)
    .reduce((sum, tx) => sum + tx.revenue, 0);

  const debtPct = driver.initialDebt > 0
    ? Math.round(((driver.initialDebt - (driver.remainingDebt ?? 0)) / driver.initialDebt) * 100)
    : 100;

  const lastActiveDisplay = driver.lastActive
    ? new Date(driver.lastActive).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    : t.neverActive;

  const isActive = driver.status === 'active';

  return (
    <div className="space-y-4 animate-in fade-in">
      {/* Profile card */}
      <div className="bg-white rounded-card border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-[18px] bg-slate-800 text-white flex items-center justify-center font-black text-2xl shadow-md flex-shrink-0">
            {driver.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-slate-900 text-base uppercase tracking-wide truncate">{driver.name}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase truncate">{driver.username}</p>
            {driver.phone && (
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">{driver.phone}</p>
            )}
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-black uppercase flex-shrink-0 ${
            isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-500 border border-rose-100'
          }`}>
            {isActive
              ? <CheckCircle size={12} />
              : <XCircle size={12} />
            }
            {isActive ? t.driverStatusActive : t.driverStatusInactive}
          </div>
        </div>
        <div className="border-t border-slate-50 px-5 py-3 flex items-center gap-2 text-slate-400">
          <Clock size={12} />
          <span className="text-caption font-bold uppercase">{t.lastActive}: {lastActiveDisplay}</span>
        </div>
      </div>

      {/* Debt & salary row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-card border border-slate-200 shadow-sm p-4">
          <p className="text-caption font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
            <Banknote size={11} /> {t.baseSalary}
          </p>
          <p className="text-base font-black text-slate-900">
            TZS {(driver.baseSalary ?? 300000).toLocaleString()}
          </p>
        </div>
        <div className="bg-indigo-50 rounded-card border border-indigo-100 shadow-sm p-4">
          <p className="text-caption font-black text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-1">
            <Percent size={11} /> {t.commissionRate}
          </p>
          <p className="text-base font-black text-indigo-700">
            {((driver.commissionRate ?? 0.05) * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Debt status */}
      {driver.initialDebt > 0 && (
        <div className="bg-white rounded-card border border-slate-200 shadow-sm p-5">
          <p className="text-caption font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <AlertCircle size={12} /> {t.debtStatus}
          </p>
          <div className="flex justify-between items-center mb-2">
            <span className="text-caption font-bold text-slate-500 uppercase">{t.remainingDebt}</span>
            <span className="text-sm font-black text-rose-600">TZS {(driver.remainingDebt ?? 0).toLocaleString()}</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all"
              style={{ width: `${debtPct}%` }}
            />
          </div>
          <div className="flex justify-between text-caption font-bold text-slate-400 uppercase">
            <span>{t.progress}: {debtPct}%</span>
            <span>{t.initialDebt}: TZS {(driver.initialDebt ?? 0).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Revenue summary */}
      <div className="bg-white rounded-card border border-slate-200 shadow-sm p-5">
        <p className="text-caption font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <TrendingUp size={12} /> {t.totalRevenue}
        </p>
        <p className="text-xl font-black text-slate-900">TZS {totalRevenue.toLocaleString()}</p>
        <p className="text-caption font-bold text-slate-400 uppercase mt-1">
          {recentTx.length} {t.recentCollections}
        </p>
      </div>

      {/* Vehicle info */}
      <div className="bg-white rounded-card border border-slate-200 shadow-sm p-5">
        <p className="text-caption font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Truck size={12} /> {t.vehicleInfo}
        </p>
        {driver.vehicleInfo?.model || driver.vehicleInfo?.plate ? (
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <Truck size={16} className="text-slate-500" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-800">{driver.vehicleInfo.model || '—'}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase">{driver.vehicleInfo.plate || '—'}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs font-bold text-slate-400">{t.noVehicleInfo}</p>
        )}
      </div>

    </div>
  );
};

export default DriverStatusPanel;
