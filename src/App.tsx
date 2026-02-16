import React, { useState, useEffect, useMemo } from 'react';
import { Transaction, Driver, Location, DailySettlement, User, CONSTANTS, AILog, Notification } from './types';
import Dashboard from './components/Dashboard';
import CollectionForm from './components/CollectionForm';
import MachineRegistrationForm from './components/MachineRegistrationForm';
import TransactionHistory from './components/TransactionHistory';
import Login from './components/Login';
import FinancialReports from './components/FinancialReports';
import AIHub from './components/AIHub';
import DebtManager from './components/DebtManager';
import { 
  LayoutDashboard, 
  PlusCircle, 
  CreditCard, 
  PieChart, 
  Brain, 
  LogOut, 
  Globe, 
  Loader2, 
  RefreshCw
} from 'lucide-react';
import { supabase, checkDbHealth } from './supabaseClient';
import { cn } from './lib/utils';

// Remove hardcoded INITIAL_DRIVERS to prevent data reset on updates
const INITIAL_DRIVERS: Driver[] = [];

const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'collect' | 'register' | 'history' | 'reports' | 'ai' | 'debt'>('dashboard');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [lang, setLang] = useState<'zh' | 'sw'>('zh');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]); // Initialize empty
  const [locations, setLocations] = useState<Location[]>([]);
  const [dailySettlements, setDailySettlements] = useState<DailySettlement[]>([]);
  const [aiLogs, setAiLogs] = useState<AILog[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const fetchAllData = async () => {
    const online = await checkDbHealth();
    setIsOnline(online);

    if (online) {
      try {
        const [resLoc, resDrivers, resTx, resSettlement, resLogs, resNotifs] = await Promise.all([
          supabase.from('locations').select('*'),
          supabase.from('drivers').select('*'),
          supabase.from('transactions').select('*').order('timestamp', { ascending: false }),
          supabase.from('daily_settlements').select('*'),
          supabase.from('ai_logs').select('*').order('timestamp', { ascending: false }),
          supabase.from('notifications').select('*').order('timestamp', { ascending: false }).limit(50)
        ]);

        if (resLoc.data) setLocations(resLoc.data);
        // Only update drivers if DB returns data, otherwise keep local or empty to avoid wiping
        if (resDrivers.data && resDrivers.data.length > 0) {
            setDrivers(resDrivers.data);
        } else {
            // Fallback: If DB empty, check local storage
            const localDrivers = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_DRIVERS_KEY) || '[]');
            if (localDrivers.length > 0) setDrivers(localDrivers);
        }

        if (resTx.data) setTransactions(resTx.data);
        if (resSettlement.data) setDailySettlements(resSettlement.data);
        if (resLogs.data) setAiLogs(resLogs.data);
        if (resNotifs.data) setNotifications(resNotifs.data);
      } catch (err) {
        console.error("Fetch failed, using local data", err);
        loadFromLocalStorage(); // Fallback on error
      }
    } else {
      loadFromLocalStorage();
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAllData();
    const healthCheck = setInterval(async () => {
      const online = await checkDbHealth();
      setIsOnline(online);
    }, 60000);

    const channels = supabase.channel('app-v1-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, payload => handleRealtimeUpdate(setLocations, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, payload => handleRealtimeUpdate(setDrivers, payload))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, payload => {
          setNotifications(prev => [payload.new as Notification, ...prev]);
      })
      .subscribe();

    return () => {
      clearInterval(healthCheck);
      supabase.removeChannel(channels);
    };
  }, []);

  const handleRealtimeUpdate = (setter: any, payload: any) => {
    if (payload.eventType === 'INSERT') {
      setter((prev: any[]) => [payload.new, ...prev]);
    } else if (payload.eventType === 'UPDATE') {
      setter((prev: any[]) => prev.map((item: any) => item.id === payload.new.id ? payload.new : item));
    } else if (payload.eventType === 'DELETE') {
      setter((prev: any[]) => prev.filter((item: any) => item.id !== payload.old.id));
    }
  };

  // Prevent initial empty state from overwriting local storage before data is loaded
  useEffect(() => { 
    if (!isLoading) {
      localStorage.setItem(CONSTANTS.STORAGE_LOCATIONS_KEY, JSON.stringify(locations)); 
    }
  }, [locations, isLoading]);

  useEffect(() => { 
    if (!isLoading) {
      localStorage.setItem(CONSTANTS.STORAGE_DRIVERS_KEY, JSON.stringify(drivers)); 
    }
  }, [drivers, isLoading]);

  useEffect(() => { 
    if (!isLoading) {
      localStorage.setItem(CONSTANTS.STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions)); 
    }
  }, [transactions, isLoading]);

  useEffect(() => { 
    if (!isLoading) {
      localStorage.setItem(CONSTANTS.STORAGE_SETTLEMENTS_KEY, JSON.stringify(dailySettlements)); 
    }
  }, [dailySettlements, isLoading]);

  useEffect(() => { 
    if (!isLoading) {
      localStorage.setItem(CONSTANTS.STORAGE_AI_LOGS_KEY, JSON.stringify(aiLogs)); 
    }
  }, [aiLogs, isLoading]);

  useEffect(() => { 
    if (!isLoading) {
      localStorage.setItem(CONSTANTS.STORAGE_NOTIFICATIONS_KEY, JSON.stringify(notifications)); 
    }
  }, [notifications, isLoading]);

  const loadFromLocalStorage = () => {
    const getStored = (key: string, fallback: any) => {
      const s = localStorage.getItem(key);
      try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
    };
    setLocations(getStored(CONSTANTS.STORAGE_LOCATIONS_KEY, []));
    
    // IMPORTANT: Do NOT reset to hardcoded drivers. Load what is stored, or empty.
    const storedDrivers = getStored(CONSTANTS.STORAGE_DRIVERS_KEY, []);
    setDrivers(storedDrivers);

    setTransactions(getStored(CONSTANTS.STORAGE_TRANSACTIONS_KEY, []));
    setDailySettlements(getStored(CONSTANTS.STORAGE_SETTLEMENTS_KEY, []));
    setAiLogs(getStored(CONSTANTS.STORAGE_AI_LOGS_KEY, []));
    setNotifications(getStored(CONSTANTS.STORAGE_NOTIFICATIONS_KEY, []));
  };

  const handleError = (error: any, context: string) => {
    console.error(`Error in ${context}:`, error);
    if (error.code === '42501') {
      alert(`权限不足 (Permission Denied): 请确保数据库 RLS 已关闭或已配置策略。\n\nDetail: ${error.message}`);
    } else {
      alert(`操作失败 (${context}): ${error.message || '未知错误'}`);
    }
  };

  const handleNewTransaction = async (tx: Transaction) => {
    const txWithSync = { ...tx, isSynced: isOnline };
    setTransactions(prev => [txWithSync, ...prev]);
    
    setLocations(prev => prev.map(loc => loc.id === tx.locationId ? { ...loc, lastScore: tx.currentScore } : loc));
    setDrivers(prev => prev.map(d => d.id === tx.driverId ? { 
      ...d, 
      remainingDebt: Math.max(0, d.remainingDebt - (tx.debtDeduction || 0)),
      currentGps: tx.gps,
      lastActive: tx.timestamp
    } : d));

    if (isOnline) {
      try {
        const { error: txErr } = await supabase.from('transactions').insert(txWithSync);
        if (txErr) throw txErr;
        
        const { error: locErr } = await supabase.from('locations').update({ lastScore: tx.currentScore }).eq('id', tx.locationId);
        if (locErr) throw locErr;

        const updatedDriver = drivers.find(d => d.id === tx.driverId);
        if (updatedDriver) {
           const { error: drvErr } = await supabase.from('drivers').update({ 
             remainingDebt: Math.max(0, updatedDriver.remainingDebt - (tx.debtDeduction || 0)),
             currentGps: tx.gps,
             lastActive: tx.timestamp
           }).eq('id', tx.driverId);
           if (drvErr) throw drvErr;
        }
      } catch (err: any) {
        handleError(err, "New Transaction Sync");
        setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, isSynced: false } : t));
      }
    }
  };

  const handleUpdateDrivers = async (newDriversList: Driver[]) => {
    setDrivers(newDriversList);
    // Always save to local storage immediately
    localStorage.setItem(CONSTANTS.STORAGE_DRIVERS_KEY, JSON.stringify(newDriversList));
    
    if (isOnline) {
      const { error } = await supabase.from('drivers').upsert(newDriversList);
      if (error) {
          console.error("Sync Error:", error);
          alert(`数据未能保存到云端 (Cloud Sync Failed)!\n错误原因: ${error.message}\n提示: 请确保 Supabase 中已创建 drivers 表并关闭了 RLS 权限。`);
      } else {
          // Success feedback could be added here if needed
      }
    } else {
      alert("当前处于离线状态，数据仅保存在手机本地。");
    }
  };

  const handleUpdateLocations = async (newLocations: Location[]) => {
    setLocations(newLocations);
    if (isOnline) {
      const { error } = await supabase.from('locations').upsert(newLocations);
      if (error) handleError(error, "Update Locations");
    }
  };

  const handleSaveSettlement = async (settlement: DailySettlement) => {
    setDailySettlements(prev => [settlement, ...prev]);
    if (isOnline) {
      const { error } = await supabase.from('daily_settlements').insert(settlement);
      if (error) handleError(error, "Save Settlement");
    }
  };

  const handleLogAI = async (log: AILog) => {
    setAiLogs(prev => [log, ...prev]);
    if (isOnline) {
      const { error } = await supabase.from('ai_logs').insert(log);
      if (error) handleError(error, "AI Hub Log");
    }
  };

  const syncOfflineData = async () => {
    if (!isOnline) { alert("网络未连接 Network Offline"); return; }
    setIsSyncing(true);
    const offlineTxs = transactions.filter(t => !t.isSynced);
    
    let successCount = 0;
    for (const tx of offlineTxs) {
      const { error } = await supabase.from('transactions').insert({ ...tx, isSynced: true });
      if (!error) {
        setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, isSynced: true } : t));
        successCount++;
      } else {
        handleError(error, `Sync TX ${tx.id}`);
        break; 
      }
    }
    setIsSyncing(false);
    if (successCount > 0) alert(`已成功同步 ${successCount} 条记录`);
  };

  const handleUserLogin = (user: User) => {
    setCurrentUser(user);
    setLang(user.role === 'admin' ? 'zh' : 'sw');
  };

  const activeDriver = useMemo(() => {
    if (!currentUser) return null;
    const found = drivers.find(d => d.id === currentUser.id);
    if (found) return found;
    if (currentUser.role === 'admin') {
      return { 
        id: currentUser.id, name: currentUser.name, username: currentUser.username, password: '', phone: 'ADMIN',
        initialDebt: 0, remainingDebt: 0, dailyFloatingCoins: 0,
        vehicleInfo: { model: 'Office', plate: 'ADMIN' },
        status: 'active', baseSalary: 0, commissionRate: 0
      } as Driver;
    }
    return null;
  }, [currentUser, drivers]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <Loader2 size={48} className="text-indigo-600 animate-spin mb-4" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Initializing Bahati Pro...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Login drivers={drivers} onLogin={handleUserLogin} lang={lang} onSetLang={setLang} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-40 sticky top-0 shrink-0 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-100">B</div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-gray-900 tracking-tighter">BAHATI</h1>
              <button 
                onClick={() => fetchAllData()}
                className={cn(
                  "text-[8px] px-1.5 py-0.5 rounded-full font-bold transition-all",
                  isOnline ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600 underline"
                )}
              >
                {isOnline ? 'ONLINE' : 'OFFLINE (RETRY)'}
              </button>
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{currentUser.role} • {currentUser.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {transactions.some(t => !t.isSynced) && (
            <button onClick={syncOfflineData} className="p-2 bg-orange-50 text-orange-600 rounded-xl">
              <RefreshCw size={18} className={cn(isSyncing && "animate-spin")} />
            </button>
          )}
          <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="p-2 bg-gray-50 text-gray-500 rounded-xl hover:text-blue-600 transition-colors">
            <Globe size={18} />
          </button>
          <button onClick={() => setCurrentUser(null)} className="p-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-7xl mx-auto">
          {view === 'dashboard' && (
            <Dashboard 
              transactions={transactions} 
              drivers={drivers} 
              locations={locations} 
              dailySettlements={dailySettlements} 
              aiLogs={aiLogs} 
              currentUser={currentUser} 
              onUpdateDrivers={handleUpdateDrivers} 
              onUpdateLocations={handleUpdateLocations} 
              onUpdateTransaction={(id, upd) => setTransactions(prev => prev.map(t => t.id === id ? {...t, ...upd} : t))}
              onNewTransaction={handleNewTransaction} 
              onSaveSettlement={handleSaveSettlement} 
              onSync={syncOfflineData} 
              isSyncing={isSyncing} 
              offlineCount={transactions.filter(t => !t.isSynced).length} 
              lang={lang}
              onNavigate={(v) => setView(v)}
            />
          )}
          {view === 'collect' && activeDriver && <CollectionForm locations={locations} currentDriver={activeDriver} onSubmit={handleNewTransaction} lang={lang} onLogAI={handleLogAI} />}
          {view === 'register' && activeDriver && <MachineRegistrationForm onSubmit={loc => handleUpdateLocations([...locations, loc])} onCancel={() => setView('dashboard')} currentDriver={activeDriver} lang={lang} />}
          {view === 'history' && <TransactionHistory transactions={transactions} />}
          {view === 'reports' && <FinancialReports transactions={transactions} drivers={drivers} locations={locations} dailySettlements={dailySettlements} lang={lang} />}
          {view === 'ai' && <AIHub drivers={drivers} locations={locations} transactions={transactions} onLogAI={handleLogAI} currentUser={currentUser} />}
          {view === 'debt' && <DebtManager drivers={drivers} locations={locations} currentUser={currentUser} onUpdateLocations={handleUpdateLocations} lang={lang} />}
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-gray-100 grid grid-cols-5 safe-area-pb z-50 px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <NavTab icon={<LayoutDashboard size={20}/>} label={lang === 'zh' ? '概览' : 'Home'} active={view === 'dashboard'} onClick={() => setView('dashboard')} />
        <NavTab icon={<PlusCircle size={20}/>} label={lang === 'zh' ? '核对' : 'Check'} active={view === 'collect'} onClick={() => setView('collect')} />
        <NavTab icon={<CreditCard size={20}/>} label={lang === 'zh' ? '欠款' : 'Debt'} active={view === 'debt'} onClick={() => setView('debt')} />
        <NavTab icon={<Brain size={20}/>} label="AI" active={view === 'ai'} onClick={() => setView('ai')} />
        <NavTab icon={<PieChart size={20}/>} label={lang === 'zh' ? '统计' : 'Stats'} active={view === 'reports'} onClick={() => setView('reports')} />
      </nav>
    </div>
  );
};

const NavTab = ({ icon, label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={cn(
      "flex flex-col items-center justify-center py-3 px-1 transition-all duration-200 relative",
      active ? "text-blue-600" : "text-gray-400 hover:text-blue-400"
    )}
  >
    <div className={cn(active && "scale-110")}>{icon}</div>
    <span className="text-[10px] mt-1 font-bold tracking-tight">{label}</span>
    {active && <span className="absolute top-1.5 right-4 w-1.5 h-1.5 bg-blue-600 rounded-full" />}
  </button>
);

export default App;
