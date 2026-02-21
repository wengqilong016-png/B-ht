
import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, TrendingDown, Building2, User, Truck, 
  Info, HandCoins, ArrowRight, Save, Coins, Wallet, 
  Loader2, CheckCircle2, AlertCircle, TrendingUp,
  CreditCard, PieChart, ChevronRight, Check, X
} from 'lucide-react';
import { Driver, Location, User as UserType, TRANSLATIONS } from '../types';

interface DebtManagerProps {
  drivers: Driver[];
  locations: Location[];
  currentUser: UserType;
  onUpdateLocations?: (locations: Location[]) => void;
  lang: 'zh' | 'sw';
}

const DebtManager: React.FC<DebtManagerProps> = ({ drivers, locations, currentUser, onUpdateLocations, lang }) => {
  const t = TRANSLATIONS[lang];
  
  // States
  const [recoveringLocId, setRecoveringLocId] = useState<string | null>(null);
  const [recoveryAmount, setRecoveryAmount] = useState<string>('');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [successPulse, setSuccessPulse] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<'none' | 'startup' | 'driver'>('none');

  // ... (Calculations remain same)

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 pb-32">
      
      {/* 顶部财务汇总看板 (Global Summary) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 rounded-[35px] p-7 text-white shadow-2xl relative overflow-hidden group">
           <div className="absolute -right-6 -top-6 p-12 bg-indigo-500/10 rounded-full blur-3xl"></div>
           <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                 <div className="p-2.5 bg-indigo-600 rounded-2xl shadow-lg"><PieChart size={18} className="text-white"/></div>
                 <span className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-300">总待回收 TOTAL DUE</span>
              </div>
              <p className="text-3xl font-black tracking-tight">TZS {totals.combined.toLocaleString()}</p>
           </div>
        </div>

        <button 
          onClick={() => setDetailView(detailView === 'startup' ? 'none' : 'startup')}
          className={`bg-white rounded-[35px] p-7 border-2 transition-all text-left relative overflow-hidden ${detailView === 'startup' ? 'border-amber-500 ring-4 ring-amber-500/10' : 'border-slate-100 hover:border-amber-200'}`}
        >
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-50 rounded-xl text-amber-500"><Building2 size={20} /></div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">点位启动金 (Startup)</span>
              </div>
              {detailView === 'startup' ? <X size={18} className="text-slate-300"/> : <ChevronRight size={18} className="text-slate-200" />}
           </div>
           <div className="mt-4">
              <p className="text-2xl font-black text-slate-900">TZS {totals.startup.toLocaleString()}</p>
              <p className="text-[9px] font-bold text-amber-600 uppercase mt-1">点击查看 {totals.activePointsCount} 个明细</p>
           </div>
        </button>

        <button 
          onClick={() => setDetailView(detailView === 'driver' ? 'none' : 'driver')}
          className={`bg-white rounded-[35px] p-7 border-2 transition-all text-left relative overflow-hidden ${detailView === 'driver' ? 'border-indigo-500 ring-4 ring-indigo-500/10' : 'border-slate-100 hover:border-indigo-200'}`}
        >
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-500"><User size={20} /></div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">个人借款 (Drivers)</span>
              </div>
              {detailView === 'driver' ? <X size={18} className="text-slate-300"/> : <ChevronRight size={18} className="text-slate-200" />}
           </div>
           <div className="mt-4">
              <p className="text-2xl font-black text-slate-900">TZS {totals.driver.toLocaleString()}</p>
              <p className="text-[9px] font-bold text-indigo-600 uppercase mt-1">点击查看司机欠款清单</p>
           </div>
        </button>
      </div>

      {/* DETAIL LISTS (Conditional) */}
      {detailView === 'startup' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in slide-in-from-top-4">
           {startupDebtPoints.filter(l => l.remainingStartupDebt > 0).map(loc => (
             <div key={loc.id} className="bg-amber-50/50 border border-amber-100 p-5 rounded-[28px] flex justify-between items-center">
                <div>
                   <p className="text-xs font-black text-slate-900">{loc.name}</p>
                   <p className="text-[9px] font-bold text-amber-600 uppercase">{loc.machineId} • {loc.area}</p>
                </div>
                <div className="text-right">
                   <p className="text-sm font-black text-slate-900">TZS {loc.remainingStartupDebt.toLocaleString()}</p>
                   <button onClick={() => setRecoveringLocId(loc.id)} className="text-[8px] font-black text-indigo-600 uppercase underline mt-1">确认回收</button>
                </div>
             </div>
           ))}
        </div>
      )}

      {detailView === 'driver' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in slide-in-from-top-4">
           {drivers.filter(d => d.remainingDebt > 0).map(d => (
             <div key={d.id} className="bg-indigo-50/50 border border-indigo-100 p-5 rounded-[28px] flex justify-between items-center">
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[10px] font-black text-indigo-600 shadow-sm">{d.name.charAt(0)}</div>
                   <div>
                      <p className="text-xs font-black text-slate-900">{d.name}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">{d.phone}</p>
                   </div>
                </div>
                <p className="text-sm font-black text-rose-600">TZS {d.remainingDebt.toLocaleString()}</p>
             </div>
           ))}
        </div>
      )}

      {/* Existing Sections... */}

      {/* 1. 点位启动资金回收 (Startup Recovery) */}
      <section className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100 shadow-sm"><Coins size={24} /></div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">{t.startupRecovery}</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Machine Startup Capital Recovery</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-xl text-[10px] font-black text-slate-500 uppercase">
             <Info size={14} /> 按每笔营收百分比自动扣除
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {startupDebtPoints.length > 0 ? startupDebtPoints.map(loc => {
            const recovered = loc.initialStartupDebt - loc.remainingStartupDebt;
            const progress = loc.initialStartupDebt > 0 ? (recovered / loc.initialStartupDebt) * 100 : 100;
            const isFullyPaid = loc.remainingStartupDebt === 0;
            const isPulsing = successPulse === loc.id;

            return (
              <div 
                key={loc.id} 
                className={`rounded-[42px] border p-7 shadow-sm hover:shadow-xl transition-all relative overflow-hidden group ${isFullyPaid ? 'bg-emerald-50/40 border-emerald-200' : 'bg-white border-slate-200'} ${isPulsing ? 'ring-4 ring-emerald-400/30' : ''}`}
              >
                {isFullyPaid && (
                   <div className="absolute top-0 right-0 p-5 animate-in zoom-in duration-500">
                      <div className="bg-emerald-500 text-white p-1.5 rounded-full shadow-lg shadow-emerald-200"><CheckCircle2 size={16} /></div>
                   </div>
                )}

                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner transition-colors duration-500 ${isFullyPaid ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500'}`}>
                     <Building2 size={24} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-black text-slate-900 text-sm leading-tight line-clamp-1">{loc.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{loc.area}</span>
                      <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                      <span className="text-[9px] font-black text-indigo-500 uppercase">{loc.machineId}</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-5">
                   <div className="bg-slate-50 p-5 rounded-[32px] border border-slate-100 flex justify-between items-center relative overflow-hidden">
                      {isPulsing && <div className="absolute inset-0 bg-emerald-100/50 animate-pulse"></div>}
                      <div className="relative z-10">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5 tracking-widest">待还余额 Balance</p>
                        <p className={`text-xl font-black ${isFullyPaid ? 'text-emerald-600' : 'text-slate-900'}`}>TZS {loc.remainingStartupDebt.toLocaleString()}</p>
                      </div>
                      <div className="text-right relative z-10">
                         <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">总额 Total</p>
                         <p className="text-[10px] font-bold text-slate-500">{loc.initialStartupDebt.toLocaleString()}</p>
                      </div>
                   </div>
                   
                   <div className="space-y-2 px-1">
                     <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        <span>回收进度 {progress.toFixed(0)}%</span>
                        <span className={isFullyPaid ? 'text-emerald-600' : 'text-amber-600'}>
                          {isFullyPaid ? 'COMPLETED' : 'RECOVERING'}
                        </span>
                     </div>
                     <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ease-out ${isFullyPaid ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-400 to-amber-600 shadow-[0_0_8px_rgba(245,158,11,0.4)]'}`} 
                          style={{ width: `${progress}%` }} 
                        />
                     </div>
                   </div>

                   {!isFullyPaid && (
                     <div className="pt-2">
                        {recoveringLocId === loc.id ? (
                          <div className="animate-in slide-in-from-top-4 duration-300 space-y-4 bg-slate-900 p-6 rounded-[35px] shadow-2xl relative">
                             <div className="flex justify-between items-center mb-1">
                                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">输入还款金额 (TZS)</p>
                                <button onClick={() => setRecoveringLocId(null)} className="p-1.5 text-slate-500 hover:text-white transition-colors">
                                  <X size={16}/>
                                </button>
                             </div>
                             <div className="flex gap-2">
                               <input 
                                 type="number" 
                                 value={recoveryAmount} 
                                 onChange={e => setRecoveryAmount(e.target.value)} 
                                 className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-lg font-black text-white outline-none focus:border-indigo-500 transition-all placeholder:text-slate-700" 
                                 placeholder="0" 
                                 autoFocus
                               />
                               <button 
                                 onClick={() => handleRecoverSubmit(loc.id)} 
                                 disabled={isActionLoading || !recoveryAmount}
                                 className="bg-indigo-600 text-white px-5 rounded-2xl shadow-xl active:scale-90 transition-all disabled:opacity-30 disabled:grayscale"
                               >
                                 {isActionLoading ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}
                               </button>
                             </div>
                             {isActionLoading && (
                               <div className="flex items-center gap-2">
                                 <Loader2 size={10} className="animate-spin text-indigo-400" />
                                 <p className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.2em] animate-pulse">正在更新账目并同步云端...</p>
                               </div>
                             )}
                          </div>
                        ) : (
                          <button 
                            onClick={() => { setRecoveringLocId(loc.id); setRecoveryAmount(''); }}
                            className="w-full py-5 bg-white border border-slate-200 text-slate-900 rounded-[28px] text-[11px] font-black uppercase flex items-center justify-center gap-3 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-[0.97] shadow-sm"
                          >
                             <HandCoins size={18} className="text-amber-500" /> {t.pay} 还款
                          </button>
                        )}
                     </div>
                   )}
                </div>
              </div>
            );
          }) : (
            <div className="col-span-full py-24 text-center bg-white rounded-[50px] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center space-y-4">
               <div className="p-6 bg-slate-50 rounded-full text-slate-100"><Building2 size={64} /></div>
               <div>
                 <p className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">暂无点位待回收资金</p>
                 <p className="text-[10px] text-slate-300 font-bold uppercase mt-1">所有注册点位的启动金已结清或尚未产生</p>
               </div>
            </div>
          )}
        </div>
      </section>

      {/* 2. 司机借款管理 (Driver Loans) */}
      <section className="pt-10 border-t border-slate-100">
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 shadow-sm"><Wallet size={24} /></div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">{t.driverLoan}</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Personal Liabilities & Advance Payments</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedDrivers.length > 0 ? displayedDrivers.map(driver => {
            const recovered = driver.initialDebt - driver.remainingDebt;
            const progress = driver.initialDebt > 0 ? (recovered / driver.initialDebt) * 100 : 100;
            const isDebtFree = driver.remainingDebt === 0;

            return (
              <div key={driver.id} className={`rounded-[42px] border p-7 shadow-sm hover:shadow-lg transition-all group ${isDebtFree ? 'bg-white/50 border-slate-100' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg transition-transform group-hover:scale-105 ${isDebtFree ? 'bg-slate-300' : 'bg-slate-900'}`}>
                      {driver.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-sm">{driver.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                         <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase ${isDebtFree ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                           {isDebtFree ? 'CLEARED' : 'OUTSTANDING'}
                         </span>
                         <span className="text-[9px] font-bold text-slate-400">{driver.phone}</span>
                      </div>
                    </div>
                  </div>
                  <div className={`p-2 rounded-xl transition-colors ${isDebtFree ? 'text-emerald-400' : 'text-slate-200'}`}>
                     <ShieldCheck size={20} />
                  </div>
                </div>

                <div className="space-y-5">
                   <div className="bg-slate-50 p-5 rounded-[32px] border border-slate-100">
                      <div className="flex justify-between items-center">
                         <div className="space-y-1">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">当前个人欠款</p>
                            <p className={`text-xl font-black ${isDebtFree ? 'text-emerald-600' : 'text-slate-900'}`}>TZS {driver.remainingDebt.toLocaleString()}</p>
                         </div>
                         <CreditCard size={20} className="text-slate-200" />
                      </div>
                   </div>

                   <div className="space-y-2 px-1">
                      <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        <span>偿还进度 Progress</span>
                        <span>{progress.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${isDebtFree ? 'bg-emerald-500' : 'bg-indigo-500'}`} 
                          style={{ width: `${progress}%` }} 
                        />
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                         <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">基础薪资 Base</p>
                         <p className="text-[10px] font-bold text-slate-700">TZS {(driver.baseSalary ?? 300000).toLocaleString()}</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                         <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">提成比例 Comm</p>
                         <p className="text-[10px] font-bold text-slate-700">{((driver.commissionRate ?? 0.05) * 100).toFixed(0)}% Revenue</p>
                      </div>
                   </div>

                   {currentUser.role === 'admin' && !isDebtFree && (
                     <p className="text-[9px] text-center font-bold text-indigo-400 italic">管理员可在结算单中手动或自动冲抵欠款</p>
                   )}
                </div>
              </div>
            );
          }) : (
            <div className="col-span-full py-16 text-center text-slate-300">
              <p className="text-[10px] font-black uppercase tracking-widest">没有匹配的司机借款记录</p>
            </div>
          )}
        </div>
      </section>

      {/* Footer Info */}
      <div className="bg-indigo-600/5 p-6 rounded-[35px] border border-indigo-100 flex items-center gap-4 max-w-2xl mx-auto">
         <div className="p-3 bg-white rounded-2xl text-indigo-600 shadow-sm"><AlertCircle size={24} /></div>
         <div>
            <p className="text-xs font-black text-indigo-900 uppercase">财务安全提醒 FINANCIAL SECURITY</p>
            <p className="text-[10px] text-indigo-500 font-bold leading-relaxed mt-1">所有还款动作将实时记录并在下一次“日终对账 (Daily Settlement)”中体现。点位启动金的偿还是通过每次现场巡检营收扣除自动完成的，手动还款仅限大额结清。</p>
         </div>
      </div>
    </div>
  );
};

export default DebtManager;
