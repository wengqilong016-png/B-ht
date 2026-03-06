import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Transaction, Driver, Location, DailySettlement, User, CONSTANTS, AILog, TRANSLATIONS } from './types';
import Dashboard from './components/Dashboard';
import CollectionForm from './components/CollectionForm';
import MachineRegistrationForm from './components/MachineRegistrationForm';
import TransactionHistory from './components/TransactionHistory';
import Login from './components/Login';
import FinancialReports from './components/FinancialReports';
import AIHub from './components/AIHub';
import DebtManager from './components/DebtManager';
import { 
  LayoutDashboard, PlusCircle, CreditCard, PieChart, Brain, 
  LogOut, Globe, Loader2, CloudOff, 
  CheckSquare, Crown, ShieldCheck, AlertTriangle
} from 'lucide-react';
import { supabase, checkDbHealth } from './supabaseClient';
import { Analytics } from '@vercel/analytics/react';

// Safe localStorage wrapper – iOS Safari private mode throws QuotaExceededError on writes
const safeSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('localStorage.setItem failed (private browsing?)', e);
  }
};

// Global ErrorBoundary to prevent full white-screen on any render crash
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, error: err?.message || String(err) };
  }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#f8fafc', padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h1 style={{ fontWeight: 900, fontSize: '1.25rem', marginBottom: '0.5rem' }}>Something went wrong</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.75rem', maxWidth: '320px', marginBottom: '1.5rem' }}>{this.state.error}</p>
          <button onClick={() => window.location.reload()} style={{ background: '#f59e0b', color: '#0f172a', fontWeight: 900, padding: '0.75rem 2rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer' }}>
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const INITIAL_DRIVERS: Driver[] = [
  { id: 'D-NUDIN', name: 'Nudin', username: 'nudin', password: '123', phone: '+255 62 691 4141', initialDebt: 0, remainingDebt: 0, dailyFloatingCoins: 10000, vehicleInfo: { model: 'TVS King', plate: 'T 111 AAA' }, status: 'active', baseSalary: 300000, commissionRate: 0.05 },
  { id: 'D-RAJABU', name: 'Rajabu', username: 'rajabu', password: '123', phone: '+255 65 106 4066', initialDebt: 0, remainingDebt: 0, dailyFloatingCoins: 10000, vehicleInfo: { model: 'Bajaj', plate: 'T 222 BBB' }, status: 'active', baseSalary: 300000, commissionRate: 0.05 },
];

const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'collect' | 'register' | 'history' | 'reports' | 'ai' | 'debt' | 'settlement'>('dashboard');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [lang, setLang] = useState<'zh' | 'sw'>('zh');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  
  const [aiContextId, setAiContextId] = useState<string>('');
  const t = TRANSLATIONS[lang];

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>(INITIAL_DRIVERS);
  const [locations, setLocations] = useState<Location[]>([]);
  const [dailySettlements, setDailySettlements] = useState<DailySettlement[]>([]);
  const [aiLogs, setAiLogs] = useState<AILog[]>([]);
  
  const transactionsRef = useRef(transactions);
  const dailySettlementsRef = useRef(dailySettlements);
  const aiLogsRef = useRef(aiLogs);
  const locationsRef = useRef(locations);
  const isSyncingRef = useRef(isSyncing);

  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);
  useEffect(() => { dailySettlementsRef.current = dailySettlements; }, [dailySettlements]);
  useEffect(() => { aiLogsRef.current = aiLogs; }, [aiLogs]);
  useEffect(() => { locationsRef.current = locations; }, [locations]);
  useEffect(() => { isSyncingRef.current = isSyncing; }, [isSyncing]);

  const loadFromLocalStorage = () => {
    try {
      const locs = localStorage.getItem(CONSTANTS.STORAGE_LOCATIONS_KEY);
      const drvs = localStorage.getItem(CONSTANTS.STORAGE_DRIVERS_KEY);
      const txs = localStorage.getItem(CONSTANTS.STORAGE_TRANSACTIONS_KEY);
      const stl = localStorage.getItem(CONSTANTS.STORAGE_SETTLEMENTS_KEY);
      const logs = localStorage.getItem(CONSTANTS.STORAGE_AI_LOGS_KEY);

      if (locs) {
        const p = JSON.parse(locs);
        if (Array.isArray(p)) setLocations(p);
      }
      if (drvs) {
        const p = JSON.parse(drvs);
        if (Array.isArray(p)) setDrivers(p);
      }
      if (txs) {
        const p = JSON.parse(txs);
        if (Array.isArray(p)) setTransactions(p);
      }
      if (stl) {
        const p = JSON.parse(stl);
        if (Array.isArray(p)) setDailySettlements(p);
      }
      if (logs) {
        const p = JSON.parse(logs);
        if (Array.isArray(p)) setAiLogs(p);
      }
    } catch (e) {
      console.error("Local storage load failed", e);
    }
  };

  const fetchAllData = async () => {
    const online = await checkDbHealth();
    setIsOnline(online);

    if (online && supabase) {
      try {
        const [resLoc, resDrivers, resTx, resSettlement, resLogs] = await Promise.all([
          supabase.from('locations').select('*'),
          supabase.from('drivers').select('*'),
          supabase.from('transactions').select('*').order('timestamp', { ascending: false }).limit(200),
          supabase.from('daily_settlements').select('*').order('timestamp', { ascending: false }).limit(30),
          supabase.from('ai_logs').select('*').order('timestamp', { ascending: false }).limit(50)
        ]);

        if (resLoc.data) setLocations(resLoc.data);
        if (resDrivers.data) setDrivers(resDrivers.data);
        if (resTx.data) setTransactions(resTx.data.map(t => ({...t, isSynced: true})));
        if (resSettlement.data) setDailySettlements(resSettlement.data.map(s => ({...s, isSynced: true})));
        if (resLogs.data) setAiLogs(resLogs.data.map(l => ({...l, isSynced: true})));
      } catch (err) {
        console.error("Supabase fetch failed, using local backup", err);
        loadFromLocalStorage();
      }
    } else {
      loadFromLocalStorage();
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAllData();
    const timer = setInterval(async () => {
      const online = await checkDbHealth();
      setIsOnline(online);
      if (online && !isSyncingRef.current) syncOfflineData();
      
      // NEW: Heartbeat for Active Drivers (Safari compatibility added)
      if (online && supabase && currentUser?.role === 'driver') {
        if ('geolocation' in navigator) {
           navigator.geolocation.getCurrentPosition((pos) => {
              const { latitude, longitude } = pos.coords;
              supabase.from('drivers').update({ 
                lastActive: new Date().toISOString(),
                currentGps: { lat: latitude, lng: longitude }
              }).eq('id', currentUser.id);
           }, (err) => {
              console.warn("GPS Heartbeat failed (Silent)", err.message);
           }, { enableHighAccuracy: false, timeout: 5000 });
        }
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [currentUser]);

  useEffect(() => {
    safeSetItem(CONSTANTS.STORAGE_LOCATIONS_KEY, JSON.stringify(locations));
  }, [locations]);
  useEffect(() => {
    safeSetItem(CONSTANTS.STORAGE_DRIVERS_KEY, JSON.stringify(drivers));
  }, [drivers]);
  useEffect(() => {
    safeSetItem(CONSTANTS.STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));
  }, [transactions]);
  useEffect(() => {
    safeSetItem(CONSTANTS.STORAGE_SETTLEMENTS_KEY, JSON.stringify(dailySettlements));
  }, [dailySettlements]);
  useEffect(() => {
    safeSetItem(CONSTANTS.STORAGE_AI_LOGS_KEY, JSON.stringify(aiLogs));
  }, [aiLogs]);

  const syncOfflineData = async () => {
    if (isSyncingRef.current || !supabase) return;
    setIsSyncing(true);
    try {
        const offlineTx = transactionsRef.current.filter(t => !t.isSynced);
        if (offlineTx.length > 0) {
            const { error } = await supabase.from('transactions').upsert(offlineTx.map(item => ({ ...item, isSynced: true })));
            if (!error) {
                const syncedIds = new Set(offlineTx.map(t => t.id));
                setTransactions(prev => prev.map(t => {
                    if (syncedIds.has(t.id)) {
                        // 同步成功后清理本地图片的 Base64 数据，防止 localStorage 溢出
                        const { photoUrl, ...rest } = t;
                        return { ...rest, isSynced: true };
                    }
                    return t;
                }));
            }
        }
        const offlineSettlements = dailySettlementsRef.current.filter(s => !s.isSynced);
        if (offlineSettlements.length > 0) {
            const { error } = await supabase.from('daily_settlements').upsert(offlineSettlements.map(item => ({ ...item, isSynced: true })));
            if (!error) {
                const syncedIds = new Set(offlineSettlements.map(s => s.id));
                setDailySettlements(prev => prev.map(s => syncedIds.has(s.id) ? { ...s, isSynced: true } : s));
            }
        }
        const offlineLogs = aiLogsRef.current.filter(l => !l.isSynced);
        if (offlineLogs.length > 0) {
            const { error } = await supabase.from('ai_logs').upsert(offlineLogs.map(item => ({ ...item, isSynced: true })));
            if (!error) {
                const syncedIds = new Set(offlineLogs.map(l => l.id));
                setAiLogs(prev => prev.map(l => {
                    if (syncedIds.has(l.id)) {
                        // 同步成功后清理 AI 日志的图片数据
                        const { imageUrl, ...rest } = l;
                        return { ...rest, isSynced: true };
                    }
                    return l;
                }));
            }
        }
        const offlineLocs = locationsRef.current.filter(l => l.isSynced === false);
        if (offlineLocs.length > 0) {
            const { error } = await supabase.from('locations').upsert(offlineLocs.map(item => ({ ...item, isSynced: true })));
            if (!error) {
                const syncedIds = new Set(offlineLocs.map(l => l.id));
                setLocations(prev => prev.map(l => syncedIds.has(l.id) ? { ...l, isSynced: true } : l));
            }
        }
    } catch (err) {
        console.error("Batch sync process failed", err);
    } finally {
        setIsSyncing(false);
    }
  };

  const handleUpdateDrivers = async (updatedDrivers: Driver[]) => {
    setDrivers(updatedDrivers);
    if (isOnline && supabase) {
       const results = await Promise.all(updatedDrivers.map(d => {
          const { stats, ...driverToSave } = d as any;
          return supabase.from('drivers').upsert({...driverToSave, isSynced: true});
       }));
       results.forEach(({ error }) => {
         if (error) console.error("Error upserting driver:", error.message, error.details);
       });
    }
  };

  const handleUpdateLocations = async (updatedLocations: Location[]) => {
    setLocations(updatedLocations);
    if (isOnline && supabase) {
       await Promise.all(updatedLocations.map(l => supabase.from('locations').upsert({...l, isSynced: true})));
    }
  };

  const handleDeleteLocations = async (ids: string[]) => {
    // 1. 本地删除
    setLocations(prev => prev.filter(l => !ids.includes(l.id)));
    
    // 2. 云端物理删除
    if (isOnline && supabase) {
      const { error } = await supabase.from('locations').delete().in('id', ids);
      if (error) console.error("Cloud delete failed:", error.message);
      else console.log(`Successfully deleted ${ids.length} locations from cloud.`);
    }
  };

  const handleUpdateTransaction = async (txId: string, updates: Partial<Transaction>) => {
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, ...updates, isSynced: false } : t));
    if (isOnline && supabase) {
        const tx = transactionsRef.current.find(t => t.id === txId);
        if (tx) {
            const { error } = await supabase.from('transactions').upsert({...tx, ...updates, isSynced: true});
            if (!error) setTransactions(prev => prev.map(t => t.id === txId ? { ...t, ...updates, isSynced: true } : t));
        }
    }
  };

  const handleNewTransaction = async (tx: Transaction) => {
    const txToSave = { ...tx, isSynced: false };
    setTransactions(prev => [txToSave, ...prev]);
    
    // Handle special transaction types
    if (tx.type === 'reset_request') {
      // Lock the machine when a reset request is submitted
      setLocations(prev => prev.map(l => 
        l.id === tx.locationId ? { ...l, resetLocked: true, isSynced: false } : l
      ));
      if (isOnline && supabase) {
        const { error } = await supabase.from('transactions').upsert({...tx, isSynced: true});
        if (!error) {
          setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, isSynced: true } : t));
          await supabase.from('locations').update({ resetLocked: true, isSynced: true }).eq('id', tx.locationId);
          setLocations(prev => prev.map(l => l.id === tx.locationId ? { ...l, resetLocked: true, isSynced: true } : l));
        }
      }
      return;
    }

    if (tx.type === 'payout_request') {
      // Payout requests don't affect scores or debt
      if (isOnline && supabase) {
        const { error } = await supabase.from('transactions').upsert({...tx, isSynced: true});
        if (!error) setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, isSynced: true } : t));
      }
      return;
    }

    // Default: Update local locations state: both score AND remaining debt
    // Auto-approval pipeline: small transactions with no AI anomaly get auto-approved
    const AUTO_APPROVE_THRESHOLD = 2000; // TZS
    const isSmallAmount = tx.revenue <= AUTO_APPROVE_THRESHOLD;
    const hasNoAnomaly = !tx.isAnomaly;
    const autoApproved = isSmallAmount && hasNoAnomaly;
    
    const finalTx = autoApproved ? { ...txToSave, approvalStatus: 'auto-approved' as const } : txToSave;
    if (autoApproved) {
      setTransactions(prev => prev.map(t => t.id === tx.id ? finalTx : t));
    }

    setLocations(prev => prev.map(l => 
      l.id === tx.locationId 
        ? { 
            ...l, 
            lastScore: tx.currentScore, 
            remainingStartupDebt: Math.max(0, l.remainingStartupDebt - (tx.startupDebtDeduction || 0)),
            isSynced: false 
          } 
        : l
    ));

    if (isOnline && supabase) {
       const txToUpsert = { ...finalTx, isSynced: true };
       const { error } = await supabase.from('transactions').upsert(txToUpsert);
       if (!error) {
          setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, ...txToUpsert } : t));
          
          // Get current state to ensure accuracy
          const currentLoc = locationsRef.current.find(l => l.id === tx.locationId);
          if (currentLoc) {
            const newDebt = Math.max(0, currentLoc.remainingStartupDebt - (tx.startupDebtDeduction || 0));
            await supabase.from('locations').update({ 
              lastScore: tx.currentScore, 
              remainingStartupDebt: newDebt,
              isSynced: true 
            }).eq('id', tx.locationId);
            
            setLocations(prev => prev.map(l => l.id === tx.locationId ? { ...l, lastScore: tx.currentScore, remainingStartupDebt: newDebt, isSynced: true } : l));
          }
       }
    }
  };

  const handleSaveSettlement = async (settlement: DailySettlement) => {
    const stlToSave = { ...settlement, isSynced: false };
    setDailySettlements(prev => {
      const exists = prev.find(s => s.id === settlement.id);
      if (exists) return prev.map(s => s.id === settlement.id ? stlToSave : s);
      return [stlToSave, ...prev];
    });

    // 逻辑修正：明天的起始硬币 = 今天的实际硬币余数 (Roll Over Balance)
    const nextDayStartingCoins = settlement.actualCoins || 0;

    const updateDriverCoinBalance = (driverId: string, balance: number) => {
      setDrivers(prev => prev.map(d => 
        d.id === driverId ? { ...d, dailyFloatingCoins: balance, isSynced: false } : d
      ));
    };

    if (isOnline && supabase) {
       const { error } = await supabase.from('daily_settlements').upsert({...settlement, isSynced: true});
       if (!error) {
          setDailySettlements(prev => prev.map(s => s.id === settlement.id ? { ...settlement, isSynced: true } : s));
          
          // 更新司机明天的起始余额到远程数据库
          await supabase.from('drivers').update({ dailyFloatingCoins: nextDayStartingCoins }).eq('id', settlement.driverId);
          updateDriverCoinBalance(settlement.driverId, nextDayStartingCoins);
       }
    } else {
       updateDriverCoinBalance(settlement.driverId, nextDayStartingCoins);
    }
  };

  const handleLogAI = async (log: AILog) => {
    const logToSave = { ...log, isSynced: false };
    setAiLogs(prev => [logToSave, ...prev]);
    if (isOnline && supabase) {
      const { error } = await supabase.from('ai_logs').insert({ ...log, isSynced: true });
      if (!error) setAiLogs(prev => prev.map(l => l.id === log.id ? { ...l, isSynced: true } : l));
    }
  };

  const handleUserLogin = (user: User) => {
    setCurrentUser(user);
    setLang(user.role === 'admin' ? 'zh' : 'sw');
    if (user.role === 'driver') setView('collect');
  };

  const unsyncedCount = (Array.isArray(transactions) ? transactions.filter(t => !t.isSynced).length : 0) + 
                       (Array.isArray(dailySettlements) ? dailySettlements.filter(s => !s.isSynced).length : 0) + 
                       (Array.isArray(aiLogs) ? aiLogs.filter(l => !l.isSynced).length : 0);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900">
        <Loader2 size={48} className="text-amber-400 animate-spin mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/50">Bahati Engine Initializing...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Login drivers={drivers} onLogin={handleUserLogin} lang={lang} onSetLang={setLang} />;
  }

  // 1. 数据过滤逻辑：仅在 currentUser 存在时执行，且放在 return 之后是错误的，
  // 但我们通过在顶层始终定义 Hook，内部判断逻辑来修复。
  const filteredData = {
    locations: currentUser.role === 'admin' ? (Array.isArray(locations) ? locations : []) : (Array.isArray(locations) ? locations.filter(l => l.assignedDriverId === currentUser.id) : []),
    transactions: currentUser.role === 'admin' ? (Array.isArray(transactions) ? transactions : []) : (Array.isArray(transactions) ? transactions.filter(t => t.driverId === currentUser.id) : []),
    dailySettlements: currentUser.role === 'admin' ? (Array.isArray(dailySettlements) ? dailySettlements : []) : (Array.isArray(dailySettlements) ? dailySettlements.filter(s => s.driverId === currentUser.id) : []),
    drivers: currentUser.role === 'admin' ? (Array.isArray(drivers) ? drivers : []) : (Array.isArray(drivers) ? drivers.filter(d => d.id === currentUser.id) : []),
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 border-b border-white/10 p-4 sticky top-0 z-40 shadow-xl safe-top">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="bg-gradient-to-br from-amber-300 to-amber-600 text-slate-900 p-2 rounded-xl">
               <Crown size={20} fill="currentColor" />
             </div>
             <div className="hidden sm:block">
               <div className="flex items-center gap-2">
                 <h1 className="text-sm font-black text-white">BAHATI JACKPOTS</h1>
                 <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[8px] font-black ${isOnline ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'}`}>
                   {isOnline ? 'ONLINE' : 'LOCAL'}
                 </div>
               </div>
               <p className="text-[9px] font-bold text-slate-400 uppercase">{currentUser.role} • {currentUser.name}</p>
             </div>
          </div>
          
          <div className="flex items-center gap-2">
             <button onClick={syncOfflineData} disabled={isSyncing || !isOnline} className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all shadow-lg border ${isSyncing ? 'bg-slate-800 text-indigo-400' : !isOnline ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : unsyncedCount > 0 ? 'bg-amber-50 text-slate-900 border-amber-600 animate-pulse' : 'bg-emerald-50/10 text-emerald-400 border-emerald-500/20'}`}>
                {isSyncing ? <Loader2 size={16} className="animate-spin" /> : !isOnline ? <CloudOff size={16} /> : unsyncedCount > 0 ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
                <div className="flex flex-col items-start leading-none">
                   <span className="text-[10px] font-black uppercase">{isSyncing ? 'Syncing...' : !isOnline ? 'Offline' : unsyncedCount > 0 ? 'Pending' : 'Synced'}</span>
                </div>
             </button>
             <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="p-2 bg-white/10 rounded-xl text-white hover:bg-white/20"><Globe size={18} /></button>
             <button onClick={() => setCurrentUser(null)} className="p-2 bg-rose-500/20 rounded-xl text-rose-400"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-3 sm:p-4 lg:p-8 pb-32 overflow-x-hidden">
        {(view === 'dashboard' || view === 'settlement') && (
          <Dashboard 
            transactions={filteredData.transactions} 
            drivers={filteredData.drivers} 
            locations={filteredData.locations} 
            dailySettlements={filteredData.dailySettlements} 
            aiLogs={aiLogs} 
            currentUser={currentUser} 
            onUpdateDrivers={handleUpdateDrivers} 
            onUpdateLocations={handleUpdateLocations} 
            onDeleteLocations={handleDeleteLocations} 
            onUpdateTransaction={handleUpdateTransaction}
            onNewTransaction={handleNewTransaction} 
            onSaveSettlement={handleSaveSettlement} 
            onSync={syncOfflineData} 
            isSyncing={isSyncing} 
            offlineCount={unsyncedCount} 
            lang={lang}
            onNavigate={(v) => setView(v)}
            initialTab={view === 'settlement' ? 'settlement' : 'overview'}
          />
        )}
        {view === 'collect' && (
          <CollectionForm 
            locations={filteredData.locations} 
            currentDriver={drivers.find(d => d.id === currentUser.id) || drivers[0]} 
            onSubmit={handleNewTransaction} 
            lang={lang} 
            onLogAI={handleLogAI}
            onRegisterMachine={async (loc) => { 
                const newLoc = { ...loc, isSynced: false, assignedDriverId: currentUser.id };
                setLocations([...locations, newLoc]); 
                if (isOnline && supabase) {
                   const { error } = await supabase.from('locations').insert({...newLoc, isSynced: true});
                   if (!error) setLocations(prev => prev.map(l => l.id === newLoc.id ? {...l, isSynced: true} : l));
                }
            }}
          />
        )}
        {view === 'history' && <TransactionHistory transactions={filteredData.transactions} locations={locations} onAnalyze={(id) => {}} />}
        {view === 'reports' && <FinancialReports transactions={filteredData.transactions} drivers={filteredData.drivers} locations={filteredData.locations} dailySettlements={filteredData.dailySettlements} lang={lang} />}
        {view === 'debt' && <DebtManager drivers={filteredData.drivers} locations={filteredData.locations} currentUser={currentUser} onUpdateLocations={handleUpdateLocations} lang={lang} />}
        {view === 'ai' && currentUser.role === 'admin' && (
          <AIHub
            drivers={filteredData.drivers}
            locations={filteredData.locations}
            transactions={filteredData.transactions}
            onLogAI={handleLogAI}
            currentUser={currentUser}
            initialContextId={aiContextId}
            onClearContext={() => setAiContextId('')}
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 p-2 z-50 shadow-lg safe-bottom">
        <div className="max-w-2xl mx-auto flex justify-around items-center">
           {currentUser.role === 'admin' && <NavItem icon={<LayoutDashboard size={20}/>} label="Admin" active={view === 'dashboard'} onClick={() => setView('dashboard')} />}
           <NavItem icon={<PlusCircle size={20}/>} label={currentUser.role === 'admin' ? 'Collect' : t.collect} active={view === 'collect'} onClick={() => setView('collect')} />
           <NavItem icon={<CheckSquare size={20}/>} label={currentUser.role === 'admin' ? 'Approve' : t.dailySettlement} active={view === 'settlement'} onClick={() => setView('settlement')} />
           <NavItem icon={<CreditCard size={20}/>} label={currentUser.role === 'admin' ? 'Finance' : t.debt} active={view === 'debt'} onClick={() => setView('debt')} />
           {currentUser.role === 'admin' && <NavItem icon={<PieChart size={20}/>} label="Reports" active={view === 'reports'} onClick={() => setView('reports')} />}
           {currentUser.role === 'admin' && <NavItem icon={<Brain size={20}/>} label="AI Audit" active={view === 'ai'} onClick={() => setView('ai')} />}
        </div>
      </nav>
      <Analytics />
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center p-3 rounded-2xl transition-all ${active ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}>
    {icon}
    <span className="text-[8px] font-black uppercase mt-1">{label}</span>
  </button>
);

const AppWithBoundary: React.FC = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default AppWithBoundary;
