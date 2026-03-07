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
import BillingReconciliation from './components/BillingReconciliation';
import DriverManagement from './components/DriverManagement';
import { 
  LayoutDashboard, PlusCircle, CreditCard, PieChart, Brain, 
  LogOut, Globe, Loader2, CloudOff, Menu, X,
  CheckSquare, Crown, ShieldCheck, AlertTriangle,
  MapPin, Store, Users, FileSpreadsheet, History, Banknote
} from 'lucide-react';
import { supabase, checkDbHealth } from './supabaseClient';
import { Analytics } from '@vercel/analytics/react';
import { flushQueue, enqueueTransaction, getPendingTransactions } from './offlineQueue';

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
  const [view, setView] = useState<'dashboard' | 'settlement' | 'map' | 'sites' | 'team' | 'billing' | 'ai' | 'collect' | 'debt' | 'history' | 'reports'>('dashboard');
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

  // Memoize so these don't recompute on every render triggered by unrelated state changes
  const unsyncedCount = useMemo(
    () =>
      (Array.isArray(transactions) ? transactions.filter(t => !t.isSynced).length : 0) +
      (Array.isArray(dailySettlements) ? dailySettlements.filter(s => !s.isSynced).length : 0) +
      (Array.isArray(aiLogs) ? aiLogs.filter(l => !l.isSynced).length : 0),
    [transactions, dailySettlements, aiLogs]
  );

  const filteredData = useMemo(() => ({
    locations: !currentUser || currentUser.role === 'admin'
      ? (Array.isArray(locations) ? locations : [])
      : (Array.isArray(locations) ? locations.filter(l => l.assignedDriverId === currentUser.id) : []),
    transactions: !currentUser || currentUser.role === 'admin'
      ? (Array.isArray(transactions) ? transactions : [])
      : (Array.isArray(transactions) ? transactions.filter(t => t.driverId === currentUser.id) : []),
    dailySettlements: !currentUser || currentUser.role === 'admin'
      ? (Array.isArray(dailySettlements) ? dailySettlements : [])
      : (Array.isArray(dailySettlements) ? dailySettlements.filter(s => s.driverId === currentUser.id) : []),
    drivers: !currentUser || currentUser.role === 'admin'
      ? (Array.isArray(drivers) ? drivers : [])
      : (Array.isArray(drivers) ? drivers.filter(d => d.id === currentUser.id) : []),
  }), [currentUser, locations, transactions, dailySettlements, drivers]);

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
      
      // Heartbeat for Active Drivers (Safari compatibility added)
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

    // Listen for service worker background-sync message
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'FLUSH_OFFLINE_QUEUE') {
        syncOfflineData();
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);

    // Register background sync tag (Chrome/Edge only)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        if ('sync' in reg) {
          (reg as any).sync.register('bahati-flush-queue').catch(() => {});
        }
      }).catch(() => {});
    }

    return () => {
      clearInterval(timer);
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
    };
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
        // ── Flush IndexedDB offline queue first ────────────────────────────
        try {
          const flushed = await flushQueue(supabase, (done, total) => {
            console.log(`[OfflineQueue] Flushed ${done}/${total}`);
          });
          if (flushed > 0) {
            // Reload transactions from Supabase after flushing queue
            const { data } = await supabase.from('transactions').select('*').order('timestamp', { ascending: false }).limit(200);
            if (data) setTransactions(data.map((t: any) => ({ ...t, isSynced: true })));
          }
        } catch (e) {
          console.warn('[OfflineQueue] flush error (non-fatal):', e);
        }

        // ── Existing localStorage-based sync ──────────────────────────────
        const offlineTx = transactionsRef.current.filter(t => !t.isSynced);
        if (offlineTx.length > 0) {
            const { error } = await supabase.from('transactions').upsert(offlineTx.map(item => ({ ...item, isSynced: true })));
            if (!error) {
                const syncedIds = new Set(offlineTx.map(t => t.id));
                setTransactions(prev => prev.map(t => {
                    if (syncedIds.has(t.id)) {
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

    // Accumulate owner retention into dividendBalance
    const retentionAmount = tx.ownerRetention || 0;

    setLocations(prev => prev.map(l => 
      l.id === tx.locationId 
        ? { 
            ...l, 
            lastScore: tx.currentScore, 
            remainingStartupDebt: Math.max(0, l.remainingStartupDebt - (tx.startupDebtDeduction || 0)),
            dividendBalance: (l.dividendBalance || 0) + retentionAmount,
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
            const newDividend = (currentLoc.dividendBalance || 0) + retentionAmount;
            await supabase.from('locations').update({ 
              lastScore: tx.currentScore, 
              remainingStartupDebt: newDebt,
              dividendBalance: newDividend,
              isSynced: true 
            }).eq('id', tx.locationId);
            
            setLocations(prev => prev.map(l => l.id === tx.locationId ? { ...l, lastScore: tx.currentScore, remainingStartupDebt: newDebt, dividendBalance: newDividend, isSynced: true } : l));
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

  const isAdmin = currentUser.role === 'admin';

  // Badge counts for nav
  const pendingSettlementCount = dailySettlements.filter(s => s.status === 'pending').length;
  const pendingExpenseCount = transactions.filter(t => t.expenses > 0 && t.expenseStatus === 'pending').length;
  const anomalyCount = transactions.filter(t => t.isAnomaly === true && t.approvalStatus !== 'approved' && t.approvalStatus !== 'rejected').length;
  const totalApprovalBadge = pendingSettlementCount + pendingExpenseCount + anomalyCount + 
    transactions.filter(t => t.type === 'reset_request' && t.approvalStatus === 'pending').length +
    transactions.filter(t => t.type === 'payout_request' && t.approvalStatus === 'pending').length;

  // Page title mapping
  const pageTitles: Record<string, string> = {
    dashboard: 'Action Center',
    settlement: 'Settlement',
    map: 'Map & Routes',
    sites: 'Site Management',
    team: 'Team',
    billing: 'Billing',
    ai: 'AI Audit',
    collect: 'Collect',
    debt: 'Finance',
    history: 'History',
    reports: 'Reports',
  };

  // Admin sidebar nav items
  type NavItem = { id: string; icon: React.ReactNode; label: string; labelEn: string; badge?: number };
  const adminNavItems: NavItem[] = [
    { id: 'dashboard', icon: <LayoutDashboard size={18}/>, label: '工作台', labelEn: 'Overview' },
    { id: 'settlement', icon: <CheckSquare size={18}/>, label: '审批中心', labelEn: 'Approvals', badge: totalApprovalBadge },
    { id: 'map', icon: <MapPin size={18}/>, label: '地图与轨迹', labelEn: 'Map & Routes' },
    { id: 'sites', icon: <Store size={18}/>, label: '网点管理', labelEn: 'Sites' },
    { id: 'team', icon: <Users size={18}/>, label: '车队与薪资', labelEn: 'Fleet' },
    { id: 'billing', icon: <FileSpreadsheet size={18}/>, label: '月账单核对', labelEn: 'Billing' },
    { id: 'ai', icon: <Brain size={18}/>, label: 'AI 日志', labelEn: 'AI Logs' },
  ];

  // Dashboard tab mapping
  const getDashboardTab = (v: string): 'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'ai-logs' | 'tracking' => {
    if (v === 'settlement') return 'settlement';
    if (v === 'map') return 'tracking';
    if (v === 'sites') return 'locations';
    if (v === 'ai') return 'ai-logs';
    return 'overview';
  };

  const showDashboard = isAdmin ? ['dashboard', 'settlement', 'map', 'sites', 'ai'].includes(view) : view === 'settlement';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">

      {/* ── ADMIN: Left Sidebar ─────────────────────────────────────────────── */}
      {isAdmin && (
        <aside className="hidden md:flex flex-col w-[180px] lg:w-[200px] bg-slate-900 flex-shrink-0 h-full z-40">
          {/* Logo */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-amber-300 to-amber-600 text-slate-900 p-1.5 rounded-xl flex-shrink-0">
                <Crown size={16} fill="currentColor" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black text-white leading-tight">BAHATI JACKPOTS</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider leading-tight">Admin Console</p>
              </div>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
            {adminNavItems.map((item) => {
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id as any)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all relative group ${
                    active
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                      : 'text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="text-[10px] font-black uppercase leading-tight truncate">{item.label}</span>
                  {!active && item.badge > 0 && (
                    <span className="ml-auto flex-shrink-0 w-5 h-5 bg-amber-500 text-slate-900 rounded-full text-[8px] font-black flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                  {active && item.badge > 0 && (
                    <span className="ml-auto flex-shrink-0 w-5 h-5 bg-white/20 text-white rounded-full text-[8px] font-black flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Divider */}
            <div className="h-px bg-white/10 my-2" />

            {/* Secondary items */}
            {[
              { id: 'collect', icon: <PlusCircle size={18}/>, label: '采集录入' },
              { id: 'debt', icon: <CreditCard size={18}/>, label: '债务管理' },
              { id: 'reports', icon: <PieChart size={18}/>, label: '财务报表' },
              { id: 'history', icon: <History size={18}/>, label: '操作记录' },
            ].map((item) => {
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id as any)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                    active ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="text-[10px] font-black uppercase leading-tight truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* User + Sync Footer */}
          <div className="p-3 border-t border-white/10 space-y-2">
            <button
              onClick={syncOfflineData}
              disabled={isSyncing || !isOnline}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${
                isSyncing ? 'bg-slate-800 text-indigo-400' :
                !isOnline ? 'bg-rose-500/10 text-rose-400' :
                unsyncedCount > 0 ? 'bg-amber-500/20 text-amber-400 animate-pulse' :
                'bg-emerald-500/10 text-emerald-400'
              }`}
            >
              {isSyncing ? <Loader2 size={12} className="animate-spin"/> :
               !isOnline ? <CloudOff size={12}/> :
               unsyncedCount > 0 ? <AlertTriangle size={12}/> :
               <ShieldCheck size={12}/>}
              <span>{isSyncing ? 'Syncing...' : !isOnline ? 'Offline' : unsyncedCount > 0 ? `${unsyncedCount} Pending` : 'Cloud Synced'}</span>
            </button>
            <div className="flex items-center gap-2 px-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs flex-shrink-0">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-white truncate">{currentUser.name}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase">Admin User</p>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="p-1 bg-white/10 rounded-lg text-slate-400 hover:text-white"><Globe size={12}/></button>
                <button onClick={() => setCurrentUser(null)} className="p-1 bg-rose-500/20 rounded-lg text-rose-400"><LogOut size={12}/></button>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* ── Main Content Column ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
        <header className={`border-b flex-shrink-0 z-30 ${isAdmin ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/10'}`}>
          <div className="flex items-center justify-between px-4 py-3">
            {/* Left: mobile menu + page title */}
            <div className="flex items-center gap-3">
              {/* Mobile: show logo for driver or hamburger hint for admin */}
              {isAdmin ? (
                <div className="md:hidden flex items-center gap-2">
                  <div className="bg-gradient-to-br from-amber-300 to-amber-600 text-slate-900 p-1.5 rounded-xl">
                    <Crown size={14} fill="currentColor" />
                  </div>
                  <span className="text-xs font-black text-slate-900">BAHATI</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="bg-gradient-to-br from-amber-300 to-amber-600 text-slate-900 p-1.5 rounded-xl">
                    <Crown size={14} fill="currentColor" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-white leading-none">BAHATI</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase leading-none">{currentUser.name}</p>
                  </div>
                </div>
              )}
              {isAdmin && (
                <div className="hidden md:block">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{pageTitles[view] || 'ADMIN'}</p>
                </div>
              )}
            </div>

            {/* Right: sync + actions */}
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={syncOfflineData}
                  disabled={isSyncing || !isOnline}
                  className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all border ${
                    isSyncing ? 'bg-slate-50 border-slate-200 text-slate-400' :
                    !isOnline ? 'bg-rose-50 border-rose-200 text-rose-500' :
                    unsyncedCount > 0 ? 'bg-amber-50 border-amber-300 text-amber-700 animate-pulse' :
                    'bg-emerald-50 border-emerald-200 text-emerald-600'
                  }`}
                >
                  {isSyncing ? <Loader2 size={11} className="animate-spin"/> :
                   !isOnline ? <CloudOff size={11}/> :
                   unsyncedCount > 0 ? <AlertTriangle size={11}/> :
                   <ShieldCheck size={11}/>}
                  {isSyncing ? 'Syncing' : !isOnline ? 'Offline' : unsyncedCount > 0 ? `${unsyncedCount} Pending` : 'Synced'}
                </button>
              )}
              {!isAdmin && (
                <button
                  onClick={syncOfflineData}
                  disabled={isSyncing || !isOnline}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all ${
                    !isOnline ? 'bg-rose-500/10 text-rose-400' :
                    unsyncedCount > 0 ? 'bg-amber-500/20 text-amber-400 animate-pulse' :
                    'bg-emerald-500/10 text-emerald-400'
                  }`}
                >
                  {!isOnline ? <CloudOff size={11}/> : unsyncedCount > 0 ? <AlertTriangle size={11}/> : <ShieldCheck size={11}/>}
                  {!isOnline ? 'Offline' : unsyncedCount > 0 ? `${unsyncedCount}` : 'Synced'}
                </button>
              )}
              <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className={`p-2 rounded-xl ${isAdmin ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-white/10 text-white hover:bg-white/20'}`}><Globe size={15}/></button>
              <button onClick={() => setCurrentUser(null)} className="p-2 bg-rose-500/20 rounded-xl text-rose-400"><LogOut size={15}/></button>
            </div>
          </div>

          {/* Driver mobile nav tabs */}
          {!isAdmin && (
            <div className="flex border-t border-white/10">
              {[
                { id: 'collect', icon: <PlusCircle size={16}/>, label: t.collect },
                { id: 'settlement', icon: <Banknote size={16}/>, label: t.dailySettlement },
                { id: 'debt', icon: <CreditCard size={16}/>, label: t.debt },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id as any)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[9px] font-black uppercase transition-all ${
                    view === item.id ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-400'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Admin mobile bottom nav (shown below md) */}
          {isAdmin && (
            <div className="md:hidden flex border-t border-slate-100 overflow-x-auto scrollbar-hide">
              {adminNavItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id as any)}
                  className={`flex flex-col items-center gap-0.5 px-3 py-2 text-[7px] font-black uppercase whitespace-nowrap transition-all flex-shrink-0 relative ${
                    view === item.id ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'
                  }`}
                >
                  {item.icon}
                  <span>{item.labelEn}</span>
                  {item.badge > 0 && (
                    <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-amber-500 text-white rounded-full text-[6px] font-black flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* ── Page Content ───────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">

            {/* Admin: Dashboard views (overview / settlement / map / sites / ai) */}
            {isAdmin && showDashboard && (
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
                onNavigate={(v) => setView(v as any)}
                initialTab={getDashboardTab(view)}
                hideTabs={true}
              />
            )}

            {/* Driver: settlement view via Dashboard */}
            {!isAdmin && view === 'settlement' && (
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
                onNavigate={(v) => setView(v as any)}
                initialTab="settlement"
                hideTabs={true}
              />
            )}

            {/* Team / Fleet Management */}
            {view === 'team' && isAdmin && (
              <DriverManagement
                drivers={filteredData.drivers}
                transactions={filteredData.transactions}
                dailySettlements={filteredData.dailySettlements}
                onUpdateDrivers={handleUpdateDrivers}
              />
            )}

            {/* Monthly Billing */}
            {view === 'billing' && isAdmin && (
              <BillingReconciliation
                drivers={filteredData.drivers}
                transactions={filteredData.transactions}
                dailySettlements={filteredData.dailySettlements}
              />
            )}

            {/* Collection Form */}
            {view === 'collect' && (
              <CollectionForm
                locations={filteredData.locations}
                currentDriver={drivers.find(d => d.id === currentUser.id) || drivers[0]}
                onSubmit={handleNewTransaction}
                lang={lang}
                onLogAI={handleLogAI}
                isOnline={isOnline}
                allTransactions={filteredData.transactions}
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

            {view === 'history' && (
              <TransactionHistory transactions={filteredData.transactions} locations={locations} onAnalyze={(id) => {}} />
            )}
            {view === 'reports' && (
              <FinancialReports transactions={filteredData.transactions} drivers={filteredData.drivers} locations={filteredData.locations} dailySettlements={filteredData.dailySettlements} lang={lang} />
            )}
            {view === 'debt' && (
              <DebtManager drivers={filteredData.drivers} locations={filteredData.locations} currentUser={currentUser} onUpdateLocations={handleUpdateLocations} lang={lang} />
            )}
            {view === 'ai' && !showDashboard && isAdmin && (
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
          </div>
        </main>
      </div>

      <Analytics />
    </div>
  );
};

const AppWithBoundary: React.FC = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default AppWithBoundary;
