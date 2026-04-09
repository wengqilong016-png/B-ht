
import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, Building2, User,
  Info, HandCoins, X, Coins, Wallet, 
  Loader2, CheckCircle2, AlertCircle,
  CreditCard, PieChart, Check, Pencil, Save
} from 'lucide-react';
import { Driver, Location, TRANSLATIONS } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/DataContext';
import { useMutations } from '../contexts/MutationContext';
import { logFinanceAudit, logFinanceAuditBatch } from '../services/financeAuditService';
import FinanceAuditPanel from './dashboard/FinanceAuditPanel';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface DebtManagerProps {}

interface DriverEditFormState {
  remainingDebt: string;
  dailyFloatingCoins: string;
}

function scheduleSuccessPulse(
  setSuccessPulse: React.Dispatch<React.SetStateAction<string | null>>,
  entityId: string,
) {
  setSuccessPulse(entityId);
  setTimeout(() => setSuccessPulse(null), 2000);
}

function buildRecoveredLocations(
  locations: Location[],
  locationId: string,
  amount: number,
): { updatedLocations: Location[]; targetLocation: Location | undefined; nextDebt: number } {
  const targetLocation = locations.find((location) => location.id === locationId);
  const oldDebt = targetLocation?.remainingStartupDebt ?? 0;
  const nextDebt = Math.max(0, oldDebt - amount);

  return {
    updatedLocations: locations.map((location) => (
      location.id === locationId
        ? { ...location, remainingStartupDebt: nextDebt }
        : location
    )),
    targetLocation,
    nextDebt,
  };
}

function buildUpdatedDriver(
  driver: Driver,
  form: DriverEditFormState,
): Driver {
  return {
    ...driver,
    remainingDebt: parseInt(form.remainingDebt, 10) || 0,
    dailyFloatingCoins: parseInt(form.dailyFloatingCoins, 10) || 0,
    isSynced: false,
  };
}

function buildDriverAuditEntries(
  driver: Driver,
  updatedDriver: Driver,
  actorId: string,
): Parameters<typeof logFinanceAuditBatch>[0] {
  const auditEntries: Parameters<typeof logFinanceAuditBatch>[0] = [];

  if ((driver.remainingDebt ?? 0) !== updatedDriver.remainingDebt) {
    auditEntries.push({
      event_type: 'driver_debt_change',
      entity_type: 'driver',
      entity_id: driver.id,
      entity_name: driver.name,
      actor_id: actorId,
      old_value: driver.remainingDebt ?? 0,
      new_value: updatedDriver.remainingDebt,
    });
  }

  if ((driver.dailyFloatingCoins ?? 0) !== updatedDriver.dailyFloatingCoins) {
    auditEntries.push({
      event_type: 'floating_coins_change',
      entity_type: 'driver',
      entity_id: driver.id,
      entity_name: driver.name,
      actor_id: actorId,
      old_value: driver.dailyFloatingCoins ?? 0,
      new_value: updatedDriver.dailyFloatingCoins,
    });
  }

  return auditEntries;
}

const DebtManager: React.FC<DebtManagerProps> = () => {
  const { currentUser, lang } = useAuth();
  const { filteredDrivers: drivers, filteredLocations: locations } = useAppData();
  const { updateLocations, updateDrivers } = useMutations();

  const onUpdateLocations = (locationsToSave: Location[]) => updateLocations.mutateAsync(locationsToSave);
  const onUpdateDrivers = (driversToSave: Driver[]) => updateDrivers.mutateAsync(driversToSave);

  const t = TRANSLATIONS[lang];
  const activeDriverId = currentUser.driverId ?? currentUser.id;
  
  // States
  const [recoveringLocId, setRecoveringLocId] = useState<string | null>(null);
  const [recoveryAmount, setRecoveryAmount] = useState<string>('');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [successPulse, setSuccessPulse] = useState<string | null>(null);

  // Driver debt editing (admin only)
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [driverEditForm, setDriverEditForm] = useState<DriverEditFormState>({ remainingDebt: '', dailyFloatingCoins: '' });

  // --- Data Calculations ---
  const startupDebtPoints = useMemo(() => locations.filter(l => {
     const hasDebt = l.initialStartupDebt > 0;
     if (!hasDebt) return false;
     if (currentUser.role === 'admin') return true;
     return l.assignedDriverId === activeDriverId;
  }), [activeDriverId, currentUser.role, locations]);
  
  const displayedDrivers = useMemo(() => currentUser.role === 'admin' 
    ? drivers 
    : drivers.filter(d => d.id === activeDriverId), [activeDriverId, currentUser.role, drivers]);

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
    const amount = parseInt(recoveryAmount, 10);
    if (!amount || amount <= 0) return;
    
    setIsActionLoading(true);
    
    // Simulate slight delay for smoothness
    await new Promise(resolve => setTimeout(resolve, 800));

    const { updatedLocations, targetLocation, nextDebt } = buildRecoveredLocations(locations, locationId, amount);

    try {
      await onUpdateLocations(updatedLocations);
      logFinanceAudit({
        event_type: 'startup_debt_recovery',
        entity_type: 'location',
        entity_id: locationId,
        entity_name: targetLocation?.name,
        actor_id: activeDriverId,
        old_value: targetLocation?.remainingStartupDebt ?? 0,
        new_value: nextDebt,
        payload: { recoveryAmount: amount },
      });
      scheduleSuccessPulse(setSuccessPulse, locationId);
      setRecoveringLocId(null);
      setRecoveryAmount('');
    } catch (error) {
      console.error('Failed to update startup debt recovery.', error);
    } finally {
      setIsActionLoading(false);
    }
  };

  const openDriverEdit = (driver: Driver) => {
    setEditingDriverId(driver.id);
    setDriverEditForm({
      remainingDebt: (driver.remainingDebt ?? 0).toString(),
      dailyFloatingCoins: (driver.dailyFloatingCoins ?? 0).toString(),
    });
  };

  const handleDriverDebtSave = async (driver: Driver) => {
    setIsActionLoading(true);
    const updatedDriver = buildUpdatedDriver(driver, driverEditForm);
    try {
      await onUpdateDrivers(drivers.map(d => d.id === driver.id ? updatedDriver : d));
      const auditEntries = buildDriverAuditEntries(driver, updatedDriver, activeDriverId);
      if (auditEntries.length > 0) logFinanceAuditBatch(auditEntries);
      scheduleSuccessPulse(setSuccessPulse, driver.id);
    } catch (error) {
      console.error('Failed to update driver debt settings.', error);
    } finally {
      setIsActionLoading(false);
      setEditingDriverId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 pb-32">
      
      {/* 顶部财务汇总看板 (Compact Summary) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900 rounded-card p-5 text-white">
           <div className="flex items-center gap-2 mb-2">
              <PieChart size={14} className="text-indigo-400"/>
              <span className="text-caption font-black uppercase tracking-widest text-indigo-300">Total Outstanding</span>
           </div>
           <p className="text-xl font-black">TZS {totals.combined.toLocaleString()}</p>
           <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                 <div className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-1000" style={{ width: `${totals.startupProgress}%` }}></div>
              </div>
              <span className="text-caption font-black text-emerald-400">{totals.startupProgress.toFixed(0)}%</span>
           </div>
        </div>

        <div className="bg-white rounded-card p-5 border border-slate-200 shadow-sm">
           <div className="flex items-center gap-2 mb-2">
             <div className="p-1.5 bg-amber-50 rounded-lg text-amber-500"><Building2 size={14} /></div>
             <span className="text-caption font-black text-slate-400 uppercase">Site Startup Capital</span>
           </div>
           <p className="text-xl font-black text-slate-900">TZS {totals.startup.toLocaleString()}</p>
           <p className="text-caption font-bold text-slate-400 uppercase mt-1">{totals.activePointsCount} sites pending recovery</p>
        </div>

        <div className="bg-white rounded-card p-5 border border-slate-200 shadow-sm">
           <div className="flex items-center gap-2 mb-2">
             <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-500"><User size={14} /></div>
             <span className="text-caption font-black text-slate-400 uppercase">Personal Loans</span>
           </div>
           <p className="text-xl font-black text-slate-900">TZS {totals.driver.toLocaleString()}</p>
           <p className="text-caption font-bold text-slate-400 uppercase mt-1">{displayedDrivers.length} drivers with loans</p>
        </div>
      </div>

      {currentUser.role !== 'admin' && (
        <div className="rounded-card border border-indigo-100 bg-indigo-50 px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-500 p-2 text-white flex-shrink-0">
              <CreditCard size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-caption font-black uppercase tracking-widest text-indigo-600">
                {lang === 'zh' ? '司机预支窗口' : 'Driver Advance Window'}
              </p>
              <p className="mt-1 text-[11px] font-black text-indigo-900">
                {lang === 'zh'
                  ? '司机预支已从收款流程移出，请在这里查看个人借款与预支状态。'
                  : 'Driver advances are no longer part of collection. Review personal loans and advances here.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 1. Site Startup Capital Recovery */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><Coins size={18} /></div>
            <div>
              <h2 className="text-sm font-black text-slate-900">{t.startupRecovery}</h2>
              <p className="text-caption text-slate-400 font-bold uppercase">Machine Startup Capital Recovery</p>
            </div>
          </div>
          <span className="hidden sm:block text-caption font-black text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg uppercase"><Info size={10} className="inline mr-1"/>Auto-deducted from revenue</span>
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
                className={`rounded-card border p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden ${isFullyPaid ? 'bg-emerald-50/40 border-emerald-200' : 'bg-white border-slate-200'} ${isPulsing ? 'ring-2 ring-emerald-400/30' : ''}`}
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
                      <span className="text-caption text-slate-400 font-bold uppercase">{loc.area}</span>
                      <span className="text-slate-200">•</span>
                      <span className="text-caption font-black text-indigo-500 uppercase">{loc.machineId}</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                   <div className="bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 flex justify-between items-center relative overflow-hidden">
                      {isPulsing && <div className="absolute inset-0 bg-emerald-100/50 animate-pulse"></div>}
                      <div className="relative z-10">
                        <p className="text-caption font-black text-slate-400 uppercase mb-0.5">Balance Due</p>
                        <p className={`text-lg font-black ${isFullyPaid ? 'text-emerald-600' : 'text-slate-900'}`}>TZS {(loc.remainingStartupDebt ?? 0).toLocaleString()}</p>
                      </div>
                      <div className="text-right relative z-10">
                         <p className="text-caption font-black text-slate-400 uppercase mb-0.5">总额</p>
                         <p className="text-[10px] font-bold text-slate-500">{(loc.initialStartupDebt ?? 0).toLocaleString()}</p>
                      </div>
                   </div>
                   
                   <div className="space-y-1.5">
                     <div className="flex justify-between text-caption font-black text-slate-400 uppercase">
                        <span>Progress {progress.toFixed(0)}%</span>
                        <span className={isFullyPaid ? 'text-emerald-600' : 'text-amber-600'}>
                          {isFullyPaid ? '已结清' : 'Recovering'}
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
                                <p className="text-caption font-black text-indigo-400 uppercase">Payment Amount (TZS)</p>
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
                             {isActionLoading && <p className="text-caption font-black text-indigo-400 uppercase animate-pulse">Syncing...</p>}
                          </div>
                        ) : (
                          <button 
                            onClick={() => { setRecoveringLocId(loc.id); setRecoveryAmount(''); }}
                            className="w-full py-3 bg-white border border-slate-200 text-slate-900 rounded-2xl text-caption font-black uppercase flex items-center justify-center gap-2 hover:bg-slate-50 transition-all active:scale-[0.98]"
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
            <div className="col-span-full py-12 text-center bg-white rounded-card border border-dashed border-slate-200 flex flex-col items-center justify-center gap-3">
               <Building2 size={32} className="text-slate-200" />
               <div>
                 <p className="text-sm font-black text-slate-400 uppercase">No sites pending recovery</p>
                 <p className="text-[10px] text-slate-300 font-bold uppercase mt-0.5">All startup capital settled</p>
               </div>
            </div>
          )}
        </div>
      </section>

      {/* 2. Driver Loan Management */}
      <section className="border-t border-slate-100 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Wallet size={18} /></div>
          <div>
            <h2 className="text-sm font-black text-slate-900">{t.driverLoan}</h2>
            <p className="text-caption text-slate-400 font-bold uppercase">Personal Liabilities & Advance Payments</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedDrivers.length > 0 ? displayedDrivers.map(driver => {
            const recovered = (driver.initialDebt ?? 0) - (driver.remainingDebt ?? 0);
            const progress = (driver.initialDebt ?? 0) > 0 ? (recovered / (driver.initialDebt ?? 0)) * 100 : 100;
            const isDebtFree = (driver.remainingDebt ?? 0) === 0;
            const isEditingThis = editingDriverId === driver.id;
            const isPulsing = successPulse === driver.id;

            return (
              <div key={driver.id} className={`rounded-card border p-5 shadow-sm hover:shadow-md transition-all ${isDebtFree ? 'bg-white/50 border-slate-100' : 'bg-white border-slate-200'} ${isPulsing ? 'ring-2 ring-emerald-400/30' : ''}`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-base ${isDebtFree ? 'bg-slate-300' : 'bg-slate-900'}`}>
                    {driver.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-black text-slate-900 text-sm">{driver.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                       <span className={`px-1.5 py-0.5 rounded text-caption font-black uppercase ${isDebtFree ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                         {isDebtFree ? '已结清' : 'Owing'}
                       </span>
                       <span className="text-caption text-slate-400">{driver.phone}</span>
                    </div>
                  </div>
                  {isDebtFree && <ShieldCheck size={16} className="text-emerald-400 shrink-0" />}
                   {currentUser.role === 'admin' && (
                     <button onClick={() => isEditingThis ? setEditingDriverId(null) : openDriverEdit(driver)} className="p-1.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                       {isEditingThis ? <X size={14}/> : <Pencil size={14}/>}
                     </button>
                   )}
                </div>

                <div className="space-y-3">
                   {isEditingThis ? (
                     <div className="space-y-3 bg-slate-900 p-4 rounded-2xl animate-in slide-in-from-top-2">
                       <p className="text-caption font-black text-indigo-400 uppercase">修改财务数据 Edit Financial Data</p>
                       <div className="space-y-2">
                         <div>
                           <label className="text-caption font-black text-slate-400 uppercase mb-1 block">当前欠款 Current Debt (TZS)</label>
                           <input
                             type="number"
                             value={driverEditForm.remainingDebt}
                             onChange={e => setDriverEditForm(f => ({...f, remainingDebt: e.target.value}))}
                             className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm font-black text-white outline-none focus:border-indigo-500"
                           />
                         </div>
                         <div>
                           <label className="text-caption font-black text-slate-400 uppercase mb-1 block">随身硬币 Coin Float (TZS)</label>
                           <input
                             type="number"
                             value={driverEditForm.dailyFloatingCoins}
                             onChange={e => setDriverEditForm(f => ({...f, dailyFloatingCoins: e.target.value}))}
                             className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm font-black text-white outline-none focus:border-indigo-500"
                           />
                         </div>
                       </div>
                       <button
                         onClick={() => handleDriverDebtSave(driver)}
                         disabled={isActionLoading}
                         className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-caption font-black uppercase flex items-center justify-center gap-2"
                       >
                         {isActionLoading ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                         Save Changes
                       </button>
                     </div>
                   ) : (
                     <>
                       <div className="bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 flex justify-between items-center relative overflow-hidden">
                          {isPulsing && <div className="absolute inset-0 bg-emerald-100/50 animate-pulse"></div>}
                          <div className="relative z-10">
                             <p className="text-caption font-black text-slate-400 uppercase mb-0.5">Current Debt</p>
                             <p className={`text-lg font-black ${isDebtFree ? 'text-emerald-600' : 'text-slate-900'}`}>TZS {(driver.remainingDebt ?? 0).toLocaleString()}</p>
                          </div>
                          <CreditCard size={16} className="text-slate-200 relative z-10" />
                       </div>

                       <div className="space-y-1.5">
                          <div className="flex justify-between text-caption font-black text-slate-400 uppercase">
                            <span>Progress {progress.toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-1000 ${isDebtFree ? 'bg-emerald-500' : 'bg-indigo-500'}`} 
                              style={{ width: `${progress}%` }} 
                            />
                          </div>
                       </div>

                       <div className="grid grid-cols-3 gap-2">
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                             <p className="text-caption font-black text-slate-400 uppercase mb-0.5">Base Salary</p>
                             <p className="text-[10px] font-bold text-slate-700">TZS {(driver.baseSalary ?? 300000).toLocaleString()}</p>
                          </div>
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                             <p className="text-caption font-black text-slate-400 uppercase mb-0.5">Commission</p>
                             <p className="text-[10px] font-bold text-slate-700">{((driver.commissionRate ?? 0.05) * 100).toFixed(0)}%</p>
                          </div>
                          <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-100">
                             <p className="text-caption font-black text-emerald-400 uppercase mb-0.5">Coins</p>
                             <p className="text-[10px] font-bold text-emerald-700">{(driver.dailyFloatingCoins ?? 0).toLocaleString()}</p>
                          </div>
                       </div>
                     </>
                   )}
                </div>
              </div>
            );
          }) : (
            <div className="col-span-full py-10 text-center text-slate-300">
              <p className="text-caption font-black uppercase">No driver loans found</p>
            </div>
          )}
        </div>
      </section>

      {/* Footer Info */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-start gap-3 max-w-2xl mx-auto">
         <AlertCircle size={16} className="text-indigo-500 shrink-0 mt-0.5" />
         <p className="text-caption text-slate-500 font-bold leading-relaxed">Startup capital is auto-deducted from each collection. Manual repayment for large lump sum settlements only. All records sync to daily settlement.</p>
      </div>

      {currentUser.role === 'admin' && <FinanceAuditPanel lang={lang} />}
    </div>
  );
};

export default DebtManager;
