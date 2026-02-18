
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Transaction, Driver, Location, DailySettlement, User, CONSTANTS, AILog, Notification, TRANSLATIONS } from './types';
import Dashboard from './components/Dashboard';
import CollectionForm from './components/CollectionForm';
import MachineRegistrationForm from './components/MachineRegistrationForm';
import TransactionHistory from './components/TransactionHistory';
import Login from './components/Login';
import FinancialReports from './components/FinancialReports';
import AIHub from './components/AIHub';
import DebtManager from './components/DebtManager';
import { LayoutDashboard, History, PlusCircle, CreditCard, PieChart, Brain, LogOut, Globe, Loader2, WifiOff, PlusSquare, Bell, X, Check, ArrowRight, Wifi, RefreshCw, CloudOff, CheckSquare, Crown } from 'lucide-react';
import { supabase, checkDbHealth } from './supabaseClient';

const INITIAL_DRIVERS: Driver[] = [
  { id: 'D-NUDIN', name: 'Nudin', username: 'nudin', password: '', phone: '+255 62 691 4141', initialDebt: 0, remainingDebt: 0, dailyFloatingCoins: 10000, vehicleInfo: { model: 'TVS King', plate: 'T 111 AAA' }, status: 'active', baseSalary: 300000, commissionRate: 0.05 },
  { id: 'D-RAJABU', name: 'Rajabu', username: 'rajabu', password: '', phone: '+255 65 106 4066', initialDebt: 0, remainingDebt: 0, dailyFloatingCoins: 10000, vehicleInfo: { model: 'Bajaj', plate: 'T 222 BBB' }, status: 'active', baseSalary: 300000, commissionRate: 0.05 },
];

const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'collect' | 'register' | 'history' | 'reports' | 'ai' | 'debt' | 'settlement'>('dashboard');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [lang, setLang] = useState<'zh' | 'sw'>('zh');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  
  // Context state for AI analysis linking
  const [aiContextId, setAiContextId] = useState<string>('');

  const t = TRANSLATIONS[lang];

  // Data States
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>(INITIAL_DRIVERS);
  const [locations, setLocations] = useState<Location[]>([]);
  const [dailySettlements, setDailySettlements] = useState<DailySettlement[]>([]);
  const [aiLogs, setAiLogs] = useState<AILog[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  // Refs to avoid stale closures in sync intervals
  const transactionsRef = useRef(transactions);
  const dailySettlementsRef = useRef(dailySettlements);
  const aiLogsRef = useRef(aiLogs);
  const driversRef = useRef(drivers);
  const locationsRef = useRef(locations);
  const isSyncingRef = useRef(isSyncing);

  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);
  useEffect(() => { dailySettlementsRef.current = dailySettlements; }, [dailySettlements]);
  useEffect(() => { aiLogsRef.current = aiLogs; }, [aiLogs]);
  useEffect(() => { driversRef.current = drivers; }, [drivers]);
  useEffect(() => { locationsRef.current = locations; }, [locations]);
  useEffect(() => { isSyncingRef.current = isSyncing; }, [isSyncing]);

  // --- 核心同步逻辑：实时监听 ---
  const setupRealtimeSubscriptions = () => {
    const channel = supabase.channel('global-sync-channel')
      // 监听交易表：司机提交后，管理员端实时弹出
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, payload => {
        if (payload.eventType === 'INSERT') {
          // Avoid duplicates if we already have it optimistically
          setTransactions(prev => {
             if (prev.find(t => t.id === payload.new.id)) return prev;
             return [payload.new as Transaction, ...prev];
          });
        } else if (payload.eventType === 'UPDATE') {
          setTransactions(prev => prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t));
        }
      })
      // 监听点位表
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, payload => {
        if (payload.eventType === 'UPDATE') {
          setLocations(prev => prev.map(l => l.id === payload.new.id ? { ...l, ...payload.new } : l));
        } else if (payload.eventType === 'INSERT') {
          setLocations(prev => {
             if (prev.find(l => l.id === payload.new.id)) return prev;
             return [payload.new as Location, ...prev];
          });
        }
      })
      // 监听司机表
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drivers' }, payload => {
        setDrivers(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d));
      })
      // 监听对账表
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_settlements' }, payload => {
        if (payload.eventType === 'INSERT') {
            setDailySettlements(prev => {
                if (prev.find(s => s.id === payload.new.id)) return prev;
                return [payload.new as DailySettlement, ...prev];
            });
        } else if (payload.eventType === 'UPDATE') {
            setDailySettlements(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new } : s));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  };

  const fetchAllData = async () => {
    const online = await checkDbHealth();
    setIsOnline(online);

    if (online) {
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
        if (resTx.data) setTransactions(resTx.data);
        if (resSettlement.data) setDailySettlements(resSettlement.data);
        if (resLogs.data) setAiLogs(resLogs.data);
      } catch (err) {
        console.error("Cloud fetch failed, falling back to local:", err);
        loadFromLocalStorage();
      }
    } else {
      loadFromLocalStorage();
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAllData();
    const cleanup = setupRealtimeSubscriptions();

    // 自动重连与心跳
    const timer = setInterval(async () => {
      const online = await checkDbHealth();
      setIsOnline(online);
      
      // Auto-sync if online and not currently syncing
      if (online && !isSyncingRef.current) {
         syncOfflineData();
      }
    }, 15000);

    return () => {
      clearInterval(timer);
      cleanup();
    };
  }, []);

  // --- Robust Local Storage Persistence ---
  useEffect(() => {
    try {
        if (locations.length) localStorage.setItem(CONSTANTS.STORAGE_LOCATIONS_KEY, JSON.stringify(locations));
        if (drivers.length) localStorage.setItem(CONSTANTS.STORAGE_DRIVERS_KEY, JSON.stringify(drivers));
        if (transactions.length) localStorage.setItem(CONSTANTS.STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));
        if (dailySettlements.length) localStorage.setItem(CONSTANTS.STORAGE_SETTLEMENTS_KEY, JSON.stringify(dailySettlements));
        if (aiLogs.length) localStorage.setItem(CONSTANTS.STORAGE_AI_LOGS_KEY, JSON.stringify(aiLogs));
    } catch (e) {
        console.error("Local Storage Save Failed (Quota?):", e);
    }
  }, [locations, drivers, transactions, dailySettlements, aiLogs]);

  const loadFromLocalStorage = () => {
    const getStored = (key: string, fallback: any) => {
      const s = localStorage.getItem(key);
      try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
    };
    setLocations(getStored(CONSTANTS.STORAGE_LOCATIONS_KEY, []));
    setDrivers(getStored(CONSTANTS.STORAGE_DRIVERS_KEY, INITIAL_DRIVERS));
    setTransactions(getStored(CONSTANTS.STORAGE_TRANSACTIONS_KEY, []));
    setDailySettlements(getStored(CONSTANTS.STORAGE_SETTLEMENTS_KEY, []));
    setAiLogs(getStored(CONSTANTS.STORAGE_AI_LOGS_KEY, []));
  };

  // --- Universal Sync Engine ---
  const syncOfflineData = async () => {
    if (isSyncingRef.current) return;
    setIsSyncing(true);

    try {
        // 1. Transactions
        const offlineTx = transactionsRef.current.filter(t => !t.isSynced);
        for (const item of offlineTx) {
            const { error } = await supabase.from('transactions').upsert({ ...item, isSynced: true });
            if (!error) {
                setTransactions(prev => prev.map(t => t.id === item.id ? { ...t, isSynced: true } : t));
            }
        }

        // 2. Settlements
        const offlineSettlements = dailySettlementsRef.current.filter(s => !s.isSynced);
        for (const item of offlineSettlements) {
             const { error } = await supabase.from('daily_settlements').upsert({ ...item, isSynced: true });
             if (!error) {
                 setDailySettlements(prev => prev.map(s => s.id === item.id ? { ...s, isSynced: true } : s));
             }
        }

        // 3. AI Logs
        const offlineLogs = aiLogsRef.current.filter(l => !l.isSynced);
        for (const item of offlineLogs) {
             const { error } = await supabase.from('ai_logs').upsert({ ...item, isSynced: true });
             if (!error) {
                 setAiLogs(prev => prev.map(l => l.id === item.id ? { ...l, isSynced: true } : l));
             }
        }

        // 4. Drivers (Updates only)
        const offlineDrivers = driversRef.current.filter(d => d.isSynced === false);
        for (const item of offlineDrivers) {
             const { error } = await supabase.from('drivers').upsert({ ...item, isSynced: true });
             if (!error) {
                 setDrivers(prev => prev.map(d => d.id === item.id ? { ...d, isSynced: true } : d));
             }
        }

        // 5. Locations (Updates only)
        const offlineLocations = locationsRef.current.filter(l => l.isSynced === false);
        for (const item of offlineLocations) {
             const { error } = await supabase.from('locations').upsert({ ...item, isSynced: true });
             if (!error) {
                 setLocations(prev => prev.map(l => l.id === item.id ? { ...l, isSynced: true } : l));
             }
        }

    } catch (err) {
        console.error("Batch sync process failed:", err);
    } finally {
        setIsSyncing(false);
    }
  };

  // --- Handlers with Optimistic Updates ---

  const handleNewTransaction = async (tx: Transaction) => {
    // 1. Optimistic Update (isSynced: false)
    const txLocal = { ...tx, isSynced: false };
    setTransactions(prev => [txLocal, ...prev]);

    // 2. Immediate Sync Attempt
    if (isOnline) {
      try {
        const { error } = await supabase.from('transactions').upsert({ ...tx, isSynced: true });
        if (error) throw error;
        // 3. Success -> Mark Synced
        setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, isSynced: true } : t));
        
        // Also update machine score immediately in cloud to prevent race condition
        await supabase.from('locations').update({ lastScore: tx.currentScore }).eq('id', tx.locationId);
      } catch (err) {
        console.error("Realtime sync failed, queued for retry:", err);
      }
    }
  };

  const handleSaveSettlement = async (settlement: DailySettlement) => {
     // 1. Optimistic
     const localSettlement = { ...settlement, isSynced: false };
     setDailySettlements(prev => {
         const existing = prev.find(s => s.id === settlement.id);
         if (existing) return prev.map(s => s.id === settlement.id ? localSettlement : s);
         return [localSettlement, ...prev];
     });

     // 2. Cloud
     if (isOnline) {
         try {
             const { error } = await supabase.from('daily_settlements').upsert({ ...settlement, isSynced: true });
             if (error) throw error;
             setDailySettlements(prev => prev.map(s => s.id === settlement.id ? { ...s, isSynced: true } : s));
         } catch(err) {
             console.error("Settlement sync failed, saved locally", err);
         }
     }
  };

  const handleUpdateDrivers = async (updatedDrivers: Driver[]) => {
      // Find changed drivers and mark them unsynced locally
      const mergedDrivers = updatedDrivers.map(d => {
          const old = driversRef.current.find(od => od.id === d.id);
          // Simple diff check (could be improved) or just assume if updated via this function, it's dirty
          return { ...d, isSynced: false }; 
      });
      
      setDrivers(mergedDrivers);

      if (isOnline) {
          try {
              // Upsert all dirty drivers
              for (const d of mergedDrivers) {
                  const { error } = await supabase.from('drivers').upsert({ ...d, isSynced: true });
                  if (!error) {
                      setDrivers(prev => prev.map(pd => pd.id === d.id ? { ...pd, isSynced: true } : pd));
                  }
              }
          } catch (err) {
              console.error("Driver sync failed", err);
          }
      }
  };

  const handleUpdateLocations = async (updatedLocations: Location[]) => {
      const mergedLocations = updatedLocations.map(l => ({ ...l, isSynced: false }));
      setLocations(mergedLocations);

      if (isOnline) {
          try {
              // We usually update one by one in real app, but here we scan
              // Optimizing: only update changed ones in a real app. Here we just try to push dirty ones.
              // In this simplified handler, we assume the passed array is the full new state.
              // Let's filter effectively in the syncOfflineData, but here we try immediate push for the one likely changed.
              // For simplicity in this demo, we let the background sync handle bulk, but try to push all 'false' synced now.
              for (const l of mergedLocations) {
                  // Only push if it was actually the target of an edit (hard to know here without ID param).
                  // Strategy: Just rely on background sync for bulk updates or try all.
                  // Better: The caller should pass the *single* updated location usually.
                  // But the interface is Location[]. 
                  // Let's just try to sync them all if list is small, or let offline sync handle it.
                  // *Optimized*: We'll just let the `syncOfflineData` loop handle it to avoid heavy traffic, 
                  // OR we iterate specifically if the user is online.
                  // Let's rely on the sync loop for robustness, it runs every 15s.
              }
              // Actually, critical updates (like debt recovery) need immediate feedback.
              // Let's try to sync all marked as unsynced now.
              const unsynced = mergedLocations.filter(l => !l.isSynced);
              for (const l of unsynced) {
                  const { error } = await supabase.from('locations').upsert({ ...l, isSynced: true });
                  if (!error) {
                      setLocations(prev => prev.map(pl => pl.id === l.id ? { ...pl, isSynced: true } : pl));
                  }
              }
          } catch (err) {
              console.error("Location sync failed", err);
          }
      }
  };

  const handleLogAI = async (log: AILog) => {
      const logLocal = { ...log, isSynced: false };
      setAiLogs(prev => [logLocal, ...prev]);
      
      if (isOnline) {
          try {
              const { error } = await supabase.from('ai_logs').insert({ ...log, isSynced: true });
              if (!error) {
                  setAiLogs(prev => prev.map(l => l.id === log.id ? { ...l, isSynced: true } : l));
              }
          } catch (err) {
              console.error("AI log sync failed", err);
          }
      }
  };

  const handleUpdateTransaction = async (txId: string, updates: Partial<Transaction>) => {
      setTransactions(prev => prev.map(t => {
          if (t.id === txId) return { ...t, ...updates, isSynced: false };
          return t;
      }));

      if (isOnline) {
          try {
              const tx = transactionsRef.current.find(t => t.id === txId);
              if (tx) {
                  const payload = { ...tx, ...updates, isSynced: true };
                  const { error } = await supabase.from('transactions').upsert(payload);
                  if (!error) {
                      setTransactions(prev => prev.map(t => t.id === txId ? { ...t, isSynced: true } : t));
                  }
              }
          } catch (err) {
              console.error("Tx update sync failed", err);
          }
      }
  };

  const handleUserLogin = (user: User) => {
    setCurrentUser(user);
    setLang(user.role === 'admin' ? 'zh' : 'sw');
    if (user.role === 'driver') setView('collect');
  };

  // Handler to jump from Transaction History to AI Hub with context
  const handleAnalyzeTransaction = (txId: string) => {
    setAiContextId(txId);
    setView('ai');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900">
        <Loader2 size={48} className="text-amber-400 animate-spin mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/50 tracking-[0.3em]">Bahati Jackpots Engine Initializing...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Login drivers={drivers} onLogin={handleUserLogin} lang={lang} onSetLang={setLang} />;
  }

  const unsyncedCount = 
      transactions.filter(t => !t.isSynced).length + 
      dailySettlements.filter(s => !s.isSynced).length +
      drivers.filter(d => d.isSynced === false).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 border-b border-white/10 p-4 sticky top-0 z-40 shadow-xl safe-top">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="bg-gradient-to-br from-amber-300 to-amber-600 text-slate-900 p-2 rounded-xl shadow-lg shadow-amber-900/50">
               <Crown size={20} fill="currentColor" className="text-slate-900" />
             </div>
             <div>
               <div className="flex items-center gap-2">
                 <h1 className="text-sm font-black text-white tracking-tight">BAHATI JACKPOTS</h1>
                 <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[8px] font-black ${isOnline ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'}`}>
                   <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></div>
                   {isOnline ? 'ONLINE' : 'LOCAL'}
                 </div>
               </div>
               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{currentUser.role} • {currentUser.name}</p>
             </div>
          </div>
          
          <div className="flex items-center gap-2">
             {unsyncedCount > 0 && (
               <button onClick={syncOfflineData} disabled={isSyncing || !isOnline} className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-slate-900 rounded-xl animate-pulse shadow-lg shadow-amber-900/20">
                 {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                 <span className="text-[10px] font-black">{unsyncedCount} PENDING</span>
               </button>
             )}
             <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="p-2 bg-white/10 rounded-xl text-white hover:bg-white/20 transition-colors"><Globe size={18} /></button>
             <button onClick={() => setCurrentUser(null)} className="p-2 bg-rose-500/20 rounded-xl text-rose-400 hover:bg-rose-500/30 transition-colors"><LogOut size={18} /></button>
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
            onRegisterMachine={(loc) => { 
                const newLoc = { ...loc, isSynced: false };
                setLocations([...locations, newLoc]); 
                // Trigger sync immediately for registration
                if(isOnline) supabase.from('locations').insert({ ...newLoc, isSynced: true }).then(({error}) => {
                    if(!error) setLocations(prev => prev.map(l => l.id === newLoc.id ? { ...l, isSynced: true } : l));
                });
            }}
          />
        )}
        {view === 'register' && <MachineRegistrationForm 
            onSubmit={loc => { 
                const newLoc = { ...loc, isSynced: false };
                setLocations([...locations, newLoc]); 
                if(isOnline) supabase.from('locations').insert({ ...newLoc, isSynced: true }).then(({error}) => {
                    if(!error) setLocations(prev => prev.map(l => l.id === newLoc.id ? { ...l, isSynced: true } : l));
                });
            }} 
            onCancel={() => setView('dashboard')} 
            currentDriver={drivers.find(d => d.id === currentUser.id) || drivers[0]} 
            lang={lang} 
        />}
        {view === 'history' && <TransactionHistory transactions={transactions} onAnalyze={handleAnalyzeTransaction} />}
        {view === 'reports' && <FinancialReports transactions={transactions} drivers={drivers} locations={locations} dailySettlements={dailySettlements} lang={lang} />}
        {view === 'ai' && (
          <AIHub 
            drivers={drivers} 
            locations={locations} 
            transactions={transactions} 
            onLogAI={handleLogAI} 
            currentUser={currentUser}
            initialContextId={aiContextId}
            onClearContext={() => setAiContextId('')}
          />
        )}
        {view === 'debt' && <DebtManager drivers={drivers} locations={locations} currentUser={currentUser} onUpdateLocations={handleUpdateLocations} lang={lang} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 p-2 z-50 shadow-lg safe-bottom">
        <div className="max-w-2xl mx-auto flex justify-around items-center">
           {currentUser.role === 'admin' && <NavItem icon={<LayoutDashboard size={20}/>} label="Admin" active={view === 'dashboard'} onClick={() => setView('dashboard')} />}
           <NavItem icon={<PlusCircle size={20}/>} label={t.collect} active={view === 'collect'} onClick={() => setView('collect')} />
           <NavItem icon={<CheckSquare size={20}/>} label={t.dailySettlement} active={view === 'settlement'} onClick={() => setView('settlement')} />
           {currentUser.role === 'admin' && <NavItem icon={<PlusSquare size={20}/>} label={t.register} active={view === 'register'} onClick={() => setView('register')} />}
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
