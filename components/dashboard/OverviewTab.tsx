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

  return (
    <div className="space-y-8 animate-in fade-in">
      {revDrilldown === 'none' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <button
              onClick={() => setRevDrilldown('drivers')}
              className="bg-silicone-gradient p-8 rounded-[40px] text-left shadow-silicone hover:shadow-silicone-sm active:shadow-silicone-pressed transition-all border border-white/80 group"
            >
              <p className="text-[10px] font-black uppercase text-slate-400 group-hover:text-indigo-600 transition-colors">Today's Revenue ↗</p>
              <p className="text-3xl font-black text-slate-800">TZS {bossStats.todayRev.toLocaleString()}</p>
            </button>
            <div className="bg-[#f5f7fa] p-8 rounded-[40px] shadow-silicone border border-white/80">
              <p className="text-[10px] font-black uppercase text-slate-400">Anomalies</p>
              <p className="text-3xl font-black text-rose-500">{bossStats.stagnantMachines.length}</p>
            </div>
            <div className="bg-[#f5f7fa] p-8 rounded-[40px] shadow-silicone border border-white/80">
              <p className="text-[10px] font-black uppercase text-slate-400">High-risk Debt</p>
              <p className="text-3xl font-black text-amber-500">{bossStats.riskyDrivers.length}</p>
            </div>
          </div>
          <div className="bg-[#f5f7fa] p-6 rounded-[40px] shadow-silicone border border-white/80">
            <SmartInsights transactions={transactions} locations={locations} drivers={drivers} />
          </div>
        </>
      ) : revDrilldown === 'drivers' ? (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => setRevDrilldown('none')} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50"><ArrowRight size={16} className="rotate-180" /></button>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase">Today's Revenue — By Driver</h3>
              <p className="text-[10px] text-slate-400 font-bold">Today's Revenue by Driver</p>
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
