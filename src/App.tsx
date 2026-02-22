import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Transaction, Driver, Location, DailySettlement, User, CONSTANTS, AILog, TRANSLATIONS } from './types';
import Dashboard from './components/Dashboard';
import CollectionForm from './components/CollectionForm';
import MachineRegistrationForm from './components/MachineRegistrationForm';
import TransactionHistory from './components/TransactionHistory';
import Login from './components/Login';
import FinancialReports from './components/FinancialReports';
import AIHub from './components/AIHub';
import SupportTicketSystem from './components/SupportTicketSystem';
import DebtManager from './components/DebtManager';
import ClearanceForm from './components/ClearanceForm';
import { 
  LayoutDashboard, PlusCircle, CreditCard, PieChart, Brain, 
  LogOut, Globe, Loader2, CloudOff, 
  CheckSquare, Crown, ShieldCheck, AlertTriangle, MessageSquare, RefreshCw
} from 'lucide-react';
import { supabase, checkDbHealth } from './supabaseClient';

const INITIAL_DRIVERS: Driver[] = [
  { id: 'D-NUDIN', name: 'Nudin', username: 'nudin', password: '123', phone: '+255 62 691 4141', initialDebt: 0, remainingDebt: 0, dailyFloatingCoins: 10000, vehicleInfo: { model: 'TVS King', plate: 'T 111 AAA' }, status: 'active', baseSalary: 300000, commissionRate: 0.05 },
  { id: 'D-RAJABU', name: 'Rajabu', username: 'rajabu', password: '123', phone: '+255 65 106 4066', initialDebt: 0, remainingDebt: 0, dailyFloatingCoins: 10000, vehicleInfo: { model: 'Bajaj', plate: 'T 222 BBB' }, status: 'active', baseSalary: 300000, commissionRate: 0.05 },
];

const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'collect' | 'register' | 'history' | 'reports' | 'ai' | 'debt' | 'settlement' | 'support' | 'clearance'>('dashboard');
  
  // SESSION PERSISTENCE WITH ERROR PROTECTION
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('bht_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [lang, setLang] = useState<'zh' | 'sw'>('zh');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [aiContextId, setAiContextId] = useState<string>('');
  const t = TRANSLATIONS[lang];

  // ENV VALIDATION
  const isEnvMissing = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;

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

  // DATA ISOLATION LOGIC
  const filteredLocations = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin') return locations;
    return (locations || []).filter(l => l.assignedDriverId === currentUser.id);
  }, [locations, currentUser]);

  const filteredTransactions = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin') return transactions;
    return (transactions || []).filter(t => t.driverId === currentUser.id);
  }, [transactions, currentUser]);

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
        console.error("Supabase fetch failed", err);
        loadFromLocalStorage();
      }
    } else {
      loadFromLocalStorage();
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAllData();
    
    // NEW: Realtime Subscription for Instant Admin Updates
    const channel = supabase?.channel('any')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        refreshRemoteData();
      })
      .subscribe();

    const timer = setInterval(async () => {
      // ... existing health checks
    }, 20000);
    
    return () => {
      clearInterval(timer);
      if (channel) supabase?.removeChannel(channel);
    };
  }, [currentUser]);

  const refreshRemoteData = async () => {
    if (!supabase) return;
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
  };

  useEffect(() => {
    if (locations.length > 0) localStorage.setItem(CONSTANTS.STORAGE_LOCATIONS_KEY, JSON.stringify(locations));
    if (drivers.length > 0) localStorage.setItem(CONSTANTS.STORAGE_DRIVERS_KEY, JSON.stringify(drivers));
    localStorage.setItem(CONSTANTS.STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));
    localStorage.setItem(CONSTANTS.STORAGE_SETTLEMENTS_KEY, JSON.stringify(dailySettlements));
    localStorage.setItem(CONSTANTS.STORAGE_AI_LOGS_KEY, JSON.stringify(aiLogs));
  }, [locations, drivers, transactions, dailySettlements, aiLogs]);

  const syncOfflineData = async () => {
    if (isSyncingRef.current || !supabase) return;
    setIsSyncing(true);
    try {
        const offlineTx = transactionsRef.current.filter(t => !t.isSynced);
        if (offlineTx.length > 0) {
            // NEW: Batch sync via RPC
            const { error } = await supabase.rpc('sync_transactions', { items: offlineTx });
            if (!error) {
                setTransactions(prev => prev.map(t => ({ ...t, isSynced: true })));
            } else {
                throw error;
            }
        }
        
        // Handle other entities (Settlements, Logs) individually or via specialized RPCs
        // ...
    } catch (err) {
        console.error("Cloud batch sync failed", err);
    } finally {
        setIsSyncing(false);
    }
  };

  const handleUpdateDrivers = async (updatedDrivers: Driver[]) => {
    // Check if a new driver was added
    const newDrivers = updatedDrivers.filter(nd => !drivers.find(od => od.id === nd.id));
    
    setDrivers(updatedDrivers);
    if (isOnline && supabase) {
       for (const d of updatedDrivers) {
          const { stats, isOnline, ...driverToSave } = d as any;
          await supabase.from('drivers').upsert({...driverToSave, isSynced: true});
       }
       
       // NEW: Auto-generate 20 slots for each new driver
       if (newDrivers.length > 0) {
         for (const nd of newDrivers) {
           const prefix = nd.name.slice(0, 2).toUpperCase();
           const newSlots = Array.from({ length: 20 }, (_, i) => ({
             id: crypto.randomUUID(),
             name: `New Site (${prefix}-${(i+1).toString().padStart(3, '0')})`,
             machineId: `${prefix}-${(i+1).toString().padStart(3, '0')}`,
             area: 'TO BE SET',
             assignedDriverId: nd.id,
             status: 'maintenance',
             lastScore: 0,
             commissionRate: 0.15,
             initialStartupDebt: 0,
             remainingStartupDebt: 0,
             isSynced: true,
             ownerName: 'PENDING'
           }));
           await supabase.from('locations').insert(newSlots);
         }
         // Refresh locations after insertion
         const { data: freshLocs } = await supabase.from('locations').select('*');
         if (freshLocs) setLocations(freshLocs);
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
            await supabase.from('transactions').upsert({...tx, ...updates, isSynced: true});
        }
    }
  };

  const handleNewTransaction = async (tx: Transaction) => {
    const txToSave = { ...tx, isSynced: false };
    setTransactions(prev => [txToSave, ...prev]);
    setLocations(prev => prev.map(l => l.id === tx.locationId ? { ...l, lastScore: tx.currentScore, remainingStartupDebt: Math.max(0, l.remainingStartupDebt - (tx.startupDebtDeduction || 0)), isSynced: false } : l));

    if (isOnline && supabase) {
       const { error } = await supabase.from('transactions').upsert({...tx, isSynced: true});
       if (!error) {
          setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, isSynced: true } : t));
          const currentLoc = locationsRef.current.find(l => l.id === tx.locationId);
          if (currentLoc) {
            const newDebt = Math.max(0, currentLoc.remainingStartupDebt - (tx.startupDebtDeduction || 0));
            await supabase.from('locations').update({ lastScore: tx.currentScore, remainingStartupDebt: newDebt, isSynced: true }).eq('id', tx.locationId);
            setLocations(prev => prev.map(l => l.id === tx.locationId ? { ...l, lastScore: tx.currentScore, remainingStartupDebt: newDebt, isSynced: true } : l));
          }
       }
    }
  };

  const handleSaveSettlement = async (settlement: DailySettlement) => {
    const stlToSave = { ...settlement, isSynced: false };
    setDailySettlements(prev => [stlToSave, ...prev]);
    if (isOnline && supabase) {
       await supabase.from('daily_settlements').upsert({...settlement, isSynced: true});
    }
  };

  const handleLogAI = async (log: AILog) => {
    const logToSave = { ...log, isSynced: false };
    setAiLogs(prev => [logToSave, ...prev]);
    if (isOnline && supabase) {
      await supabase.from('ai_logs').insert({ ...log, isSynced: true });
    }
  };

  const handleUserLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('bht_session', JSON.stringify(user));
    setLang(user.role === 'admin' ? 'zh' : 'sw');
    if (user.role === 'driver') setView('collect');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('bht_session');
  };

  if (isEnvMissing) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-rose-500/20 text-rose-500 rounded-3xl flex items-center justify-center mb-6">
          <AlertTriangle size={40} />
        </div>
        <h1 className="text-xl font-black uppercase mb-2 text-rose-400">环境变量缺失 (ENV MISSING)</h1>
        <p className="text-xs text-slate-400 font-bold mb-8 uppercase tracking-widest leading-relaxed">
          云端构建需要配置 Supabase URL 和 Key。<br/>
          请在 GitHub Repo -&gt; Settings -&gt; Secrets 中添加。<br/>
          Build Success but Connect Failed.
        </p>
        <button onClick={() => window.location.reload()} className="px-8 py-4 bg-white/10 rounded-2xl text-[10px] font-black uppercase">刷新检查</button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <Loader2 size={48} className="text-amber-400 animate-spin mb-4" />
        <p className="text-xs font-bold uppercase tracking-widest">Bahati Engine Initializing...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Login drivers={drivers} onLogin={handleUserLogin} lang={lang} onSetLang={setLang} />;
  }

  const unsyncedCount = transactions.filter(t => !t.isSynced).length + dailySettlements.filter(s => !s.isSynced).length + aiLogs.filter(l => !l.isSynced).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 border-b border-white/10 p-4 sticky top-0 z-40 shadow-xl">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="bg-amber-500 text-slate-900 p-2 rounded-xl"><Crown size={20} /></div>
             <div>
               <h1 className="text-sm font-black text-white leading-tight">BAHATI JACKPOTS</h1>
               <p className="text-[10px] font-bold text-slate-400 uppercase">{currentUser.role} • {currentUser.name}</p>
             </div>
          </div>
          
          <div className="flex items-center gap-2">
             <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[8px] font-black ${isOnline ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'}`}>
                {isOnline ? 'ONLINE' : 'LOCAL'}
             </div>
             <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="p-2 bg-white/10 rounded-xl text-white"><Globe size={18} /></button>
             <button onClick={handleLogout} className="p-2 bg-rose-500/20 rounded-xl text-rose-400"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 lg:p-8 pb-32">
        {view === 'dashboard' && (
          <Dashboard 
            transactions={filteredTransactions} drivers={drivers} locations={filteredLocations} 
            dailySettlements={dailySettlements} aiLogs={aiLogs} currentUser={currentUser} 
            onUpdateDrivers={handleUpdateDrivers} onUpdateLocations={handleUpdateLocations} 
            onUpdateTransaction={handleUpdateTransaction} onNewTransaction={handleNewTransaction} 
            onSaveSettlement={handleSaveSettlement} onSync={syncOfflineData} 
            isSyncing={isSyncing} offlineCount={unsyncedCount} lang={lang} onNavigate={setView}
          />
        )}
        {view === 'collect' && (
          <CollectionForm 
            locations={filteredLocations} currentDriver={drivers.find(d => d.id === currentUser.id) || drivers[0]} 
            onSubmit={handleNewTransaction} lang={lang} onLogAI={handleLogAI}
            onRegisterMachine={async (loc) => { 
                const newLoc = { ...loc, isSynced: false, assignedDriverId: currentUser.id };
                setLocations([...locations, newLoc]); 
                
                // NEW: Deduct startup debt from driver's coin balance
                if (newLoc.initialStartupDebt > 0) {
                  const updatedDrivers = drivers.map(d => 
                    d.id === currentUser.id 
                      ? { ...d, dailyFloatingCoins: Math.max(0, d.dailyFloatingCoins - newLoc.initialStartupDebt) }
                      : d
                  );
                  handleUpdateDrivers(updatedDrivers);
                }

                if (isOnline && supabase) await supabase.from('locations').insert({...newLoc, isSynced: true});
            }}
          />
        )}
        {view === 'history' && <TransactionHistory transactions={filteredTransactions} onAnalyze={(id) => { setAiContextId(id); setView('ai'); }} />}
        {view === 'ai' && <AIHub drivers={drivers} locations={filteredLocations} transactions={filteredTransactions} onLogAI={handleLogAI} currentUser={currentUser} initialContextId={aiContextId} onClearContext={() => setAiContextId('')} />}
        {view === 'support' && <SupportTicketSystem />}
        {view === 'clearance' && (
          drivers.find(d => d.id === currentUser.id) ? (
            <ClearanceForm 
              locations={filteredLocations} 
              currentDriver={drivers.find(d => d.id === currentUser.id)!}
              onSubmit={handleNewTransaction} 
              lang={lang} 
              onLogAI={handleLogAI} 
              onCancel={() => setView('dashboard')} 
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-[40px] shadow-xl">
               <AlertTriangle size={48} className="text-amber-500 mb-4" />
               <p className="text-sm font-black text-slate-900 uppercase">仅限承包司机进行清分操作</p>
               <button onClick={() => setView('dashboard')} className="mt-6 px-8 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs">返回面板</button>
            </div>
          )
        )}
        {view === 'reports' && <FinancialReports transactions={filteredTransactions} drivers={drivers} locations={filteredLocations} dailySettlements={dailySettlements} lang={lang} />}
        {view === 'debt' && <DebtManager drivers={drivers} locations={filteredLocations} currentUser={currentUser} onUpdateLocations={handleUpdateLocations} lang={lang} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 p-2 z-50 shadow-lg">
        <div className="max-w-2xl mx-auto flex justify-around items-center">
           {currentUser.role === 'admin' && <NavItem icon={<LayoutDashboard size={20}/>} label="Admin" active={view === 'dashboard'} onClick={() => setView('dashboard')} />}
           <NavItem icon={<PlusCircle size={20}/>} label={t.collect} active={view === 'collect'} onClick={() => setView('collect')} />
           {currentUser.role === 'driver' && <NavItem icon={<RefreshCw size={20}/>} label="清分 Reset" active={view === 'clearance'} onClick={() => setView('clearance')} />}
           <NavItem icon={<CheckSquare size={20}/>} label={t.dailySettlement} active={view === 'settlement'} onClick={() => setView('settlement')} />
           <NavItem icon={<CreditCard size={20}/>} label={t.debt} active={view === 'debt'} onClick={() => setView('debt')} />
           {currentUser.role === 'admin' && <NavItem icon={<PieChart size={20}/>} label={t.reports} active={view === 'reports'} onClick={() => setView('reports')} />}
           {currentUser.role === 'admin' && <NavItem icon={<Brain size={20}/>} label="AI" active={view === 'ai'} onClick={() => setView('ai')} />}
           {currentUser.role === 'admin' && <NavItem icon={<MessageSquare size={20}/>} label="Support" active={view === 'support'} onClick={() => setView('support')} />}
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
