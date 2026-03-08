import React, { useMemo } from 'react';
import { BrainCircuit, TrendingDown, TrendingUp, AlertTriangle, Zap, CalendarClock, DollarSign, Activity } from 'lucide-react';
import { Transaction, Location, Driver } from '../types';

interface SmartInsightsProps {
  transactions: Transaction[];
  locations: Location[];
  drivers: Driver[];
}

const SmartInsights: React.FC<SmartInsightsProps> = ({ transactions, locations }) => {
  // 核心 AI 算法：计算每台机器的“健康度”和“异动指标”
  const insights = useMemo(() => {
    const now = new Date();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const pastWeekTxs = transactions.filter(t => (now.getTime() - new Date(t.timestamp).getTime()) < SEVEN_DAYS);

    // 聚合每台机器的 7 天数据
    const locStats = locations.map(loc => {
      const locTxs = pastWeekTxs.filter(t => t.locationId === loc.id).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
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

        // 闲置检测
        const daysSinceLastTx = Math.floor((now.getTime() - new Date(latestTx.timestamp).getTime()) / 86400000);
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

  const totalRiskCount = insights.filter(i => i.riskLevel === 'high').length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* AI 大脑总控看板 */}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-900 rounded-[40px] p-8 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-20"><BrainCircuit size={160} /></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
             <div className="p-3 bg-indigo-500/30 rounded-2xl backdrop-blur-md border border-white/10">
                <BrainCircuit className="text-indigo-300" size={24}/>
             </div>
             <div>
               <h2 className="text-xl font-black tracking-tight">AI 商业智能分析</h2>
               <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-[0.2em] mt-1">Smart BI Engine</p>
             </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-8">
             <div className="bg-white/10 backdrop-blur-md rounded-3xl p-5 border border-white/5">
                <p className="text-[10px] font-black text-indigo-300 uppercase">高风险资产</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-4xl font-black">{totalRiskCount}</p>
                  <span className="text-xs text-rose-400 font-bold">台设备异常</span>
                </div>
             </div>
             <div className="bg-white/10 backdrop-blur-md rounded-3xl p-5 border border-white/5">
                <p className="text-[10px] font-black text-emerald-300 uppercase">系统健康度</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-4xl font-black">{Math.max(0, 100 - totalRiskCount * 5)}</p>
                  <span className="text-xs text-emerald-400 font-bold">/ 100</span>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* 智能洞察列表 */}
      <div className="space-y-4">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">需立即介入的运营建议 (Actionable Insights)</h3>
        
        {insights.length === 0 ? (
           <div className="bg-emerald-50 rounded-[32px] p-8 text-center border border-emerald-100">
              <Zap size={40} className="mx-auto text-emerald-400 mb-3" />
              <p className="text-sm font-black text-emerald-700">业务运行完美！</p>
              <p className="text-[10px] text-emerald-600 mt-1">AI 未检测到任何异常跌落或闲置资产。</p>
           </div>
        ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {insights.map((insight, idx) => (
               <div key={insight.loc.id} className={`bg-white rounded-[32px] p-6 border shadow-sm transition-all hover:shadow-xl ${insight.riskLevel === 'high' ? 'border-rose-200 shadow-rose-100/50' : 'border-amber-200 shadow-amber-100/50'}`}>
                 <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">{insight.loc.name}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{insight.loc.area} • {insight.loc.machineId}</p>
                    </div>
                    <div className={`p-2 rounded-xl ${insight.riskLevel === 'high' ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-500'}`}>
                       {insight.riskLevel === 'high' ? <AlertTriangle size={18} /> : <CalendarClock size={18} />}
                    </div>
                 </div>

                 <div className="space-y-3">
                    <div className={`p-3 rounded-2xl flex items-start gap-3 ${insight.riskLevel === 'high' ? 'bg-rose-50' : 'bg-amber-50'}`}>
                       {insight.trend === 'down' ? <TrendingDown className="text-rose-500 mt-0.5" size={16}/> : insight.trend === 'up' ? <TrendingUp className="text-emerald-500 mt-0.5" size={16}/> : <Activity className="text-amber-500 mt-0.5" size={16}/>}
                       <div>
                          <p className={`text-[10px] font-black uppercase mb-1 ${insight.riskLevel === 'high' ? 'text-rose-700' : 'text-amber-700'}`}>发现异常</p>
                          <p className={`text-xs font-bold leading-relaxed ${insight.riskLevel === 'high' ? 'text-rose-600' : 'text-amber-600'}`}>{insight.warningMsg}</p>
                       </div>
                    </div>
                    
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
                       <Zap className="text-indigo-500 mt-0.5" size={16}/>
                       <div>
                          <p className="text-[10px] font-black text-indigo-700 uppercase mb-1">AI 决策建议</p>
                          <p className="text-xs font-bold text-slate-600 leading-relaxed">{insight.actionSuggestion}</p>
                       </div>
                    </div>
                 </div>

                 <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-[10px] font-black">
                    <span className="text-slate-400 uppercase">7天营收概览</span>
                    <span className="text-slate-700 flex items-center gap-1"><DollarSign size={10}/> {insight.totalRevenue.toLocaleString()} TZS</span>
                 </div>
               </div>
             ))}
           </div>
        )}
      </div>
    </div>
  );
};

export default SmartInsights;
