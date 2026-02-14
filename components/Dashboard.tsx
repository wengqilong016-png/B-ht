
import React, { useMemo, useState, useEffect } from 'react';
import { Coins, MapPin, Radio, Search, ExternalLink, Map as MapIcon, Truck, Wallet, Calculator, AlertTriangle, CheckCircle2, Banknote, Plus, X, Save, User, Key, Phone, Pencil, Clock, Loader2, CalendarRange, Calendar, FileText, ChevronRight, Receipt, Fuel, Wrench, Gavel, MoreHorizontal, AlertCircle, Building2, HandCoins, Camera, Info, Share2, Printer, Navigation, Download, ShieldCheck, Percent, LayoutList, TrendingUp, TrendingDown, Target, BellRing, Layers, Settings, BrainCircuit, Store, Signal, Smartphone, ThumbsUp, ThumbsDown, ArrowUpDown, ArrowUp, ArrowDown, Link, FileClock } from 'lucide-react';
import { Transaction, Driver, Location, CONSTANTS, User as UserType, DailySettlement, TRANSLATIONS, AILog } from '../types';
import DriverManagement from './DriverManagement';
import SmartInsights from './SmartInsights';

interface DashboardProps {
  transactions: Transaction[];
  drivers: Driver[];
  locations: Location[];
  dailySettlements: DailySettlement[];
  aiLogs: AILog[]; 
  currentUser: UserType;
  onUpdateDrivers: (drivers: Driver[]) => void;
  onUpdateLocations: (locations: Location[]) => void;
  onUpdateTransaction: (txId: string, updates: Partial<Transaction>) => void;
  onNewTransaction: (tx: Transaction) => void;
  onSaveSettlement: (settlement: DailySettlement) => void;
  onSync: () => Promise<void>;
  isSyncing: boolean;
  offlineCount: number;
  lang: 'zh' | 'sw';
  onNavigate?: (view: any) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ transactions, drivers, locations, dailySettlements, aiLogs, currentUser, onUpdateDrivers, onUpdateLocations, onUpdateTransaction, onNewTransaction, onSaveSettlement, onSync, isSyncing, offlineCount, lang, onNavigate }) => {
  const t = TRANSLATIONS[lang];
  const isAdmin = currentUser.role === 'admin';
  const [activeTab, setActiveTab] = useState<'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'ai-logs'>(isAdmin ? 'overview' : 'settlement');
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [selectedDriverFilter, setSelectedDriverFilter] = useState<string | null>(null);

  const [actualCash, setActualCash] = useState<string>('');
  const [actualCoins, setActualCoins] = useState<string>('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastSettlement, setLastSettlement] = useState<DailySettlement | null>(null);
  const [showAssetMap, setShowAssetMap] = useState(false);
  
  // Custom Map State
  const [mapMode, setMapMode] = useState<'live' | 'strategy'>('live');
  const [customMapUrl, setCustomMapUrl] = useState('');
  const [isSettingMap, setIsSettingMap] = useState(false);

  // Edit Location State
  const [editingLoc, setEditingLoc] = useState<Location | null>(null);
  const [locEditForm, setLocEditForm] = useState({ name: '', commissionRate: '', lastScore: '', status: 'active' as Location['status'] });

  // Sites / Locations Tab State
  const [siteSearch, setSiteSearch] = useState('');
  const [siteFilterStatus, setSiteFilterStatus] = useState<'all' | 'active' | 'maintenance' | 'broken'>('all');
  const [siteFilterArea, setSiteFilterArea] = useState<string>('all');
  const [siteSort, setSiteSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

  // AI Logs Search State
  const [aiLogSearch, setAiLogSearch] = useState('');

  // Load custom map URL
  useEffect(() => {
    const savedUrl = localStorage.getItem('kiosk_custom_map_url');
    if (savedUrl) setCustomMapUrl(savedUrl);
  }, []);

  const saveCustomMap = () => {
    let urlToSave = customMapUrl;
    if (customMapUrl.includes('<iframe')) {
      const match = customMapUrl.match(/src="([^"]+)"/);
      if (match && match[1]) urlToSave = match[1];
    }
    localStorage.setItem('kiosk_custom_map_url', urlToSave);
    setCustomMapUrl(urlToSave);
    setIsSettingMap(false);
  };

  const myTransactions = useMemo(() => isAdmin ? transactions : transactions.filter(t => t.driverId === currentUser.id), [transactions, currentUser, isAdmin]);
  const myProfile = useMemo(() => drivers.find(d => d.id === (isAdmin ? drivers[0]?.id : currentUser.id)), [drivers, currentUser, isAdmin]);

  const myArrears = useMemo(() => myTransactions.filter(tx => tx.paymentStatus === 'unpaid'), [myTransactions]);
  const totalArrears = useMemo(() => myArrears.reduce((sum, tx) => sum + tx.netPayable, 0), [myArrears]);
  
  // Expenses that need approval
  const pendingExpenses = useMemo(() => {
    return transactions.filter(tx => tx.expenses > 0 && tx.expenseStatus === 'pending');
  }, [transactions]);

  // --- Sites Logic ---
  const allAreas = useMemo(() => Array.from(new Set(locations.map(l => l.area))).sort(), [locations]);
  
  const managedLocations = useMemo(() => {
    return locations.filter(l => {
      const searchQ = siteSearch.toLowerCase();
      const matchSearch = l.name.toLowerCase().includes(searchQ) || 
                          l.machineId.toLowerCase().includes(searchQ) || 
                          l.area.toLowerCase().includes(searchQ);
      const matchStatus = siteFilterStatus === 'all' || l.status === siteFilterStatus;
      const matchArea = siteFilterArea === 'all' || l.area === siteFilterArea;
      return matchSearch && matchStatus && matchArea;
    }).sort((a, b) => {
      const dir = siteSort.direction === 'asc' ? 1 : -1;
      let valA: any = '';
      let valB: any = '';

      switch (siteSort.key) {
        case 'name':
          valA = a.name; valB = b.name;
          break;
        case 'status':
          valA = a.status; valB = b.status;
          break;
        case 'lastScore':
          valA = a.lastScore; valB = b.lastScore;
          break;
        case 'commission':
          valA = a.commissionRate; valB = b.commissionRate;
          break;
        default:
          return 0;
      }

      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });
  }, [locations, siteSearch, siteFilterStatus, siteFilterArea, siteSort]);

  const filteredAiLogs = useMemo(() => {
    if (!aiLogSearch) return aiLogs;
    const q = aiLogSearch.toLowerCase();
    return aiLogs.filter(log => 
      log.driverName.toLowerCase().includes(q) || 
      log.query.toLowerCase().includes(q) || 
      log.response.toLowerCase().includes(q) ||
      log.modelUsed.toLowerCase().includes(q)
    );
  }, [aiLogs, aiLogSearch]);

  const toggleSort = (key: string) => {
    setSiteSort(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (siteSort.key !== column) return <ArrowUpDown size={12} className="opacity-20 ml-1 inline" />;
    return siteSort.direction === 'asc' 
        ? <ArrowUp size={12} className="text-indigo-600 ml-1 inline" /> 
        : <ArrowDown size={12} className="text-indigo-600 ml-1 inline" />;
  };

  const siteStats = useMemo(() => {
    const total = locations.length;
    const active = locations.filter(l => l.status === 'active').length;
    const broken = locations.filter(l => l.status === 'broken').length;
    const maintenance = locations.filter(l => l.status === 'maintenance').length;
    const activeRate = total > 0 ? (active / total) * 100 : 0;
    return { total, active, broken, maintenance, activeRate };
  }, [locations]);

  // --- Boss Intelligence Logic ---
  const bossStats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // 1. Stagnant Machines
    const lastTxDateMap: Record<string, string> = {};
    transactions.forEach(t => {
      if (!lastTxDateMap[t.locationId] || t.timestamp > lastTxDateMap[t.locationId]) {
        lastTxDateMap[t.locationId] = t.timestamp;
      }
    });

    const stagnantMachines = locations.filter(l => {
       const lastDate = lastTxDateMap[l.id];
       if (!lastDate) return true;
       const diffTime = Math.abs(now.getTime() - new Date(lastDate).getTime());
       const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
       return diffDays > 7;
    });

    // 2. High Risk Drivers
    const riskyDrivers = drivers.filter(d => d.remainingDebt > 100000);

    // 3. Revenue Pulse
    const todayRev = transactions.filter(t => t.timestamp.startsWith(todayStr)).reduce((sum, t) => sum + t.revenue, 0);
    const yesterdayRev = transactions.filter(t => t.timestamp.startsWith(yesterdayStr)).reduce((sum, t) => sum + t.revenue, 0);
    const trend = yesterdayRev === 0 ? 100 : ((todayRev - yesterdayRev) / yesterdayRev) * 100;

    return { stagnantMachines, riskyDrivers, todayRev, trend };
  }, [locations, transactions, drivers]);

  const dailyStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    // IMPORTANT: Exclude PRIVATE expenses from the "Company Expenses" total to avoid confusing Profit/Loss
    const todaysCollections = myTransactions.filter(t => t.timestamp.startsWith(today) && t.type !== 'expense');
    
    const totalRev = todaysCollections.reduce((acc, tx) => acc + tx.revenue, 0);
    
    // Expenses here refers to public expenses that reduce NET cash but are company costs
    const totalPublicExp = myTransactions
      .filter(t => t.timestamp.startsWith(today) && t.expenses > 0 && t.expenseType === 'public')
      .reduce((acc, tx) => acc + tx.expenses, 0);
      
    // Note: Net Payable already deducts expenses (public OR private) in CollectionForm
    const totalNetPayable = todaysCollections.reduce((acc, tx) => acc + tx.netPayable, 0);
    
    const float = isAdmin ? drivers.reduce((sum, d) => sum + (d.status === 'active' ? d.dailyFloatingCoins : 0), 0) : (myProfile?.dailyFloatingCoins || 0);
    const expectedTotal = totalNetPayable + float;
    const todaySettlement = dailySettlements.find(s => s.date === today && (isAdmin ? true : s.adminId === currentUser.id));

    return { totalRev, totalPublicExp, totalNetPayable, expectedTotal, float, todaysTx: todaysCollections, isSettled: !!todaySettlement, todaySettlement };
  }, [myTransactions, myProfile, dailySettlements, drivers, isAdmin, currentUser.id]);

  const shortage = useMemo(() => {
    const totalActual = (parseInt(actualCash) || 0) + (parseInt(actualCoins) || 0);
    return totalActual - dailyStats.expectedTotal;
  }, [actualCash, actualCoins, dailyStats.expectedTotal]);

  const filteredLocations = useMemo(() => {
    let result = locations;
    if (selectedDriverFilter) result = result.filter(l => l.assignedDriverId === selectedDriverFilter);
    if (mapSearchQuery) {
      const q = mapSearchQuery.toLowerCase();
      result = result.filter(l => l.name.toLowerCase().includes(q) || l.machineId.toLowerCase().includes(q));
    }
    return result;
  }, [locations, selectedDriverFilter, mapSearchQuery]);

  const handleSettlement = async () => {
    if (offlineCount > 0) {
        if (!confirm(lang === 'zh' ? '检测到未同步记录，是否立即同步并结账？' : 'Kazi hazijatunwa Cloud bado, tuma sasa?')) return;
        await onSync();
    }
    const settlementData: DailySettlement = {
        id: `S-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        adminId: currentUser.id,
        adminName: currentUser.name,
        totalRevenue: dailyStats.totalRev, 
        totalNetPayable: dailyStats.totalNetPayable, 
        totalExpenses: dailyStats.totalPublicExp,
        driverFloat: dailyStats.float, 
        expectedTotal: dailyStats.expectedTotal,
        actualCash: parseInt(actualCash) || 0, 
        actualCoins: parseInt(actualCoins) || 0,
        shortage: shortage, 
        timestamp: new Date().toISOString()
    };
    onSaveSettlement(settlementData);
    setLastSettlement(settlementData);
    setShowSuccessModal(true);
    setActualCash(''); setActualCoins('');
  };

  const handleEditLocation = (loc: Location) => {
    setEditingLoc(loc);
    setLocEditForm({
      name: loc.name,
      commissionRate: (loc.commissionRate * 100).toString(),
      lastScore: loc.lastScore.toString(),
      status: loc.status
    });
  };

  const saveLocEdit = () => {
    if (!editingLoc) return;
    const updatedLocations = locations.map(l => l.id === editingLoc.id ? {
      ...l,
      name: locEditForm.name,
      commissionRate: (parseFloat(locEditForm.commissionRate) || 15) / 100,
      lastScore: parseInt(locEditForm.lastScore) || 0,
      status: locEditForm.status
    } : l);
    onUpdateLocations(updatedLocations);
    setEditingLoc(null);
  };

  const handleExpenseAction = (tx: Transaction, action: 'approve' | 'reject') => {
    // 1. Update Transaction Status
    onUpdateTransaction(tx.id, { expenseStatus: action === 'approve' ? 'approved' : 'rejected' });

    // 2. Handle Debt Logic
    const driver = drivers.find(d => d.id === tx.driverId);
    if (!driver) return;

    let debtAdjustment = 0;
    
    if (action === 'approve') {
       if (tx.expenseType === 'private') {
         // Approved Private expense: Add to debt (Company lent money)
         debtAdjustment = tx.expenses;
       }
       // Approved Public expense: No debt change (Company absorbed cost)
    } else {
       // Rejected (Any type): Add to debt (Driver took money but shouldn't have)
       debtAdjustment = tx.expenses;
    }

    if (debtAdjustment > 0) {
      const updatedDrivers = drivers.map(d => 
        d.id === driver.id ? { ...d, remainingDebt: d.remainingDebt + debtAdjustment } : d
      );
      onUpdateDrivers(updatedDrivers);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 border-b border-slate-200 pb-2 mb-6 overflow-x-auto scrollbar-hide">
        {isAdmin && <button onClick={() => setActiveTab('overview')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'overview' ? 'text-indigo-600' : 'text-slate-400'}`}>总览 COCKPIT {activeTab === 'overview' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
        {isAdmin && <button onClick={() => setActiveTab('locations')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'locations' ? 'text-indigo-600' : 'text-slate-400'}`}>点位管理 SITES {activeTab === 'locations' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
        <button onClick={() => setActiveTab('settlement')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'settlement' ? 'text-indigo-600' : 'text-slate-400'}`}>{t.dailySettlement} {activeTab === 'settlement' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>
        {!isAdmin && <button onClick={() => setActiveTab('arrears')} className={`pb-2 text-[11px] font-black uppercase relative transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'arrears' ? 'text-indigo-600' : 'text-slate-400'}`}>{t.arrears} {activeTab === 'arrears' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
        {isAdmin && <button onClick={() => setActiveTab('team')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'team' ? 'text-indigo-600' : 'text-slate-400'}`}>车队 FLEET {activeTab === 'team' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
        {isAdmin && <button onClick={() => setActiveTab('ai-logs')} className={`pb-2 text-[11px] font-black uppercase relative transition-all flex items-center gap-1 whitespace-nowrap ${activeTab === 'ai-logs' ? 'text-indigo-600' : 'text-slate-400'}`}><BrainCircuit size={14}/> AI LOGS {activeTab === 'ai-logs' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
      </div>

      {activeTab === 'overview' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           {/* Expense Approvals Section */}
           {pendingExpenses.length > 0 && (
             <div className="bg-white p-5 rounded-[28px] border-2 border-amber-100 shadow-sm mb-4 relative overflow-hidden">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><AlertCircle size={18} /></div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">待审批支出 ({pendingExpenses.length})</h3>
                </div>
                <div className="space-y-3">
                  {pendingExpenses.map(tx => {
                    const driverName = drivers.find(d => d.id === tx.driverId)?.name || 'Unknown';
                    return (
                      <div key={tx.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 p-4 rounded-2xl gap-4">
                         <div>
                            <div className="flex items-center gap-2 mb-1">
                               <span className="text-xs font-black text-slate-900">{driverName}</span>
                               <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${tx.expenseType === 'public' ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'}`}>
                                 {tx.expenseType === 'public' ? '公款报销' : '个人借款'}
                               </span>
                            </div>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">
                              {tx.expenseCategory} • TZS {tx.expenses.toLocaleString()}
                            </p>
                         </div>
                         <div className="flex gap-2 w-full sm:w-auto">
                            <button onClick={() => handleExpenseAction(tx, 'approve')} className="flex-1 sm:flex-none px-4 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 flex items-center justify-center gap-1"><ThumbsUp size={12} /> 通过</button>
                            <button onClick={() => handleExpenseAction(tx, 'reject')} className="flex-1 sm:flex-none px-4 py-2 bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase hover:bg-rose-600 flex items-center justify-center gap-1"><ThumbsDown size={12} /> 驳回</button>
                         </div>
                      </div>
                    );
                  })}
                </div>
             </div>
           )}

           {/* Boss Cockpit Section */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
              <div className="bg-slate-900 text-white p-5 rounded-[28px] relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp size={80} /></div>
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">今日营收 Revenue</h4>
                 <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black">TZS {bossStats.todayRev.toLocaleString()}</span>
                 </div>
                 <div className={`inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-lg text-[9px] font-black uppercase ${bossStats.trend >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {bossStats.trend >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {Math.abs(bossStats.trend).toFixed(1)}% vs Yesterday
                 </div>
              </div>

              <div className={`p-5 rounded-[28px] border-2 relative overflow-hidden ${bossStats.stagnantMachines.length > 0 ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-100'}`}>
                 <h4 className={`text-[10px] font-black uppercase tracking-widest mb-2 ${bossStats.stagnantMachines.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                    <AlertCircle size={14} className="inline mr-1" /> 异常静默机器 (&gt; Days)
                 </h4>
                 <div className="flex items-center justify-between">
                    <span className={`text-2xl font-black ${bossStats.stagnantMachines.length > 0 ? 'text-amber-600' : 'text-slate-300'}`}>{bossStats.stagnantMachines.length}</span>
                    {bossStats.stagnantMachines.length > 0 && (
                       <button onClick={() => setMapSearchQuery('active')} className="px-3 py-1.5 bg-amber-200 text-amber-800 rounded-full text-[9px] font-black uppercase">查看详情</button>
                    )}
                 </div>
              </div>

              <div className={`p-5 rounded-[28px] border-2 relative overflow-hidden ${bossStats.riskyDrivers.length > 0 ? 'bg-rose-50 border-rose-100' : 'bg-white border-slate-100'}`}>
                 <h4 className={`text-[10px] font-black uppercase tracking-widest mb-2 ${bossStats.riskyDrivers.length > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                    <Wallet size={14} className="inline mr-1" /> 高风险欠款司机 (&gt;100k)
                 </h4>
                 <div className="flex items-center justify-between">
                    <span className={`text-2xl font-black ${bossStats.riskyDrivers.length > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{bossStats.riskyDrivers.length}</span>
                    <button onClick={() => setActiveTab('team')} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-full text-[9px] font-black uppercase">管理车队</button>
                 </div>
              </div>
           </div>

           {/* Quick Actions Bar */}
           <div className="flex items-center gap-3 overflow-x-auto pb-2">
              <button 
                onClick={() => setShowAssetMap(true)} 
                className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200 active:scale-95 transition-all whitespace-nowrap"
              >
                <MapIcon size={16} />
                <span className="text-xs font-black uppercase">全网资产地图 (Map)</span>
              </button>
              
              {/* Added Check-in Management Button */}
              <button 
                onClick={() => onNavigate && onNavigate('history')} 
                className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl shadow-sm hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all whitespace-nowrap"
              >
                <FileClock size={16} className="text-emerald-500" />
                <span className="text-xs font-black uppercase">打卡记录管理 (Check-in History)</span>
              </button>

              <div className="h-8 w-px bg-slate-200 mx-2"></div>
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-3 flex-1 min-w-[200px] shadow-sm">
                 <Search size={16} className="text-slate-400" />
                 <input type="text" placeholder="搜索点位 Search..." value={mapSearchQuery} onChange={e => setMapSearchQuery(e.target.value)} className="bg-transparent text-xs font-bold text-slate-900 outline-none w-full" />
              </div>
           </div>

           {/* Smart Insights Component Integration */}
           <SmartInsights transactions={transactions} locations={locations} />

           <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mt-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-100 rounded-2xl text-slate-600"><LayoutList size={20} /></div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 leading-tight">最近活跃点位 RECENT ACTIVITY</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Sites: {filteredLocations.length}</p>
                </div>
              </div>
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredLocations.slice(0, 8).map(loc => (
                <div key={loc.id} className="bg-white p-5 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                     <div className="flex flex-col">
                        <span className="text-[10px] font-black text-indigo-500 uppercase">{loc.machineId}</span>
                        <h4 className="font-black text-slate-900 text-sm leading-tight line-clamp-1">{loc.name}</h4>
                        <div className="flex items-center gap-1.5 mt-1">
                           <span className="text-[9px] font-bold text-slate-400 uppercase">{loc.area}</span>
                           <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                           <span className="text-[9px] font-black text-indigo-600">分红: {(loc.commissionRate * 100).toFixed(0)}%</span>
                        </div>
                     </div>
                     <div className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${loc.status === 'active' ? 'bg-emerald-50 text-white' : 'bg-amber-500 text-white'}`}>
                        {loc.status === 'active' ? '在线 ON' : '故障 FIX'}
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-4">
                     <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase">当前读数 SCORE</p>
                        <p className="text-xs font-black text-slate-900">{loc.lastScore.toLocaleString()}</p>
                     </div>
                     <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase">点位分红 RATE</p>
                        <p className="text-xs font-black text-indigo-600">{(loc.commissionRate * 100).toFixed(0)}%</p>
                     </div>
                  </div>

                  <div className="flex gap-2">
                     <button onClick={() => loc.coords && window.open(`https://www.google.com/maps/dir/?api=1&destination=${loc.coords.lat},${loc.coords.lng}`, '_blank')} className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1.5 active:scale-95 shadow-md">
                       <Navigation size={12} /> 导航
                     </button>
                     <button onClick={() => handleEditLocation(loc)} className="p-3 bg-slate-100 text-slate-400 rounded-xl hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                       <Pencil size={14} />
                     </button>
                  </div>
                </div>
              ))}
           </div>
        </div>
      )}

      {/* New Locations / Sites Management Tab */}
      {activeTab === 'locations' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           {/* Summary Cards */}
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center gap-3 text-slate-400 mb-2">
                   <Store size={18} />
                   <span className="text-[9px] font-black uppercase tracking-widest">总机器数 Total</span>
                </div>
                <p className="text-3xl font-black text-slate-900">{siteStats.total}</p>
              </div>
              <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center gap-3 text-emerald-500 mb-2">
                   <Signal size={18} />
                   <span className="text-[9px] font-black uppercase tracking-widest">在线 Active</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black text-emerald-600">{siteStats.active}</p>
                  <span className="text-[10px] font-bold text-emerald-400">{siteStats.activeRate.toFixed(0)}% Rate</span>
                </div>
              </div>
              <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center gap-3 text-amber-500 mb-2">
                   <Wrench size={18} />
                   <span className="text-[9px] font-black uppercase tracking-widest">维护 Maintenance</span>
                </div>
                <p className="text-3xl font-black text-amber-600">{siteStats.maintenance}</p>
              </div>
              <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center gap-3 text-rose-500 mb-2">
                   <AlertTriangle size={18} />
                   <span className="text-[9px] font-black uppercase tracking-widest">故障 Broken</span>
                </div>
                <p className="text-3xl font-black text-rose-600">{siteStats.broken}</p>
              </div>
           </div>

           {/* Filter Toolbar */}
           <div className="bg-white p-4 rounded-[28px] border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-4 w-full md:w-auto">
                 <div className="relative flex-1 md:w-64">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Search Name, ID, Area..." 
                      value={siteSearch} 
                      onChange={e => setSiteSearch(e.target.value)} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 transition-all"
                    />
                 </div>
                 <div className="h-8 w-px bg-slate-200 hidden md:block"></div>
                 <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto">
                    {(['all', 'active', 'maintenance', 'broken'] as const).map(s => (
                      <button 
                        key={s} 
                        onClick={() => setSiteFilterStatus(s)} 
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${siteFilterStatus === s ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                      >
                        {s}
                      </button>
                    ))}
                 </div>
              </div>
              
              <div className="flex items-center gap-2 w-full md:w-auto">
                 <MapPin size={16} className="text-slate-400" />
                 <select 
                   value={siteFilterArea} 
                   onChange={e => setSiteFilterArea(e.target.value)} 
                   className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-xs font-black text-slate-700 outline-none min-w-[140px]"
                 >
                   <option value="all">ALL AREAS</option>
                   {allAreas.map(a => <option key={a} value={a}>{a}</option>)}
                 </select>
              </div>
           </div>

           {/* Detailed Table / List */}
           <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                 <thead className="bg-slate-50 border-b border-slate-100">
                   <tr>
                     <th onClick={() => toggleSort('name')} className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase cursor-pointer hover:text-indigo-500 transition-colors">Machine / Name <SortIcon column="name" /></th>
                     <th className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase">Driver / Contact</th>
                     <th onClick={() => toggleSort('status')} className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase cursor-pointer hover:text-indigo-500 transition-colors">Status <SortIcon column="status" /></th>
                     <th onClick={() => toggleSort('lastScore')} className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase text-right cursor-pointer hover:text-indigo-500 transition-colors">Last Score <SortIcon column="lastScore" /></th>
                     <th onClick={() => toggleSort('commission')} className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase text-right cursor-pointer hover:text-indigo-500 transition-colors">Commission <SortIcon column="commission" /></th>
                     <th className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                   {managedLocations.map(loc => {
                     const driver = drivers.find(d => d.id === loc.assignedDriverId);
                     return (
                       <tr key={loc.id} className="hover:bg-slate-50/80 transition-colors group">
                         <td className="px-6 py-4">
                           <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 uppercase">{loc.machineId.slice(-3)}</div>
                             <div>
                               <p className="text-xs font-black text-slate-900">{loc.name}</p>
                               <div className="flex items-center gap-1.5 mt-0.5">
                                 <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[8px] font-bold text-slate-500 uppercase">{loc.machineId}</span>
                                 <span className="text-[8px] font-bold text-slate-400 uppercase">{loc.area}</span>
                               </div>
                             </div>
                           </div>
                         </td>
                         <td className="px-6 py-4">
                           <div className="flex items-center gap-2">
                             {driver ? (
                               <>
                                 <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[9px] font-black text-indigo-600">{driver.name.charAt(0)}</div>
                                 <div>
                                   <p className="text-[10px] font-bold text-slate-700">{driver.name}</p>
                                   <p className="text-[8px] text-slate-400">{loc.shopOwnerPhone || 'No Phone'}</p>
                                 </div>
                               </>
                             ) : (
                               <span className="text-[10px] text-slate-400 italic">Unassigned</span>
                             )}
                           </div>
                         </td>
                         <td className="px-6 py-4">
                           <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${loc.status === 'active' ? 'bg-emerald-50 text-emerald-600' : loc.status === 'maintenance' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>
                             {loc.status}
                           </span>
                         </td>
                         <td className="px-6 py-4 text-right">
                           <p className="text-xs font-black text-slate-900">{loc.lastScore.toLocaleString()}</p>
                         </td>
                         <td className="px-6 py-4 text-right">
                           <p className="text-xs font-black text-indigo-600">{(loc.commissionRate * 100).toFixed(0)}%</p>
                         </td>
                         <td className="px-6 py-4 text-right">
                           <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={() => loc.coords && window.open(`https://www.google.com/maps/dir/?api=1&destination=${loc.coords.lat},${loc.coords.lng}`, '_blank')} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200"><Navigation size={14}/></button>
                             <button onClick={() => handleEditLocation(loc)} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"><Pencil size={14}/></button>
                           </div>
                         </td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
               {managedLocations.length === 0 && (
                 <div className="p-12 text-center text-slate-400">
                   <Store size={48} className="mx-auto mb-4 opacity-20" />
                   <p className="text-xs font-black uppercase tracking-widest">暂无匹配点位数据</p>
                 </div>
               )}
             </div>
           </div>
        </div>
      )}

      {/* Asset Map Modal - Enhanced for Boss Strategy */}
      {showAssetMap && (
        <div className="fixed inset-0 z-[60] bg-slate-900 flex flex-col animate-in fade-in">
           <div className="absolute top-6 left-6 right-6 z-20 flex justify-between items-start pointer-events-none">
              <div className="bg-white/90 backdrop-blur-md px-5 py-3 rounded-2xl shadow-xl pointer-events-auto flex flex-col gap-2">
                 <div className="flex items-center gap-2">
                   <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2"><MapIcon size={16} className="text-indigo-600" /> 全网资产分布</h3>
                   <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[9px] font-bold">{locations.length} Units</span>
                 </div>
                 
                 {/* Map Type Switcher */}
                 <div className="flex bg-slate-100 p-1 rounded-xl pointer-events-auto">
                    <button 
                      onClick={() => setMapMode('live')} 
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1 ${mapMode === 'live' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                    >
                      <Layers size={12} /> 实时车队 (Live)
                    </button>
                    <button 
                      onClick={() => setMapMode('strategy')} 
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1 ${mapMode === 'strategy' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}
                    >
                      <Target size={12} /> 战略地图 (My Map)
                    </button>
                 </div>
              </div>

              <div className="flex gap-2 pointer-events-auto">
                 {mapMode === 'strategy' && (
                   <button onClick={() => setIsSettingMap(true)} className="p-3 bg-white text-slate-900 rounded-full shadow-xl active:scale-90 transition-transform"><Settings size={20} /></button>
                 )}
                 <button onClick={() => setShowAssetMap(false)} className="p-3 bg-white text-slate-900 rounded-full shadow-xl active:scale-90 transition-transform"><X size={20} /></button>
              </div>
           </div>

           <div className="flex-1 relative bg-slate-800">
             {mapMode === 'live' ? (
                <iframe 
                  width="100%" 
                  height="100%" 
                  frameBorder="0" 
                  src={`https://maps.google.com/maps?q=${locations[0]?.coords?.lat || -6.82},${locations[0]?.coords?.lng || 39.25}&z=12&output=embed`}
                  className="grayscale-[0.3] opacity-80"
                />
             ) : (
                customMapUrl ? (
                  <iframe 
                    src={customMapUrl}
                    width="100%" 
                    height="100%"
                    className="w-full h-full"
                  ></iframe>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white space-y-4 p-8 text-center">
                     <MapIcon size={48} className="opacity-20" />
                     <h3 className="text-xl font-black">配置您的“老板战略地图”</h3>
                     <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                       您可以将 Google My Maps (我的地图) 中的私人标注点位（如历史机器、竞争对手、潜在点位）叠加显示在这里。
                     </p>
                     <button onClick={() => setIsSettingMap(true)} className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-emerald-900/50">
                        立即配置链接
                     </button>
                  </div>
                )
             )}

             {/* Live Mode Legend */}
             {mapMode === 'live' && (
                <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none">
                  <div className="bg-indigo-600 text-white px-6 py-3 rounded-full shadow-2xl font-black text-xs uppercase tracking-widest animate-bounce">
                      显示 App 实时录入的机器坐标
                  </div>
                </div>
             )}
           </div>

           {/* Map Settings Modal */}
           {isSettingMap && (
             <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
                <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl">
                   <h3 className="text-lg font-black text-slate-900 mb-2">设置战略地图链接</h3>
                   <p className="text-[10px] text-slate-500 font-bold uppercase mb-6">Google My Maps Embed URL</p>
                   
                   <div className="space-y-4">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                         <ol className="list-decimal list-inside text-[10px] text-slate-500 space-y-1 font-bold">
                           <li>打开 Google My Maps (google.com/mymaps)</li>
                           <li>点击“分享 (Share)” 并开启“公开 (Public)”</li>
                           <li>点击菜单中的 “Embed on my site”</li>
                           <li>复制 &lt;iframe&gt; 代码或 src 链接填入下方</li>
                         </ol>
                      </div>
                      
                      <textarea 
                        value={customMapUrl}
                        onChange={e => setCustomMapUrl(e.target.value)}
                        placeholder='Paste <iframe src="..."> or URL here...'
                        className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono outline-none focus:border-indigo-500"
                      />
                      
                      <div className="flex gap-3">
                         <button onClick={() => setIsSettingMap(false)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-black text-xs uppercase">取消</button>
                         <button onClick={saveCustomMap} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase shadow-lg">保存配置</button>
                      </div>
                   </div>
                </div>
             </div>
           )}
        </div>
      )}

      {/* Edit Location Modal */}
      {editingLoc && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="bg-slate-900 p-8 text-white relative">
                 <button onClick={() => setEditingLoc(null)} className="absolute top-6 right-6 p-2 bg-white/10 rounded-full"><X size={18} /></button>
                 <h3 className="text-xl font-black uppercase">配置修改 CONFIG</h3>
                 <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{editingLoc.machineId} • {editingLoc.name}</p>
              </div>
              <div className="p-8 space-y-5">
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase">点位名称 SITE NAME</label>
                    <input type="text" value={locEditForm.name} onChange={e => setLocEditForm({...locEditForm, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none" />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-slate-400 uppercase">分红比例 COMM%</label>
                       <div className="flex items-center bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                          <Percent size={14} className="text-indigo-400 mr-2" />
                          <input type="number" value={locEditForm.commissionRate} onChange={e => setLocEditForm({...locEditForm, commissionRate: e.target.value})} className="bg-transparent w-full text-sm font-black text-indigo-600 outline-none" />
                       </div>
                    </div>
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-slate-400 uppercase">当前读数 SCORE</label>
                       <input type="number" value={locEditForm.lastScore} onChange={e => setLocEditForm({...locEditForm, lastScore: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none" />
                    </div>
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase">运行状态 STATUS</label>
                    <div className="flex gap-2">
                       {(['active', 'maintenance', 'broken'] as const).map(s => (
                         <button key={s} onClick={() => setLocEditForm({...locEditForm, status: s})} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase border transition-all ${locEditForm.status === s ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`}>
                           {s === 'active' ? '在线' : s === 'maintenance' ? '维护' : '报废'}
                         </button>
                       ))}
                    </div>
                 </div>
                 <button onClick={saveLocEdit} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 active:scale-95 transition-all">
                    <Save size={16} /> 保存修改 SAVE
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Other tabs remain unchanged... */}
      {activeTab === 'settlement' && (
        <div className="max-w-4xl mx-auto space-y-6">
           {dailyStats.isSettled && (
             <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-[28px] flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-emerald-500 text-white rounded-2xl"><CheckCircle2 size={24} /></div>
                   <div><h3 className="text-base font-black text-emerald-900">今日已结账 KAMILI</h3><p className="text-[10px] text-emerald-600 font-bold uppercase">Hesabu ya Leo Imekamilika</p></div>
                </div>
                <button onClick={() => { setLastSettlement(dailyStats.todaySettlement || null); setShowSuccessModal(true); }} className="px-6 py-2.5 bg-white rounded-2xl text-[11px] font-black text-emerald-600 uppercase border border-emerald-200">查看回执</button>
             </div>
           )}
           <div className={`bg-white p-8 rounded-[48px] border border-slate-200 shadow-2xl space-y-8 ${dailyStats.isSettled ? 'opacity-80 grayscale-[0.2]' : ''}`}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                   <div className="bg-indigo-600 p-4 rounded-[22px] text-white shadow-xl shadow-indigo-100"><Calculator size={28} /></div>
                   <div><h2 className="text-2xl font-black text-slate-900">{t.dailySettlement}</h2><p className="text-xs text-slate-400 font-bold uppercase">{new Date().toDateString()} • {myProfile?.name}</p></div>
                </div>
              </div>
              <div className="bg-slate-900 rounded-[40px] p-8 text-white grid grid-cols-1 md:grid-cols-2 gap-10">
                 <div className="space-y-5">
                    <div className="flex justify-between items-center text-slate-400"><span className="text-[11px] font-black uppercase">{t.totalNet}</span><span>TZS {dailyStats.totalNetPayable.toLocaleString()}</span></div>
                    <div className="flex justify-between items-center text-slate-400"><span className="text-[11px] font-black uppercase">Float (Sarafu)</span><span className="text-emerald-400">TZS {dailyStats.float.toLocaleString()}</span></div>
                    <div className="h-px bg-white/10"></div>
                    <div className="flex justify-between items-center"><span className="text-xs font-black uppercase text-indigo-400">{t.cashInHand}</span><span className="text-2xl font-black text-indigo-400">TZS {dailyStats.expectedTotal.toLocaleString()}</span></div>
                 </div>
                 <div className="space-y-4">
                    <input type="number" placeholder={t.inputCash} value={actualCash} onChange={e => setActualCash(e.target.value)} className="bg-black/40 border border-white/5 rounded-2xl py-4 px-4 text-white font-black text-lg w-full outline-none" />
                    <input type="number" placeholder={t.inputCoins} value={actualCoins} onChange={e => setActualCoins(e.target.value)} className="bg-black/40 border border-white/5 rounded-2xl py-4 px-4 text-white font-black text-lg w-full outline-none" />
                 </div>
              </div>
              <div className={`p-8 rounded-[40px] border-2 border-dashed ${shortage === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                 <div className="flex items-center gap-6">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${shortage === 0 ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>{shortage === 0 ? <CheckCircle2 size={32} /> : <AlertTriangle size={32} />}</div>
                    <div><h4 className={`text-xl font-black uppercase ${shortage === 0 ? 'text-emerald-900' : 'text-rose-900'}`}>{shortage === 0 ? t.perfect : `${t.shortage}: TZS ${Math.abs(shortage).toLocaleString()}`}</h4></div>
                 </div>
              </div>
              <button onClick={handleSettlement} disabled={isSyncing || dailyStats.isSettled || !actualCash} className="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase text-sm shadow-2xl flex items-center justify-center gap-4 transition-all disabled:bg-slate-200"><Save size={20} />{dailyStats.isSettled ? "今日任务已完成 IMESHATUMWA" : "确认提交并锁账 KAMILISHA SASA"}</button>
           </div>
        </div>
      )}

      {showSuccessModal && lastSettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md animate-in fade-in">
           <div className="w-full max-w-sm bg-white rounded-[40px] overflow-hidden shadow-2xl relative">
              <div className="bg-emerald-500 p-10 flex flex-col items-center justify-center text-white text-center">
                <CheckCircle2 size={40} className="mb-4" />
                <h3 className="text-2xl font-black uppercase">对账收据 RISITI</h3>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between border-b border-dashed border-slate-200 pb-3"><span className="text-[10px] font-black text-slate-400 uppercase">日期</span><span className="text-xs font-black text-slate-700">{lastSettlement.date}</span></div>
                  <div className="flex justify-between border-b border-dashed border-slate-200 pb-3"><span className="text-[10px] font-black text-slate-400 uppercase">净收入</span><span className="text-sm font-black text-slate-900">TZS {lastSettlement.totalNetPayable.toLocaleString()}</span></div>
                  <div className="flex justify-between border-b border-dashed border-slate-200 pb-3"><span className="text-[10px] font-black text-slate-400 uppercase">差异</span><span className={`text-sm font-black ${lastSettlement.shortage === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{lastSettlement.shortage.toLocaleString()}</span></div>
                </div>
                <button onClick={() => setShowSuccessModal(false)} className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase">关闭 FINISH</button>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'arrears' && !isAdmin && (
        <div className="max-w-4xl mx-auto space-y-6">
           <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex items-center justify-between"><div className="flex items-center gap-5"><div className="p-4 bg-rose-50 text-rose-600 rounded-[28px] border border-rose-100"><Wallet size={32} /></div><div><h2 className="text-2xl font-black text-slate-900">{t.arrears}</h2><p className="text-xs text-slate-400 font-bold uppercase">Madeni ya Kukabidhi</p></div></div><div className="text-right"><p className="text-[10px] font-black text-slate-400 uppercase mb-1">TOTAL DEBT</p><p className="text-3xl font-black text-rose-600">TZS {totalArrears.toLocaleString()}</p></div></div>
           <div className="grid grid-cols-1 gap-4">{myArrears.map(tx => (<div key={tx.id} className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex justify-between items-center group transition-all"><div className="flex items-center gap-5"><div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 font-black border border-rose-100">{tx.locationName.charAt(0)}</div><div><h4 className="font-black text-slate-900 text-base">{tx.locationName}</h4><p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{new Date(tx.timestamp).toLocaleString()}</p></div></div><div className="text-right"><p className="text-[9px] font-black text-slate-400 uppercase">Kiasi 挂账</p><p className="text-lg font-black text-rose-600">TZS {tx.netPayable.toLocaleString()}</p></div></div>))}</div>
        </div>
      )}

      {activeTab === 'team' && isAdmin && <DriverManagement drivers={drivers} transactions={transactions} onUpdateDrivers={onUpdateDrivers} />}

      {activeTab === 'ai-logs' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
               <div className="flex items-center gap-4">
                 <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><BrainCircuit size={24} /></div>
                 <div>
                   <h2 className="text-lg font-black text-slate-900 uppercase">AI 审计日志</h2>
                   <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">System Audit Trails & AI Interactions</p>
                 </div>
               </div>
               
               <div className="relative w-full md:w-64">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search logs..." 
                    value={aiLogSearch}
                    onChange={(e) => setAiLogSearch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 transition-all"
                  />
               </div>
             </div>
           </div>

           <div className="space-y-4">
             {filteredAiLogs.length > 0 ? filteredAiLogs.map(log => {
               const linkedTx = log.relatedTransactionId ? transactions.find(t => t.id === log.relatedTransactionId) : null;
               
               return (
               <div key={log.id} className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
                 <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-4">
                   <div className="flex items-center gap-3">
                     <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 font-black">{log.driverName.charAt(0)}</div>
                     <div>
                       <p className="text-xs font-black text-slate-900">{log.driverName}</p>
                       <p className="text-[10px] text-slate-400 font-bold uppercase">{new Date(log.timestamp).toLocaleString()}</p>
                     </div>
                   </div>
                   <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg uppercase">{log.modelUsed}</span>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {log.imageUrl && (
                      <div className="h-40 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                        <img src={log.imageUrl} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" alt="Audit" />
                      </div>
                    )}
                    <div className={`${log.imageUrl ? 'md:col-span-2' : 'md:col-span-3'} space-y-4`}>
                       <div className="bg-slate-50 p-4 rounded-2xl">
                          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">审计指令 / Query</p>
                          <p className="text-sm font-bold text-slate-700">{log.query}</p>
                       </div>
                       
                       {/* Linked Transaction Context Card */}
                       {linkedTx && (
                         <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-2xl flex items-center gap-3">
                            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl"><Link size={14} /></div>
                            <div>
                               <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Linked Transaction Context</p>
                               <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                  <span>{linkedTx.locationName}</span>
                                  <span className="text-slate-300">•</span>
                                  <span>TZS {linkedTx.netPayable.toLocaleString()}</span>
                               </div>
                            </div>
                         </div>
                       )}

                       <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                          <p className="text-[9px] font-black text-indigo-400 uppercase mb-1">AI 反馈 / Analysis</p>
                          <p className="text-sm font-medium text-indigo-900 leading-relaxed whitespace-pre-wrap">{log.response}</p>
                       </div>
                    </div>
                 </div>
               </div>
             )}) : (
               <div className="text-center py-20 bg-white rounded-[32px] border border-dashed border-slate-200">
                 <BrainCircuit size={48} className="mx-auto text-slate-200 mb-4" />
                 <p className="text-xs font-black text-slate-400 uppercase tracking-widest">暂无 AI 审计记录</p>
               </div>
             )}
           </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
