
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
  LogOut, Globe, Loader2, RefreshCw, CloudOff, 
  CheckSquare, Crown, ShieldCheck, AlertTriangle, AlertCircle, Database, Settings
} from 'lucide-react';
import { supabase, checkDbHealth, SUPABASE_URL } from './supabaseClient';

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
    const locs = localStorage.getItem(CONSTANTS.STORAGE_LOCATIONS_KEY);
    const drvs = localStorage.getItem(CONSTANTS.STORAGE_DRIVERS_KEY);
    const txs = localStorage.getItem(CONSTANTS.STORAGE_TRANSACTIONS_KEY);
    const stl = localStorage.getItem(CONSTANTS.STORAGE_SETTLEMENTS_KEY);
    const logs = localStorage.getItem(CONSTANTS.STORAGE_AI_LOGS_KEY);

    if (locs) setLocations(JSON.parse(locs));
    if (drvs) setDrivers(JSON.parse(drvs));
    if (txs) setTransactions(JSON.parse(txs));
    if (stl) setDailySettlements(JSON.parse(stl));
    if (logs) setAiLogs(JSON.parse(logs));
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
    }, 20000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(CONSTANTS.STORAGE_LOCATIONS_KEY, JSON.stringify(locations));
    localStorage.setItem(CONSTANTS.STORAGE_DRIVERS_KEY, JSON.stringify(drivers));
    localStorage.setItem(CONSTANTS.STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));
    localStorage.setItem(CONSTANTS.STORAGE_SETTLEMENTS_KEY, JSON.stringify(dailySettlements));
    localStorage.setItem(CONSTANTS.STORAGE_AI_LOGS_KEY, JSON.stringify(aiLogs));
  }, [locations, drivers, transactions, dailySettlements, aiLogs]);

  const syncOfflineData = async () => {
    if (isSyncingRef.current || !supabase) return;
    setIsSyncing(true);
    try {
        const offlineTx = transactionsRef.current.filter(t => !t.isSynced);
        for (const item of offlineTx) {
            const { error } = await supabase.from('transactions').upsert({ ...item, isSynced: true });
            if (!error) setTransactions(prev => prev.map(t => t.id === item.id ? { ...t, isSynced: true } : t));
        }
        const offlineSettlements = dailySettlementsRef.current.filter(s => !s.isSynced);
        for (const item of offlineSettlements) {
             const { error } = await supabase.from('daily_settlements').upsert({ ...item, isSynced: true });
             if (!error) setDailySettlements(prev => prev.map(s => s.id === item.id ? { ...s, isSynced: true } : s));
        }
        const offlineLogs = aiLogsRef.current.filter(l => !l.isSynced);
        for (const item of offlineLogs) {
             const { error } = await supabase.from('ai_logs').upsert({ ...item, isSynced: true });
             if (!error) setAiLogs(prev => prev.map(l => l.id === item.id ? { ...l, isSynced: true } : l));
        }
        const offlineLocs = locationsRef.current.filter(l => l.isSynced === false);
        for (const item of offlineLocs) {
             const { error } = await supabase.from('locations').upsert({ ...item, isSynced: true });
             if (!error) setLocations(prev => prev.map(l => l.id === item.id ? { ...l, isSynced: true } : l));
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
       for (const d of updatedDrivers) {
          const { stats, ...driverToSave } = d as any;
          const { error } = await supabase.from('drivers').upsert({...driverToSave, isSynced: true});
          if (error) {
            console.error("Error upserting driver:", error.message, error.details);
          }
       }
    }
  };

  const handleUpdateLocations = async (updatedLocations: Location[]) => {
    setLocations(updatedLocations);
    if (isOnline && supabase) {
       for (const l of updatedLocations) {
          await supabase.from('locations').upsert({...l, isSynced: true});
       }
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
    setLocations(prev => prev.map(l => l.id === tx.locationId ? { ...l, lastScore: tx.currentScore, isSynced: false } : l));

    if (isOnline && supabase) {
       const { error } = await supabase.from('transactions').upsert({...tx, isSynced: true});
       if (!error) {
          setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, isSynced: true } : t));
          await supabase.from('locations').update({ lastScore: tx.currentScore, isSynced: true }).eq('id', tx.locationId);
          setLocations(prev => prev.map(l => l.id === tx.locationId ? { ...l, lastScore: tx.currentScore, isSynced: true } : l));
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

    if (isOnline && supabase) {
       const { error } = await supabase.from('daily_settlements').upsert({...settlement, isSynced: true});
       if (!error) {
          setDailySettlements(prev => prev.map(s => s.id === settlement.id ? { ...settlement, isSynced: true } : s));
       }
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

  // Helper to show configuration guidance if env vars are missing
  if (!SUPABASE_URL && !isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-amber-500/20 text-amber-500 rounded-3xl flex items-center justify-center mb-6 border border-amber-500/30">
          <Database size={40} />
        </div>
        <h1 className="text-white text-2xl font-black mb-4 uppercase tracking-tight">数据库配置未就绪</h1>
        <p className="text-slate-400 text-sm max-w-sm mb-8 leading-relaxed">
          应用检测到缺少 Supabase 环境变量。请在 Vercel 部署设置中添加 <code className="text-amber-500">NEXT_PUBLIC_SUPABASE_URL</code> 和 <code className="text-amber-500">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>。
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
           <button onClick={() => setIsLoading(true)} className="w-full py-4 bg-white text-slate-900 font-black rounded-2xl flex items-center justify-center gap-2">
              <RefreshCw size={18}/> 检查配置并刷新
           </button>
           <button onClick={() => { (window as any).location.reload() }} className="w-full py-4 bg-white/5 text-white/40 border border-white/10 rounded-2xl flex items-center justify-center gap-2">
              <Settings size={18}/> 管理环境变量
           </button>
        </div>
      </div>
    );
  }

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

  const unsyncedCount = transactions.filter(t => !t.isSynced).length + dailySettlements.filter(s => !s.isSynced).length + aiLogs.filter(l => !l.isSynced).length;

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

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 lg:p-8 pb-32">
        {(view === 'dashboard' || view === 'settlement') && (
          <Dashboard 
            transactions={transactions} 
            drivers={drivers} 
            locations={locations} 
            dailySettlements={dailySettlements} 
            aiLogs={aiLogs} 
            currentUser={currentUser} 
            onUpdateDrivers={handleUpdateDrivers} 
            onUpdateLocations={handleUpdateLocations} 
            onUpdateTransaction={handleUpdateTransaction}
            onNewTransaction={handleNewTransaction} 
            onSaveSettlement={handleSaveSettlement} 
            onSync={syncOfflineData} 
            isSyncing={isSyncing} 
            offlineCount={unsyncedCount} 
            lang={lang}
            onNavigate={(v) => setView(v)}
          />
        )}
        {view === 'collect' && (
          <CollectionForm 
            locations={locations} 
            currentDriver={drivers.find(d => d.id === currentUser.id) || drivers[0]} 
            onSubmit={handleNewTransaction} 
            lang={lang} 
            onLogAI={handleLogAI}
            onRegisterMachine={async (loc) => { 
                const newLoc = { ...loc, isSynced: false };
                setLocations([...locations, newLoc]); 
                if (isOnline && supabase) {
                   await supabase.from('locations').insert({...newLoc, isSynced: true});
                   setLocations(prev => prev.map(l => l.id === newLoc.id ? {...l, isSynced: true} : l));
                }
            }}
          />
        )}
        {view === 'history' && <TransactionHistory transactions={transactions} onAnalyze={(id) => { setAiContextId(id); setView('ai'); }} />}
        {view === 'ai' && <AIHub drivers={drivers} locations={locations} transactions={transactions} onLogAI={handleLogAI} currentUser={currentUser} initialContextId={aiContextId} onClearContext={() => setAiContextId('')} />}
        {view === 'reports' && <FinancialReports transactions={transactions} drivers={drivers} locations={locations} dailySettlements={dailySettlements} lang={lang} />}
        {view === 'debt' && <DebtManager drivers={drivers} locations={locations} currentUser={currentUser} onUpdateLocations={handleUpdateLocations} lang={lang} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 p-2 z-50 shadow-lg safe-bottom">
        <div className="max-w-2xl mx-auto flex justify-around items-center">
           {currentUser.role === 'admin' && <NavItem icon={<LayoutDashboard size={20}/>} label="Admin" active={view === 'dashboard'} onClick={() => setView('dashboard')} />}
           <NavItem icon={<PlusCircle size={20}/>} label={t.collect} active={view === 'collect'} onClick={() => setView('collect')} />
           <NavItem icon={<CheckSquare size={20}/>} label={t.dailySettlement} active={view === 'settlement'} onClick={() => setView('settlement')} />
           <NavItem icon={<CreditCard size={20}/>} label={t.debt} active={view === 'debt'} onClick={() => setView('debt')} />
           {currentUser.role === 'admin' && <NavItem icon={<PieChart size={20}/>} label={t.reports} active={view === 'reports'} onClick={() => setView('reports')} />}
           {currentUser.role === 'admin' && <NavItem icon={<Brain size={20}/>} label="AI" active={view === 'ai'} onClick={() => setView('ai')} />}
        </div>
      </nav>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center p-3 rounded-2xl transition-all ${active ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}>
    {icon}
    <span className="text-[8px] font-black uppercase mt-1">{label}</span>
  </button>
);

export default App;
