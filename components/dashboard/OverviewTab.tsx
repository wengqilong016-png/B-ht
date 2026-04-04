import React from 'react';
import { ArrowRight, Store } from 'lucide-react';
import { Transaction, Driver, Location, TRANSLATIONS } from '../../types';
import { getOptimizedImageUrl } from '../../utils/imageUtils';
import SmartInsights from '../SmartInsights';

interface BossStats {
  todayRev: number;
  riskyDrivers: Driver[];
  stagnantMachines: Location[];
}

interface TodayDriverStat {
  driver: Driver;
  driverTxs: Transaction[];
  driverRev: number;
  driverCommission: number;
  driverNet: number;
}

interface OverviewTabProps {
  bossStats: BossStats;
  todayDriverStats: TodayDriverStat[];
  locationMap: Map<string, Location>;
  transactions: Transaction[];
  locations: Location[];
  drivers: Driver[];
  lang: 'zh' | 'sw';
}

const OverviewTab: React.FC<OverviewTabProps> = ({
  bossStats,
  todayDriverStats,
  locationMap,
  transactions,
  locations,
  drivers,
  lang,
}) => {
  const [revDrilldown, setRevDrilldown] = React.useState<'none' | 'drivers' | string>('none');
  const t = TRANSLATIONS[lang];

  return (
    <div className="space-y-5 animate-in fade-in">
      {revDrilldown === 'none' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => setRevDrilldown('drivers')}
              className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition-all hover:border-indigo-200 hover:bg-indigo-50/40 group"
            >
              <p className="text-[9px] font-black uppercase text-slate-400 group-hover:text-indigo-600 transition-colors">{t.revenue} ↗</p>
              <p className="mt-1 text-2xl font-black text-slate-900">TZS {bossStats.todayRev.toLocaleString()}</p>
            </button>
            <div className="rounded-[28px] border border-rose-100 bg-rose-50 px-5 py-4">
              <p className="text-[9px] font-black uppercase text-rose-400">{t.attentionSites}</p>
              <p className="mt-1 text-2xl font-black text-rose-700">{bossStats.stagnantMachines.length}</p>
            </div>
            <div className="rounded-[28px] border border-amber-100 bg-amber-50 px-5 py-4">
              <p className="text-[9px] font-black uppercase text-amber-500">{t.highRiskAssets}</p>
              <p className="mt-1 text-2xl font-black text-amber-700">{bossStats.riskyDrivers.length}</p>
            </div>
          </div>
          <div className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm">
            <SmartInsights transactions={transactions} locations={locations} drivers={drivers} lang={lang} />
          </div>
        </>
      ) : revDrilldown === 'drivers' ? (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => setRevDrilldown('none')} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50"><ArrowRight size={16} className="rotate-180" /></button>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase">{t.revenue} — {lang === 'zh' ? '按司机查看' : 'By Driver'}</h3>
              <p className="text-[10px] text-slate-400 font-bold">{lang === 'zh' ? '按司机查看今日营收明细' : "Today's revenue by driver"}</p>
            </div>
          </div>
          {todayDriverStats.map(({ driver, driverTxs, driverRev, driverCommission, driverNet }) => (
            <div key={driver.id} className="bg-white border border-slate-200 rounded-[28px] p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm">{driver.name.charAt(0)}</div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{driver.name}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">{driver.phone} • {driverTxs.length} collections</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-indigo-600">TZS {driverRev.toLocaleString()}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">Total Revenue</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                  <p className="text-[7px] font-black text-slate-400 uppercase">Revenue</p>
                  <p className="text-[10px] font-black text-slate-800">TZS {driverRev.toLocaleString()}</p>
                </div>
                <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-100 text-center">
                  <p className="text-[7px] font-black text-amber-400 uppercase">Owner Div.</p>
                  <p className="text-[10px] font-black text-amber-700">TZS {driverCommission.toLocaleString()}</p>
                </div>
                <div className="bg-indigo-50 p-2.5 rounded-xl border border-indigo-100 text-center">
                  <p className="text-[7px] font-black text-indigo-400 uppercase">Net Cash</p>
                  <p className="text-[10px] font-black text-indigo-700">TZS {driverNet.toLocaleString()}</p>
                </div>
              </div>
              {driverTxs.length > 0 && (
                <div className="space-y-2 border-t border-slate-50 pt-3">
                  {driverTxs.map(tx => {
                    const loc = locationMap.get(tx.locationId);
                    return (
                      <div key={tx.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-2">
                          {loc?.machinePhotoUrl ? (
                            <img src={getOptimizedImageUrl(loc.machinePhotoUrl, 100, 100)} alt="machine" className="w-7 h-7 rounded-lg object-cover border border-slate-200" />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400"><Store size={12} /></div>
                          )}
                          <div>
                            <p className="text-[10px] font-black text-slate-900">{tx.locationName}</p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase">{loc?.machineId || '-'} • {new Date(tx.timestamp).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-900">TZS {tx.revenue.toLocaleString()}</p>
                          <div className="flex gap-1 justify-end mt-0.5">
                            <span className="text-[7px] font-bold text-amber-500 bg-amber-50 px-1 py-0.5 rounded">div {tx.ownerRetention.toLocaleString()}</span>
                            <span className="text-[7px] font-bold text-indigo-500 bg-indigo-50 px-1 py-0.5 rounded">net {tx.netPayable.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default OverviewTab;
