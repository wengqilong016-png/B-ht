
import React, { useState } from 'react';
import { ShieldCheck, TrendingDown, Building2, User, Truck, Info, HandCoins, ArrowRight, Save, Coins, Wallet } from 'lucide-react';
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
  // State for recovery input
  const [recoveringLocId, setRecoveringLocId] = useState<string | null>(null);
  const [recoveryAmount, setRecoveryAmount] = useState<string>('');

  // Filter logic: 
  // 1. Get points with debt
  // 2. If Admin, show all. If Driver, show only those assigned to them.
  const startupDebtPoints = locations.filter(l => {
     const hasDebt = l.initialStartupDebt > 0;
     if (!hasDebt) return false;
     
     if (currentUser.role === 'admin') return true;
     return l.assignedDriverId === currentUser.id;
  });
  
  // Filter drivers: Admin sees all, Driver sees only themselves
  const displayedDrivers = currentUser.role === 'admin' 
    ? drivers 
    : drivers.filter(d => d.id === currentUser.id);

  const handleRecoverSubmit = (locationId: string) => {
    const amount = parseInt(recoveryAmount);
    if (!amount || amount <= 0) return;
    
    if (onUpdateLocations) {
       const updatedLocations = locations.map(l => {
         if (l.id === locationId) {
           const newDebt = Math.max(0, l.remainingStartupDebt - amount);
           return { ...l, remainingStartupDebt: newDebt };
         }
         return l;
       });
       onUpdateLocations(updatedLocations);
       setRecoveringLocId(null);
       setRecoveryAmount('');
       alert(lang === 'zh' ? "资金回收记录已更新" : "Imerekodiwa Kikamilifu");
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 pb-20">
      
      {/* 1. 点位启动资金 (Company Assets) */}
      <section>
        <div className="flex items-center justify-between mb-6 px-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl shadow-sm"><Coins size={24} /></div>
            <div>
              <h2 className="text-xl font-black text-slate-900">{t.startupRecovery}</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Asset Recovery</p>
            </div>
          </div>
          {startupDebtPoints.length > 0 && (
             <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase">Total Items</p>
                <p className="text-lg font-black text-amber-600">{startupDebtPoints.length}</p>
             </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {startupDebtPoints.length > 0 ? startupDebtPoints.map(loc => {
            const recovered = loc.initialStartupDebt - loc.remainingStartupDebt;
            const progress = (recovered / loc.initialStartupDebt) * 100;
            const isFullyPaid = loc.remainingStartupDebt === 0;

            return (
              <div key={loc.id} className={`rounded-[35px] border p-6 shadow-sm hover:shadow-xl transition-all relative overflow-hidden group ${isFullyPaid ? 'bg-white border-emerald-200' : 'bg-white border-slate-200'}`}>
                {/* Status Badge */}
                <div className={`absolute top-0 right-0 px-4 py-2 rounded-bl-3xl font-black text-[9px] uppercase tracking-widest ${isFullyPaid ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                   {isFullyPaid ? t.fullyPaid : 'Active Debt'}
                </div>

                <div className="flex items-center gap-4 mb-6 mt-2">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${isFullyPaid ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                     <Building2 size={24} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-base leading-tight">{loc.name}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 flex items-center gap-1"><Info size={10} /> {loc.area}</p>
                  </div>
                </div>
                
                <div className="space-y-5">
                   <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex justify-between items-end mb-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase">{t.balance}</span>
                        <span className="text-[9px] font-bold text-slate-300 uppercase">/ TZS {loc.initialStartupDebt.toLocaleString()}</span>
                      </div>
                      <p className={`text-2xl font-black ${isFullyPaid ? 'text-emerald-600' : 'text-slate-900'}`}>TZS {loc.remainingStartupDebt.toLocaleString()}</p>
                   </div>
                   
                   <div className="space-y-1.5">
                     <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase"><span>{t.progress}</span><span>{progress.toFixed(0)}%</span></div>
                     <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-100"><div className={`h-full rounded-full transition-all duration-1000 ${isFullyPaid ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${progress}%` }} /></div>
                   </div>

                   {/* Recovery Action Area */}
                   {!isFullyPaid && (
                     <div className="mt-2">
                        {recoveringLocId === loc.id ? (
                          <div className="animate-in slide-in-from-bottom-2 space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                             <div className="flex justify-between items-center">
                                <p className="text-[9px] font-black text-indigo-500 uppercase">{lang === 'zh' ? '输入回收金额' : 'Weka Kiasi'}</p>
                                <button onClick={() => setRecoveringLocId(null)} className="text-[9px] font-bold text-slate-400 uppercase">Cancel</button>
                             </div>
                             <div className="flex gap-2">
                               <input 
                                 type="number" 
                                 value={recoveryAmount} 
                                 onChange={e => setRecoveryAmount(e.target.value)} 
                                 className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-black outline-none focus:border-indigo-500 text-slate-900" 
                                 placeholder="50000" 
                                 autoFocus
                               />
                               <button onClick={() => handleRecoverSubmit(loc.id)} className="bg-indigo-600 text-white px-4 rounded-xl shadow-lg active:scale-90 transition-transform"><Save size={18} /></button>
                             </div>
                          </div>
                        ) : (
                          <button 
                            onClick={() => setRecoveringLocId(loc.id)}
                            className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
                          >
                             <HandCoins size={16} className="text-amber-400" /> {t.pay}
                          </button>
                        )}
                     </div>
                   )}
                   
                   {isFullyPaid && (
                      <div className="py-4 flex items-center justify-center gap-2 text-emerald-600 bg-emerald-50 rounded-2xl border border-emerald-100">
                        <ShieldCheck size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">{t.fullyPaid}</span>
                      </div>
                   )}
                </div>
              </div>
            );
          }) : (
            <div className="col-span-full py-16 text-center bg-white rounded-[40px] border-2 border-dashed border-slate-200">
               <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                 <Building2 size={24} />
               </div>
               <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{lang === 'zh' ? '暂无点位资金记录' : 'Hakuna rekodi za mtaji'}</p>
            </div>
          )}
        </div>
      </section>

      {/* 2. 司机个人借款 (Personal Liabilities) */}
      <section className="pt-4 border-t border-slate-200/50">
        <div className="flex items-center gap-3 mb-6 px-2">
          <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl shadow-sm"><Wallet size={24} /></div>
          <div>
            <h2 className="text-xl font-black text-slate-900">{t.driverLoan}</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Personal Loans & Advances</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedDrivers.map(driver => {
            const recovered = driver.initialDebt - driver.remainingDebt;
            const progress = driver.initialDebt > 0 ? (recovered / driver.initialDebt) * 100 : 100;
            return (
              <div key={driver.id} className="bg-white rounded-[35px] border border-slate-200 p-6 shadow-sm hover:shadow-lg transition-all group">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform">{driver.name.charAt(0)}</div>
                    <div>
                      <h3 className="font-black text-slate-900">{driver.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Truck size={12} className="text-slate-400" />
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">{driver.vehicleInfo.model}</span>
                      </div>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${progress === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                    {progress === 100 ? t.fullyPaid : `${(100 - progress).toFixed(0)}% Left`}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Total Loan</p>
                      <p className="text-sm font-black text-slate-900">TZS {driver.initialDebt.toLocaleString()}</p>
                    </div>
                    <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100">
                      <p className="text-[8px] font-black text-rose-400 uppercase mb-1 tracking-widest">{t.balance}</p>
                      <p className="text-sm font-black text-rose-600">TZS {driver.remainingDebt.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase px-1"><span>{t.progress}</span><span>{progress.toFixed(0)}%</span></div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} /></div>
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100 text-slate-500">
                    <TrendingDown size={14} className="text-indigo-500" />
                    <p className="text-[9px] font-bold uppercase tracking-tight leading-tight">{lang === 'zh' ? '系统将自动从每次外勤提成中扣除 10%' : 'Mfumo unakata 10% kwenye kila tripu'}</p>
                  </div>
                </div>
              </div>
            );
          })}
          {displayedDrivers.length === 0 && (
            <div className="col-span-full py-16 text-center bg-white rounded-[40px] border-2 border-dashed border-slate-200">
               <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                 <Wallet size={24} />
               </div>
               <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{lang === 'zh' ? '暂无个人借款记录' : 'Hakuna Mkopo Binafsi'}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default DebtManager;
