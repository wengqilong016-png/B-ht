import React, { useMemo, useState } from 'react';
import { BrainCircuit, TrendingDown, TrendingUp, AlertTriangle, Zap, CalendarClock, DollarSign, Activity } from 'lucide-react';
import { Transaction, Location, Driver, TRANSLATIONS } from '../types';

interface SmartInsightsProps {
  transactions: Transaction[];
  locations: Location[];
  drivers: Driver[];
  lang: 'zh' | 'sw';
  onNavigate?: (tab: 'settlement' | 'locations' | 'team' | 'tracking') => void;
}

const SmartInsights: React.FC<SmartInsightsProps> = ({ transactions, locations, lang, onNavigate }) => {
  const t = TRANSLATIONS[lang];
  const [showAll, setShowAll] = useState(false);
  // 核心 AI 算法：计算每台机器的“健康度”和“异动指标”
  const insights = useMemo(() => {
    const now = new Date();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const nowTime = now.getTime();

    // Pre-compute cutoff and pre-convert timestamps once (O(n)) rather than
    // inside locations.map() (which would be O(n×m)).
    const cutoff = nowTime - SEVEN_DAYS;
    const pastWeekTxs = transactions.filter(t => new Date(t.timestamp).getTime() > cutoff);

    // Group past-week transactions by locationId (O(n)) so each location can
    // look up its own slice in O(1) instead of filtering the full list (O(n×m)).
    // Sort each group by timestamp ascending once here so the per-location
    // analysis logic doesn't have to re-sort on every iteration.
    const txsByLocation = new Map<string, typeof pastWeekTxs>();
    for (const t of pastWeekTxs) {
      const arr = txsByLocation.get(t.locationId);
      if (arr) arr.push(t);
      else txsByLocation.set(t.locationId, [t]);
    }
    for (const arr of txsByLocation.values()) {
      arr.sort((a, b) => a.timestamp < b.timestamp ? -1 : 1);
    }

    // 聚合每台机器的 7 天数据
    const locStats = locations.map(loc => {
      const locTxs = txsByLocation.get(loc.id) ?? [];
      
      let totalRevenue = 0;
      let trend: 'up' | 'down' | 'stable' = 'stable';
      let warningMsg = '';
      let actionSuggestion = '';
      let riskLevel: 'high' | 'medium' | 'low' = 'low';

      if (locTxs.length >= 2) {
        // 计算近期趋势
        totalRevenue = locTxs.reduce((sum, t) => sum + t.revenue, 0);
        const avgDaily = totalRevenue / 7;
        const latestTx = locTxs[locTxs.length - 1];
        const previousTx = locTxs[locTxs.length - 2];

        // 异动检测算法：如果单日营收低于 7天平均值的 50%，触发严重警告
        if (latestTx.revenue < avgDaily * 0.5 && latestTx.revenue > 0) {
           trend = 'down';
           riskLevel = 'high';
           warningMsg = `营收断崖式下跌 (-${Math.round((1 - latestTx.revenue/avgDaily)*100)}%)`;
           actionSuggestion = '立即派人检查机器主板是否被动手脚，或周围是否有新竞品。';
        } else if (latestTx.revenue > avgDaily * 1.5) {
           trend = 'up';
           warningMsg = '营收激增，注意机器是否即将爆机 (9999)。';
           actionSuggestion = '建议缩短巡检周期至每日一次。';
        }

        // 闲置检测 — reuse nowTime (pre-computed above) to avoid new Date() per item
        const daysSinceLastTx = Math.floor((nowTime - new Date(latestTx.timestamp).getTime()) / 86400000);
        if (daysSinceLastTx > 2) {
           riskLevel = 'medium';
           warningMsg = `机器已静默 ${daysSinceLastTx} 天未产生收益。`;
           actionSuggestion = '联系店主确认店铺是否关门，或考虑迁移机器。';
        }
      } else if (locTxs.length === 0) {
         riskLevel = 'high';
         warningMsg = '长达 7 天无任何交易记录！';
         actionSuggestion = '资产可能已流失，需立即派驻巡检员上门核实设备安全。';
      }

      return { loc, totalRevenue, trend, warningMsg, actionSuggestion, riskLevel, txCount: locTxs.length };
    });

    // 筛选出有问题的机器并按风险等级排序
    return locStats
      .filter(s => s.warningMsg !== '')
      .sort((a, b) => (a.riskLevel === 'high' ? -1 : 1));
  }, [transactions, locations]);

  const totalRiskCount = useMemo(() => insights.filter(i => i.riskLevel === 'high').length, [insights]);
  const visibleInsights = showAll ? insights : insights.slice(0, 3);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="rounded-card bg-gradient-to-br from-slate-950 to-indigo-900 p-5 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-4 top-4 opacity-10"><BrainCircuit size={72} /></div>
        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-2.5">
                <BrainCircuit className="text-indigo-200" size={18} />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide">{t.aiBusinessInsights}</h2>
                <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-[0.18em]">{t.aiBusinessInsightsSubtitle}</p>
              </div>
            </div>
            {insights.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAll(current => !current)}
                className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[9px] font-black uppercase text-white"
              >
                {showAll ? t.showLessInsights : t.showAllInsights}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
              <p className="text-[9px] font-black uppercase text-indigo-200">{t.highRiskAssets}</p>
              <div className="mt-1 flex items-baseline gap-2">
                <p className="text-3xl font-black">{totalRiskCount}</p>
                <span className="text-[10px] font-bold text-rose-300">{t.affectedMachines}</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
              <p className="text-[9px] font-black uppercase text-emerald-200">{t.systemHealth}</p>
              <div className="mt-1 flex items-baseline gap-2">
                <p className="text-3xl font-black">{Math.max(0, 100 - totalRiskCount * 5)}</p>
                <span className="text-[10px] font-bold text-emerald-300">/ 100</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.actionableInsights}</h3>
          {insights.length > 0 && (
            <span className="text-[10px] font-black text-slate-500">{visibleInsights.length}/{insights.length}</span>
          )}
        </div>
        
        {insights.length === 0 ? (
           <div className="rounded-card border border-emerald-100 bg-emerald-50 p-6 text-center">
              <Zap size={32} className="mx-auto mb-3 text-emerald-400" />
              <p className="text-sm font-black text-emerald-700">{t.businessHealthy}</p>
              <p className="mt-1 text-[10px] text-emerald-600">{t.aiNoIssuesSub}</p>
           </div>
        ) : (
           <div className="grid grid-cols-1 gap-3">
             {visibleInsights.map((insight, idx) => (
               <button
                 key={insight.loc.id}
                 type="button"
                 onClick={() => onNavigate?.('locations')}
                 className={`rounded-card border bg-white p-4 shadow-sm transition-all text-left w-full ${onNavigate ? 'cursor-pointer hover:shadow-md hover:border-indigo-300' : 'cursor-default'} ${insight.riskLevel === 'high' ? 'border-rose-200' : 'border-amber-200'}`}
               >
                 <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">{insight.loc.name}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{insight.loc.area} • {insight.loc.machineId}</p>
                    </div>
                    <div className={`rounded-xl p-2 ${insight.riskLevel === 'high' ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-500'}`}>
                       {insight.riskLevel === 'high' ? <AlertTriangle size={18} /> : <CalendarClock size={18} />}
                    </div>
                 </div>

                 <div className="space-y-3">
                    <div className={`rounded-2xl p-3 flex items-start gap-3 ${insight.riskLevel === 'high' ? 'bg-rose-50' : 'bg-amber-50'}`}>
                       {insight.trend === 'down' ? <TrendingDown className="text-rose-500 mt-0.5" size={16}/> : insight.trend === 'up' ? <TrendingUp className="text-emerald-500 mt-0.5" size={16}/> : <Activity className="text-amber-500 mt-0.5" size={16}/>}
                       <div>
                          <p className={`text-[10px] font-black uppercase mb-1 ${insight.riskLevel === 'high' ? 'text-rose-700' : 'text-amber-700'}`}>{t.anomalyDetected}</p>
                          <p className={`text-xs font-bold leading-relaxed ${insight.riskLevel === 'high' ? 'text-rose-600' : 'text-amber-600'}`}>{insight.warningMsg}</p>
                       </div>
                    </div>
                    
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 flex items-start gap-3">
                       <Zap className="text-indigo-500 mt-0.5" size={16}/>
                       <div>
                          <p className="text-[10px] font-black text-indigo-700 uppercase mb-1">{t.aiDecisionSuggestion}</p>
                          <p className="text-xs font-bold text-slate-600 leading-relaxed">{insight.actionSuggestion}</p>
                       </div>
                    </div>
                 </div>

                 <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-[10px] font-black">
                    <span className="text-slate-400 uppercase">{t.sevenDayRevenue}</span>
                    <span className="text-slate-700 flex items-center gap-1"><DollarSign size={10}/> {insight.totalRevenue.toLocaleString()} TZS</span>
                 </div>
                  {onNavigate && (
                    <div className="mt-3 text-right text-[9px] font-black text-indigo-500 uppercase tracking-widest">→ 查看点位</div>
                  )}
               </button>
             ))}
           </div>
        )}
      </div>
    </div>
  );
};

export default SmartInsights;
