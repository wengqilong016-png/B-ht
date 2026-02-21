
import React from 'react';
import { TrendingUp, Radio, AlertTriangle } from 'lucide-react';

interface CockpitStatsProps {
  todayRev: number;
  activeDrivers: number;
  totalDrivers: number;
  brokenSites: number;
}

const CockpitStats: React.FC<CockpitStatsProps> = ({ todayRev, activeDrivers, totalDrivers, brokenSites }) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div className="bg-slate-900 text-white p-6 rounded-[32px] shadow-xl relative overflow-hidden group">
      <TrendingUp className="absolute -right-4 -top-4 w-24 h-24 opacity-10 group-hover:scale-110 transition-transform" />
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">今日总营收 Revenue</p>
      <p className="text-3xl font-black">TZS {todayRev.toLocaleString()}</p>
    </div>
    
    <div className="bg-white border border-slate-200 p-6 rounded-[32px] shadow-sm relative">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">当前在线司机 Live</p>
          <p className="text-3xl font-black text-emerald-600">{activeDrivers} / {totalDrivers}</p>
        </div>
        <div className="p-3 bg-emerald-50 text-emerald-500 rounded-2xl animate-pulse"><Radio size={24} /></div>
      </div>
    </div>

    <div className={`p-6 rounded-[32px] border relative ${brokenSites > 0 ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-white border-slate-200 text-slate-400'}`}>
      <p className="text-[10px] font-black uppercase tracking-widest mb-1">异常机器 Sites</p>
      <p className="text-3xl font-black">{brokenSites}</p>
      <AlertTriangle className="absolute right-6 top-6 opacity-20" size={24} />
    </div>
  </div>
);

export default CockpitStats;
