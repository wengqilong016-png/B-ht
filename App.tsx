
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
import { LayoutDashboard, History, PlusCircle, CreditCard, PieChart, Brain, LogOut, Globe, Loader2, WifiOff, PlusSquare, Bell, X, Check, ArrowRight, Wifi, RefreshCw } from 'lucide-react';
import { supabase, checkDbHealth } from './supabaseClient';

const INITIAL_DRIVERS: Driver[] = [
  { id: 'D-NUDIN', name: 'Nudin', username: 'nudin', password: '', phone: '+255 62 691 4141', initialDebt: 0, remainingDebt: 0, dailyFloatingCoins: 10000, vehicleInfo: { model: 'TVS King', plate: 'T 111 AAA' }, status: 'active', baseSalary: 300000, commissionRate: 0.05 },
  { id: 'D-RAJABU', name: 'Rajabu', username: 'rajabu', password: '', phone: '+255 65 106 4066', initialDebt: 0, remainingDebt: 0, dailyFloatingCoins: 10000, vehicleInfo: { model: 'Bajaj', plate: 'T 222 BBB' }, status: 'active', baseSalary: 300000, commissionRate: 0.05 },
  { id: 'D-03', name: 'Driver 3', username: 'driver3', password: '', phone: '', initialDebt: 0, remainingDebt: 0, dailyFloatingCoins: 10000, vehicleInfo: { model: 'Bajaj', plate: '---' }, status: 'active', baseSalary: 300000, commissionRate: 0.05 },
  { id: 'D-04', name: 'Driver 4', username: 'driver4', password: '', phone: '', initialDebt: 0, remainingDebt: 0, dailyFloatingCoins: 10000, vehicleInfo: { model: 'Bajaj', plate: '---' }, status: 'active', baseSalary: 300000, commissionRate: 0.05 },
  { id: 'D-05', name: 'Driver 5', username: 'driver5', password: '', phone: '', initialDebt: 0, remainingDebt: 0, dailyFloatingCoins: 10000, vehicleInfo: { model: 'Bajaj', plate: '---' }, status: 'active', baseSalary: 300000, commissionRate: 0.05 },
];

const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'collect' | 'register' | 'history' | 'reports' | 'ai' | 'debt'>('dashboard');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [lang, setLang] = useState<'zh' | 'sw'>('zh');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>(INITIAL_DRIVERS);
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
        if (resDrivers.data) setDrivers(resDrivers.data);
        if (resTx.data) setTransactions(resTx.data);
        if (resSettlement.data) setDailySettlements(resSettlement.data);
        if (resLogs.data) setAiLogs(resLogs.data);
        if (resNotifs.data) setNotifications(resNotifs.data);
      } catch (err) {
        console.error("Fetch failed, using local data", err);
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
          setNotifications(prev => [payload.new, ...prev]);
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

  useEffect(() => { localStorage.setItem(CONSTANTS.STORAGE_LOCATIONS_KEY, JSON.stringify(locations)); }, [locations]);
  useEffect(() => { localStorage.setItem(CONSTANTS.STORAGE_DRIVERS_KEY, JSON.stringify(drivers)); }, [drivers]);
  useEffect(() => { localStorage.setItem(CONSTANTS.STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { localStorage.setItem(CONSTANTS.STORAGE_SETTLEMENTS_KEY, JSON.stringify(dailySettlements)); }, [dailySettlements]);
  useEffect(() => { localStorage.setItem(CONSTANTS.STORAGE_AI_LOGS_KEY, JSON.stringify(aiLogs)); }, [aiLogs]);
  useEffect(() => { localStorage.setItem(CONSTANTS.STORAGE_NOTIFICATIONS_KEY, JSON.stringify(notifications)); }, [notifications]);

  const loadFromLocalStorage = () => {
    const getStored = (key: string, fallback: any) => {
      const s = localStorage.getItem(key);
      try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
    };
    setLocations(getStored(CONSTANTS.STORAGE_LOCATIONS_KEY, []));
    const storedDrivers = getStored(CONSTANTS.STORAGE_DRIVERS_KEY, INITIAL_DRIVERS);
    setDrivers(storedDrivers.length >= INITIAL_DRIVERS.length ? storedDrivers : INITIAL_DRIVERS);
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
    if (isOnline) {
      const { error } = await supabase.from('drivers').upsert(newDriversList);
      if (error) handleError(error, "Update Drivers");
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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 p-4 sticky top-0 z-40 shadow-sm safe-top">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-lg">
               <PieChart size={20} />
             </div>
             <div>
               <div className="flex items-center gap-2">
                 <h1 className="text-sm font-black text-slate-900 tracking-tight">BAHATI PRO</h1>
                 <button 
                   onClick={() => fetchAllData()}
                   className={`text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-1 border transition-all ${isOnline ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-400 border-slate-200'}`}
                 >
                   <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                   {isOnline ? 'ONLINE' : 'OFFLINE (TAP TO RETRY)'}
                 </button>
               </div>
               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{currentUser.role} • {currentUser.name}</p>
             </div>
          </div>
          <div className="flex items-center gap-2">
             {transactions.some(t => !t.isSynced) && (
               <button onClick={syncOfflineData} disabled={isSyncing || !isOnline} className="p-2 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 transition-all disabled:opacity-30">
                 {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
               </button>
             )}
             <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="p-2 bg-slate-100 rounded-xl text-slate-600"><Globe size={18} /></button>
             <button onClick={() => setCurrentUser(null)} className="p-2 bg-rose-50 rounded-xl text-rose-500"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 lg:p-8 pb-32">
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
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 p-2 z-50 shadow-lg safe-bottom">
        <div className="max-w-2xl mx-auto flex justify-around items-center">
           <NavItem icon={<LayoutDashboard size={20}/>} label="Home" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
           <NavItem icon={<PlusCircle size={20}/>} label="Check" active={view === 'collect'} onClick={() => setView('collect')} />
           <NavItem icon={<PlusSquare size={20}/>} label="New" active={view === 'register'} onClick={() => setView('register')} />
           <NavItem icon={<CreditCard size={20}/>} label="Debt" active={view === 'debt'} onClick={() => setView('debt')} />
           {currentUser.role === 'admin' && <NavItem icon={<PieChart size={20}/>} label="Stats" active={view === 'reports'} onClick={() => setView('reports')} />}
           <NavItem icon={<Brain size={20}/>} label="AI" active={view === 'ai'} onClick={() => setView('ai')} />
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
