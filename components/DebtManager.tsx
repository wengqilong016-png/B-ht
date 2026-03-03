
import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, Building2, User,
  Info, HandCoins, X, Coins, Wallet, 
  Loader2, CheckCircle2, AlertCircle,
  CreditCard, PieChart, Check
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

  // --- Data Calculations ---
  const startupDebtPoints = useMemo(() => locations.filter(l => {
     const hasDebt = l.initialStartupDebt > 0;
     if (!hasDebt) return false;
     if (currentUser.role === 'admin') return true;
     return l.assignedDriverId === currentUser.id;
  }), [locations, currentUser]);
  
  const displayedDrivers = useMemo(() => currentUser.role === 'admin' 
    ? drivers 
    : drivers.filter(d => d.id === currentUser.id), [drivers, currentUser]);

  // Financial Summaries
  const totals = useMemo(() => {
    const totalStartupDebt = startupDebtPoints.reduce((sum, l) => sum + l.remainingStartupDebt, 0);
    const totalDriverDebt = displayedDrivers.reduce((sum, d) => sum + d.remainingDebt, 0);
    const initialStartupTotal = startupDebtPoints.reduce((sum, l) => sum + l.initialStartupDebt, 0);
    
    return {
      startup: totalStartupDebt,
      driver: totalDriverDebt,
      combined: totalStartupDebt + totalDriverDebt,
      pointsCount: startupDebtPoints.length,
      activePointsCount: startupDebtPoints.filter(l => l.remainingStartupDebt > 0).length,
      startupProgress: initialStartupTotal > 0 ? ((initialStartupTotal - totalStartupDebt) / initialStartupTotal) * 100 : 100
    };
  }, [startupDebtPoints, displayedDrivers]);

  const handleRecoverSubmit = async (locationId: string) => {
    const amount = parseInt(recoveryAmount);
    if (!amount || amount <= 0) return;
    
    setIsActionLoading(true);
    
    // Simulate slight delay for smoothness
    await new Promise(resolve => setTimeout(resolve, 800));

    if (onUpdateLocations) {
       const updatedLocations = locations.map(l => {
         if (l.id === locationId) {
           const newDebt = Math.max(0, l.remainingStartupDebt - amount);
           return { ...l, remainingStartupDebt: newDebt };
         }
         return l;
       });
       
       try {
         await onUpdateLocations(updatedLocations);
         setSuccessPulse(locationId);
         setRecoveringLocId(null);
         setRecoveryAmount('');
         setTimeout(() => setSuccessPulse(null), 2000);
       } catch (err) {
         console.error("Failed to update debt", err);
       } finally {
         setIsActionLoading(false);
       }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 pb-32">
      
      {/* 顶部财务汇总看板 (Compact Summary) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900 rounded-[24px] p-5 text-white">
           <div className="flex items-center gap-2 mb-2">
              <PieChart size={14} className="text-indigo-400"/>
              <span className="text-[9px] font-black uppercase tracking-widest text-indigo-300">全网待回收总额</span>
           </div>
           <p className="text-xl font-black">TZS {totals.combined.toLocaleString()}</p>
           <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                 <div className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-1000" style={{ width: `${totals.startupProgress}%` }}></div>
              </div>
              <span className="text-[9px] font-black text-emerald-400">{totals.startupProgress.toFixed(0)}%</span>
           </div>
        </div>

        <div className="bg-white rounded-[24px] p-5 border border-slate-200 shadow-sm">
           <div className="flex items-center gap-2 mb-2">
             <div className="p-1.5 bg-amber-50 rounded-lg text-amber-500"><Building2 size={14} /></div>
             <span className="text-[9px] font-black text-slate-400 uppercase">点位启动金</span>
           </div>
           <p className="text-xl font-black text-slate-900">TZS {totals.startup.toLocaleString()}</p>
           <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{totals.activePointsCount} 个点位待回收</p>
        </div>

        <div className="bg-white rounded-[24px] p-5 border border-slate-200 shadow-sm">
           <div className="flex items-center gap-2 mb-2">
             <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-500"><User size={14} /></div>
             <span className="text-[9px] font-black text-slate-400 uppercase">个人借款</span>
           </div>
           <p className="text-xl font-black text-slate-900">TZS {totals.driver.toLocaleString()}</p>
           <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{displayedDrivers.length} 位司机待还款</p>
        </div>
      </div>

      {/* 1. 点位启动资金回收 (Startup Recovery) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><Coins size={18} /></div>
            <div>
              <h2 className="text-sm font-black text-slate-900">{t.startupRecovery}</h2>
              <p className="text-[9px] text-slate-400 font-bold uppercase">Machine Startup Capital Recovery</p>
            </div>
          </div>
          <span className="hidden sm:block text-[9px] font-black text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg uppercase"><Info size={10} className="inline mr-1"/>按营收比例自动扣除</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {startupDebtPoints.length > 0 ? startupDebtPoints.map(loc => {
            const recovered = loc.initialStartupDebt - loc.remainingStartupDebt;
            const progress = loc.initialStartupDebt > 0 ? (recovered / loc.initialStartupDebt) * 100 : 100;
            const isFullyPaid = loc.remainingStartupDebt === 0;
            const isPulsing = successPulse === loc.id;

            return (
              <div 
                key={loc.id} 
                className={`rounded-[28px] border p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden ${isFullyPaid ? 'bg-emerald-50/40 border-emerald-200' : 'bg-white border-slate-200'} ${isPulsing ? 'ring-2 ring-emerald-400/30' : ''}`}
              >
                {isFullyPaid && (
                   <div className="absolute top-3 right-3">
                      <div className="bg-emerald-500 text-white p-1 rounded-full shadow-sm"><CheckCircle2 size={12} /></div>
                   </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isFullyPaid ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                     <Building2 size={18} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-black text-slate-900 text-sm leading-tight line-clamp-1">{loc.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] text-slate-400 font-bold uppercase">{loc.area}</span>
                      <span className="text-slate-200">•</span>
                      <span className="text-[9px] font-black text-indigo-500 uppercase">{loc.machineId}</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                   <div className="bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 flex justify-between items-center relative overflow-hidden">
                      {isPulsing && <div className="absolute inset-0 bg-emerald-100/50 animate-pulse"></div>}
                      <div className="relative z-10">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">待还余额</p>
                        <p className={`text-lg font-black ${isFullyPaid ? 'text-emerald-600' : 'text-slate-900'}`}>TZS {loc.remainingStartupDebt.toLocaleString()}</p>
                      </div>
                      <div className="text-right relative z-10">
                         <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">总额</p>
                         <p className="text-[10px] font-bold text-slate-500">{loc.initialStartupDebt.toLocaleString()}</p>
                      </div>
                   </div>
                   
                   <div className="space-y-1.5">
                     <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                        <span>进度 {progress.toFixed(0)}%</span>
                        <span className={isFullyPaid ? 'text-emerald-600' : 'text-amber-600'}>
                          {isFullyPaid ? '已结清' : '回收中'}
                        </span>
                     </div>
                     <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${isFullyPaid ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-400 to-amber-600'}`} 
                          style={{ width: `${progress}%` }} 
                        />
                     </div>
                   </div>

                   {!isFullyPaid && (
                     <div>
                        {recoveringLocId === loc.id ? (
                          <div className="animate-in slide-in-from-top-2 duration-200 space-y-2 bg-slate-900 p-4 rounded-2xl">
                             <div className="flex justify-between items-center">
                                <p className="text-[9px] font-black text-indigo-400 uppercase">还款金额 (TZS)</p>
                                <button onClick={() => setRecoveringLocId(null)} className="p-1 text-slate-500 hover:text-white">
                                  <X size={14}/>
                                </button>
                             </div>
                             <div className="flex gap-2">
                               <input 
                                 type="number" 
                                 value={recoveryAmount} 
                                 onChange={e => setRecoveryAmount(e.target.value)} 
                                 className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-base font-black text-white outline-none focus:border-indigo-500 transition-all placeholder:text-slate-700" 
                                 placeholder="0" 
                                 autoFocus
                               />
                               <button 
                                 onClick={() => handleRecoverSubmit(loc.id)} 
                                 disabled={isActionLoading || !recoveryAmount}
                                 className="bg-indigo-600 text-white px-4 rounded-xl active:scale-90 transition-all disabled:opacity-30"
                               >
                                 {isActionLoading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                               </button>
                             </div>
                             {isActionLoading && <p className="text-[8px] font-black text-indigo-400 uppercase animate-pulse">正在同步...</p>}
                          </div>
                        ) : (
                          <button 
                            onClick={() => { setRecoveringLocId(loc.id); setRecoveryAmount(''); }}
                            className="w-full py-3 bg-white border border-slate-200 text-slate-900 rounded-2xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-slate-50 transition-all active:scale-[0.98]"
                          >
                             <HandCoins size={14} className="text-amber-500" /> {t.pay}
                          </button>
                        )}
                     </div>
                   )}
                </div>
              </div>
            );
          }) : (
            <div className="col-span-full py-12 text-center bg-white rounded-[28px] border border-dashed border-slate-200 flex flex-col items-center justify-center gap-3">
               <Building2 size={32} className="text-slate-200" />
               <div>
                 <p className="text-sm font-black text-slate-400 uppercase">暂无点位待回收资金</p>
                 <p className="text-[10px] text-slate-300 font-bold uppercase mt-0.5">所有启动金已结清</p>
               </div>
            </div>
          )}
        </div>
      </section>

      {/* 2. 司机借款管理 (Driver Loans) */}
      <section className="border-t border-slate-100 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Wallet size={18} /></div>
          <div>
            <h2 className="text-sm font-black text-slate-900">{t.driverLoan}</h2>
            <p className="text-[9px] text-slate-400 font-bold uppercase">Personal Liabilities & Advance Payments</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedDrivers.length > 0 ? displayedDrivers.map(driver => {
            const recovered = driver.initialDebt - driver.remainingDebt;
            const progress = driver.initialDebt > 0 ? (recovered / driver.initialDebt) * 100 : 100;
            const isDebtFree = driver.remainingDebt === 0;

            return (
              <div key={driver.id} className={`rounded-[24px] border p-5 shadow-sm hover:shadow-md transition-all ${isDebtFree ? 'bg-white/50 border-slate-100' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-base ${isDebtFree ? 'bg-slate-300' : 'bg-slate-900'}`}>
                    {driver.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-black text-slate-900 text-sm">{driver.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                       <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${isDebtFree ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                         {isDebtFree ? '已结清' : '待还'}
                       </span>
                       <span className="text-[9px] text-slate-400">{driver.phone}</span>
                    </div>
                  </div>
                  {isDebtFree && <ShieldCheck size={16} className="text-emerald-400 shrink-0" />}
                </div>

                <div className="space-y-3">
                   <div className="bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 flex justify-between items-center">
                      <div>
                         <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">当前欠款</p>
                         <p className={`text-lg font-black ${isDebtFree ? 'text-emerald-600' : 'text-slate-900'}`}>TZS {driver.remainingDebt.toLocaleString()}</p>
                      </div>
                      <CreditCard size={16} className="text-slate-200" />
                   </div>

                   <div className="space-y-1.5">
                      <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                        <span>进度 {progress.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${isDebtFree ? 'bg-emerald-500' : 'bg-indigo-500'}`} 
                          style={{ width: `${progress}%` }} 
                        />
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                         <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">底薪</p>
                         <p className="text-[10px] font-bold text-slate-700">TZS {(driver.baseSalary ?? 300000).toLocaleString()}</p>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                         <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">提成</p>
                         <p className="text-[10px] font-bold text-slate-700">{((driver.commissionRate ?? 0.05) * 100).toFixed(0)}%</p>
                      </div>
                   </div>
                </div>
              </div>
            );
          }) : (
            <div className="col-span-full py-10 text-center text-slate-300">
              <p className="text-[10px] font-black uppercase">没有匹配的司机借款记录</p>
            </div>
          )}
        </div>
      </section>

      {/* Footer Info */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-start gap-3 max-w-2xl mx-auto">
         <AlertCircle size={16} className="text-indigo-500 shrink-0 mt-0.5" />
         <p className="text-[9px] text-slate-500 font-bold leading-relaxed">点位启动金按每次巡检营收自动扣除，手动还款仅限大额结清。所有记录同步至"日终对账"。</p>
      </div>
    </div>
  );
};

export default DebtManager;