
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
  Coins, MapPin, Radio, Search, ExternalLink, Map as MapIcon, Truck, Wallet, Calculator, 
  AlertTriangle, CheckCircle2, Banknote, Plus, X, Save, User, Key, Phone, Pencil, Clock, 
  Loader2, CalendarRange, Calendar, FileText, ChevronRight, Receipt, Fuel, Wrench, Gavel, 
  MoreHorizontal, AlertCircle, Building2, HandCoins, Camera, Info, Share2, Printer, 
  Navigation, Download, ShieldCheck, Percent, LayoutList, TrendingUp, TrendingDown, 
  Target, BellRing, Layers, Settings, BrainCircuit, Store, Signal, Smartphone, 
  ThumbsUp, ThumbsDown, ArrowUpDown, ArrowUp, ArrowDown, Link, FileClock, ImagePlus, 
  Trash2, Send, ArrowRight, ImageIcon, Eye, Sparkles 
} from 'lucide-react';
import { Transaction, Driver, Location, CONSTANTS, User as UserType, DailySettlement, TRANSLATIONS, AILog, getDistance } from '../types';
import DriverManagement from './DriverManagement';
import SmartInsights from './SmartInsights';
import SystemStatus from './SystemStatus';
import CockpitStats from './dashboard/CockpitStats';
import RouteTracking from './dashboard/RouteTracking';
import SiteMonitoring from './dashboard/SiteMonitoring';

interface DashboardProps {
  transactions: Transaction[];
  drivers: Driver[];
  locations: Location[];
  dailySettlements: DailySettlement[];
  aiLogs: AILog[]; 
  currentUser: UserType;
  onUpdateDrivers: (drivers: Driver[]) => Promise<void>;
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

const Dashboard: React.FC<DashboardProps> = ({ 
  transactions, drivers, locations, dailySettlements, aiLogs, 
  currentUser, onUpdateDrivers, onUpdateLocations, onUpdateTransaction, 
  onNewTransaction, onSaveSettlement, onSync, isSyncing, offlineCount, lang, onNavigate 
}) => {
  const t = TRANSLATIONS[lang];
  const isAdmin = currentUser.role === 'admin';
  
  // Tabs & UI States
  const [activeTab, setActiveTab] = useState<'overview' | 'team' | 'arrears' | 'ai-logs' | 'settlement'>(isAdmin ? 'overview' : 'settlement');
  const [showAssetMap, setShowAssetMap] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  const [actualCash, setActualCash] = useState<string>('');
  const [actualCoins, setActualCoins] = useState<string>('');
  const [lastSettlement, setLastSettlement] = useState<DailySettlement | null>(null);
  const [reviewingSettlement, setReviewingSettlement] = useState<DailySettlement | null>(null);
  const [selectedDriverForLocation, setSelectedDriverForLocation] = useState<Driver | null>(null);
  
  // Site Editing States
  const [editingLoc, setEditingLoc] = useState<Location | null>(null);
  const [locEditForm, setLocEditForm] = useState({ name: '', commissionRate: '', lastScore: '', status: 'active' as Location['status'] });
  const [siteSearch, setSiteSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState<'all' | 'active' | 'maintenance' | 'broken'>('all');

  // Memoized Data
  const myTransactions = useMemo(() => isAdmin ? transactions : transactions.filter(t => t.driverId === currentUser.id), [transactions, currentUser, isAdmin]);
  const pendingExpenses = useMemo(() => transactions.filter(tx => tx.expenses > 0 && tx.expenseStatus === 'pending'), [transactions]);
  const pendingSettlements = useMemo(() => dailySettlements.filter(s => s.status === 'pending'), [dailySettlements]);
  const aiDiscrepancies = useMemo(() => transactions.filter(tx => tx.aiScore !== undefined && tx.aiScore !== tx.currentScore), [transactions]);

  // Aggregated Daily Total for Admin
  const companyDailyTotal = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todaysTx = (transactions || []).filter(t => t && t.timestamp && t.timestamp.startsWith(today));
    const totalRevenue = todaysTx.reduce((sum, t) => sum + (t.revenue || 0), 0);
    const totalExpenses = todaysTx.reduce((sum, t) => sum + (t.expenses || 0), 0);
    const totalNet = todaysTx.reduce((sum, t) => sum + (t.netPayable || 0), 0);
    return { totalRevenue, totalExpenses, totalNet };
  }, [transactions]);

  const companyMonthlyTotal = useMemo(() => {
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7); 
    const confirmedSettlements = (dailySettlements || []).filter(s => s && s.date && s.date.startsWith(currentMonth) && s.status === 'confirmed');
    const totalCash = confirmedSettlements.reduce((sum, s) => sum + (s.actualCash || 0), 0);
    const totalCoins = confirmedSettlements.reduce((sum, s) => sum + (s.actualCoins || 0), 0);
    const totalRevenue = confirmedSettlements.reduce((sum, s) => sum + (s.totalRevenue || 0), 0);
    return { totalCash, totalCoins, totalRevenue, count: confirmedSettlements.length };
  }, [dailySettlements]);

  // NEW: Machine Performance Analysis Engine
  const siteAnalytics = useMemo(() => {
    return (locations || []).map(loc => {
      const locTx = (transactions || []).filter(tx => tx && tx.locationId === loc.id);
      const totalRev = locTx.reduce((sum, tx) => sum + (tx.revenue || 0), 0);
      const avgRev = locTx.length > 0 ? totalRev / locTx.length : 0;
      return {
        ...loc,
        totalRev,
        avgRev,
        statusLabel: loc.status === 'active' ? 'Running' : 'Alert'
      };
    });
  }, [locations, transactions]);

  // Today's Activity Feed
  const activityFeed = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return transactions
      .filter(t => t.timestamp.startsWith(today))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 5);
  }, [transactions]);

  // Route Tracking Logic
  const driverRoutes = useMemo(() => {
    if (!isAdmin) return [];
    const today = new Date().toISOString().split('T')[0];
    return drivers.map(driver => {
      const todayTx = transactions
        .filter(t => t.driverId === driver.id && t.timestamp.startsWith(today))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      let totalKm = 0;
      const legs = [];
      for (let i = 0; i < todayTx.length; i++) {
        const current = todayTx[i];
        const prev = i > 0 ? todayTx[i-1] : null;
        let dist = 0;
        if (prev && prev.gps && current.gps && prev.gps.lat !== 0 && current.gps.lat !== 0) {
          dist = getDistance(prev.gps.lat, prev.gps.lng, current.gps.lat, current.gps.lng) / 1000;
          totalKm += dist;
        }
        legs.push({
          locationName: current.locationName,
          time: new Date(current.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          distanceFromPrev: dist,
          gps: current.gps
        });
      }
      return { driverId: driver.id, driverName: driver.name, legs, totalKm };
    });
  }, [transactions, drivers, isAdmin]);

  const bossStats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const todayRev = transactions.filter(t => t.timestamp.startsWith(todayStr)).reduce((sum, t) => sum + t.revenue, 0);
    const activeDriversList = drivers.filter(d => {
        const lastActive = d.lastActive ? new Date(d.lastActive) : null;
        return lastActive && (now.getTime() - lastActive.getTime()) < 600000; // 10 mins
    });
    const brokenSites = locations.filter(l => l.status !== 'active').length;
    return { todayRev, activeDriversCount: activeDriversList.length, activeDriversList, brokenSites };
  }, [transactions, drivers, locations]);

  const dailyStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todaysCollections = myTransactions.filter(t => t.timestamp.startsWith(today) && t.type !== 'expense');
    const totalNetPayable = todaysCollections.reduce((acc, tx) => acc + tx.netPayable, 0);
    const driver = drivers.find(d => d.id === currentUser.id);
    const float = driver?.dailyFloatingCoins || 0;
    const expectedTotal = totalNetPayable + float;
    const todaySettlement = dailySettlements.find(s => s.date === today && (isAdmin ? true : s.driverId === currentUser.id));
    return { expectedTotal, isSettled: !!todaySettlement && todaySettlement.status === 'confirmed', todaySettlement };
  }, [myTransactions, drivers, dailySettlements, isAdmin, currentUser.id]);

  const shortage = useMemo(() => {
    const totalActual = (parseInt(actualCash) || 0) + (parseInt(actualCoins) || 0);
    const target = reviewingSettlement ? reviewingSettlement.expectedTotal : dailyStats.expectedTotal;
    return totalActual - target;
  }, [actualCash, actualCoins, dailyStats.expectedTotal, reviewingSettlement]);

  // Handlers
  const handleAdminConfirmSettlement = async () => {
    if (!reviewingSettlement) return;
    const updated: DailySettlement = {
        ...reviewingSettlement,
        adminId: currentUser.id,
        adminName: currentUser.name,
        status: 'confirmed', 
        actualCash: parseInt(actualCash) || reviewingSettlement.actualCash,
        actualCoins: parseInt(actualCoins) || reviewingSettlement.actualCoins,
        shortage: shortage,
        timestamp: new Date().toISOString()
    };
    const driver = drivers.find(d => d.id === reviewingSettlement.driverId);
    if (driver) {
      const updatedDrivers = drivers.map(d => d.id === driver.id ? { ...d, dailyFloatingCoins: updated.actualCoins } : d);
      await onUpdateDrivers(updatedDrivers);
    }
    onSaveSettlement(updated);
    setLastSettlement(updated);
    setShowSuccessModal(true);
    setReviewingSettlement(null);
    setActualCash(''); setActualCoins('');
  };

  const handleExpenseAction = (tx: Transaction, action: 'approve' | 'reject') => {
    onUpdateTransaction(tx.id, { expenseStatus: action === 'approve' ? 'approved' : 'rejected' });
  };

  const selectSettlementForReview = (s: DailySettlement) => {
    setReviewingSettlement(s);
    setActualCash(s.actualCash.toString());
    setActualCoins(s.actualCoins.toString());
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-4 border-b border-slate-200 pb-2 mb-6 overflow-x-auto scrollbar-hide">
        {isAdmin ? (
          <>
            <button onClick={() => setActiveTab('overview')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'overview' ? 'text-indigo-600' : 'text-slate-400'}`}>指挥中心 COCKPIT {activeTab === 'overview' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>
            <button onClick={() => setActiveTab('team')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'team' ? 'text-indigo-600' : 'text-slate-400'}`}>车队管理 FLEET {activeTab === 'team' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>
            <button onClick={() => setActiveTab('ai-logs')} className={`pb-2 text-[11px] font-black uppercase relative transition-all flex items-center gap-1 whitespace-nowrap ${activeTab === 'ai-logs' ? 'text-indigo-600' : 'text-slate-400'}`}><BrainCircuit size={14}/> AI LOGS {activeTab === 'ai-logs' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>
          </>
        ) : (
          <>
            <button onClick={() => setActiveTab('settlement')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'settlement' ? 'text-indigo-600' : 'text-slate-400'}`}>{t.dailySettlement} {activeTab === 'settlement' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>
            <button onClick={() => setActiveTab('arrears')} className={`pb-2 text-[11px] font-black uppercase relative transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'arrears' ? 'text-indigo-600' : 'text-slate-400'}`}>{t.arrears} {activeTab === 'arrears' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>
          </>
        )}
      </div>

      {activeTab === 'overview' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           {/* COMBINED STATS BANNER */}
           <div className="bg-slate-900 text-white rounded-[32px] p-1 shadow-2xl overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/10">
                 <div className="p-6 relative group overflow-hidden">
                    <TrendingUp className="absolute -right-2 -top-2 w-16 h-16 opacity-10 group-hover:scale-110 transition-transform" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">今日总营收 Today's Total</p>
                    <p className="text-2xl font-black">TZS {bossStats.todayRev.toLocaleString()}</p>
                 </div>
                 <div className="p-6 flex items-center justify-between">
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">在线司机 Live</p>
                       <p className="text-2xl font-black text-emerald-400">{bossStats.activeDriversCount} / {drivers.length}</p>
                    </div>
                    <div className="flex gap-1.5">
                       {drivers.map(d => {
                         const isLive = bossStats.activeDriversList.find(ad => ad.id === d.id);
                         return (
                           <button key={d.id} onClick={() => setSelectedDriverForLocation(d)} className={`w-9 h-9 rounded-xl border flex items-center justify-center text-[10px] font-black transition-all ${isLive ? 'bg-emerald-500 text-white border-emerald-400 animate-pulse' : 'bg-slate-800 text-slate-500 border-white/5'}`}>
                              {d.name.charAt(0)}
                           </button>
                         );
                       })}
                    </div>
                 </div>
                 <button 
                    onClick={() => { setSiteFilter('broken'); }}
                    className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors text-left"
                 >
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">异常/静默点位 Abnormal</p>
                       <p className={`text-2xl font-black ${bossStats.brokenSites > 0 ? 'text-rose-400' : 'text-slate-500'}`}>{bossStats.brokenSites}</p>
                    </div>
                    <div className={`p-3 rounded-2xl ${bossStats.brokenSites > 0 ? 'bg-rose-500/20 text-rose-500' : 'bg-slate-800 text-slate-600'}`}><AlertTriangle size={20} /></div>
                 </button>
              </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ACTIVITY FEED (TODAY'S MONITORING) ... */}
              <div className="bg-white p-6 rounded-[35px] border border-slate-200 shadow-sm space-y-4">
                 {/* Existing Activity Feed Header */}
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><Zap size={20} /></div>
                       <h3 className="text-lg font-black text-slate-900 uppercase">今日动态 FEED</h3>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase">
                       <Calendar size={12} /> {new Date().toLocaleDateString()}
                    </div>
                 </div>
                 <div className="space-y-3">
                    {activityFeed.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-white hover:shadow-md transition-all">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-indigo-600 font-black">{tx.driverName?.charAt(0) || 'D'}</div>
                            <div>
                               <p className="text-xs font-black text-slate-900">{tx.locationName}</p>
                               <p className="text-[9px] font-bold text-slate-400 uppercase">{tx.driverName} • {new Date(tx.timestamp).toLocaleTimeString()}</p>
                            </div>
                         </div>
                         <div className="text-right">
                            <p className="text-xs font-black text-slate-900">TZS {tx.revenue.toLocaleString()}</p>
                            <span className="text-[8px] font-black text-emerald-500 uppercase">Collected</span>
                         </div>
                      </div>
                    ))}
                    {activityFeed.length === 0 && <div className="py-10 text-center text-slate-300 italic text-xs">今日暂无巡检动态</div>}
                 </div>
              </div>

              {/* MONTHLY CONSOLIDATION PREVIEW */}
              <div className="bg-slate-900 text-white rounded-[35px] p-8 shadow-xl flex flex-col justify-between relative overflow-hidden group">
                 <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform">
                    <CalendarRange size={160} />
                 </div>
                 <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                       <div className="p-2.5 bg-white/10 rounded-xl text-emerald-400 border border-white/5"><FileClock size={20} /></div>
                       <h3 className="text-lg font-black uppercase">本月累计预收 (MONTHLY AGGREGATE)</h3>
                    </div>
                    <div className="px-3 py-1 bg-emerald-500 text-slate-900 rounded-full text-[10px] font-black">
                       {companyMonthlyTotal.count} DAYS SETTLED
                    </div>
                 </div>

                 <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">累计纸币现金 (TOTAL CASH)</p>
                          <p className="text-2xl font-black">TZS {companyMonthlyTotal.totalCash.toLocaleString()}</p>
                       </div>
                       <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">累计硬币资产 (TOTAL COINS)</p>
                          <p className="text-2xl font-black text-amber-400">{companyMonthlyTotal.totalCoins.toLocaleString()}</p>
                       </div>
                    </div>
                    
                    <div className="pt-6 border-t border-white/10">
                       <div className="flex justify-between items-baseline">
                          <p className="text-[10px] font-black text-slate-400 uppercase">本月确认总营收 (MONTHLY REVENUE)</p>
                          <p className="text-3xl font-black text-white">TZS {companyMonthlyTotal.totalRevenue.toLocaleString()}</p>
                       </div>
                       <p className="text-[8px] font-bold text-slate-500 uppercase mt-2 italic">此数据来源于所有已确认的日终对账单</p>
                    </div>
                 </div>
              </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RouteTracking routes={driverRoutes} onOpenMap={() => setShowAssetMap(true)} />
              <SystemStatus />
           </div>

           {/* MONTHLY PERFORMANCE SUMMARY */}
           <div className="bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-[35px] p-8 shadow-xl flex flex-col md:flex-row justify-between items-center group">
              <div className="mb-4 md:mb-0">
                 <h3 className="text-xl font-black uppercase mb-2">经营分析报告 (MONTHLY INSIGHTS)</h3>
                 <p className="text-xs font-bold text-white/60 uppercase tracking-widest">已确认结算天数: {companyMonthlyTotal.count} 天</p>
              </div>
              <button 
                onClick={() => alert("本月月报生成中...\n总营收: TZS " + (companyMonthlyTotal.totalRevenue || 0).toLocaleString())}
                className="py-4 px-8 bg-white text-indigo-600 rounded-2xl font-black uppercase text-xs shadow-lg active:scale-95 transition-all flex items-center gap-3"
              >
                 <FileText size={18} /> 下载月度报告
              </button>
           </div>

           {/* SITE PERFORMANCE RANKING */}
           <div className="space-y-4">
              <div className="flex items-center gap-3 ml-2">
                 <div className="p-2 bg-amber-500 rounded-xl text-slate-900"><TrendingUp size={18} /></div>
                 <h3 className="text-base font-black text-slate-900 uppercase">机器效能排行 (SITE RANKING)</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                 {(siteAnalytics || []).slice(0, 4).sort((a,b) => b.avgRev - a.avgRev).map(loc => (
                   <div key={loc.id} className="bg-white p-5 rounded-[30px] border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-4">
                         <span className="text-[9px] font-black text-slate-400 uppercase">{loc.machineId}</span>
                         <div className={`w-2 h-2 rounded-full ${loc.status === "active" ? "bg-emerald-500" : "bg-rose-500"}`}></div>
                      </div>
                      <p className="text-xs font-black text-slate-900 truncate mb-1">{loc.name}</p>
                      <div className="space-y-2 mt-3">
                         <div className="flex justify-between text-[8px] font-black uppercase text-slate-400">
                            <span>日均 (AVG)</span>
                            <span className="text-slate-900 font-bold">TZS {Math.floor(loc.avgRev || 0).toLocaleString()}</span>
                         </div>
                         <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, ((loc.avgRev || 0) / 50000) * 100)}%` }}></div>
                         </div>
                      </div>
                   </div>
                 ))}
              </div>
           </div>

           <SmartInsights transactions={transactions} locations={locations} />

           <SiteMonitoring locations={locations} siteSearch={siteSearch} onSetSiteSearch={setSiteSearch} onEdit={setEditingLoc} />
        </div>
      )}

      {activeTab === 'settlement' && (
        <div className="space-y-6 animate-in fade-in">
           {isAdmin && (
             <div className="bg-slate-900 text-white rounded-[32px] p-8 shadow-2xl space-y-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                   <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-500 rounded-xl text-white"><LayoutList size={20} /></div>
                      <h3 className="text-xl font-black uppercase">公司日终对账中心 (COMPANY SETTLEMENT)</h3>
                   </div>
                   <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full text-[10px] font-black text-emerald-400">
                      <Clock size={14} /> TODAY: {new Date().toLocaleDateString()}
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">今日总营收 TOTAL REVENUE</p>
                      <p className="text-2xl font-black">TZS {companyDailyTotal.totalRevenue.toLocaleString()}</p>
                   </div>
                   <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">今日总扣费 TOTAL EXPENSES</p>
                      <p className="text-2xl font-black text-rose-400">TZS {companyDailyTotal.totalExpenses.toLocaleString()}</p>
                   </div>
                   <div className="bg-indigo-500/20 p-4 rounded-2xl border border-indigo-500/30">
                      <p className="text-[10px] font-black text-indigo-400 uppercase mb-1">今日总应收 TOTAL NET</p>
                      <p className="text-2xl font-black text-indigo-100">TZS {companyDailyTotal.totalNet.toLocaleString()}</p>
                   </div>
                </div>
             </div>
           )}

           {isAdmin && aiDiscrepancies.length > 0 && (
              <div className="bg-rose-50 border-2 border-rose-100 rounded-[35px] p-6 space-y-4">
                 <div className="flex items-center gap-2">
                    <ShieldCheck className="text-rose-500" size={20} />
                    <h3 className="text-sm font-black text-rose-900 uppercase">AI 抄表差异审计 (DISCREPANCY AUDIT)</h3>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {aiDiscrepancies.map(tx => (
                      <div key={tx.id} className="bg-white p-4 rounded-2xl border border-rose-200 flex justify-between items-center shadow-sm">
                         <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase">{tx.locationName} ({tx.driverName})</p>
                            <div className="flex items-center gap-3 mt-1">
                               <span className="text-xs font-black text-slate-900">手动: {tx.currentScore}</span>
                               <span className="text-xs font-black text-rose-500">AI: {tx.aiScore}</span>
                            </div>
                         </div>
                         <button onClick={() => onUpdateTransaction(tx.id, { aiScore: tx.currentScore })} className="px-3 py-1.5 bg-rose-500 text-white rounded-lg text-[10px] font-black uppercase">忽略并过审</button>
                      </div>
                    ))}
                 </div>
              </div>
           )}

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {isAdmin ? (
                drivers.map(driver => {
                   const today = new Date().toISOString().split('T')[0];
                   const settlement = dailySettlements.find(s => s.driverId === driver.id && s.date === today);
                   const todaysTx = transactions.filter(t => t.driverId === driver.id && t.timestamp.startsWith(today));
                   const expectedNet = todaysTx.reduce((sum, t) => sum + t.netPayable, 0);

                   return (
                     <div key={driver.id} className={`bg-white rounded-[35px] border p-6 shadow-sm transition-all hover:shadow-md ${settlement?.status === 'confirmed' ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200'}`}>
                        <div className="flex justify-between items-start mb-6">
                           <div className="flex items-center gap-3">
                              <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-lg">
                                 {driver.name.charAt(0)}
                              </div>
                              <div>
                                 <h4 className="text-sm font-black text-slate-900 uppercase">{driver.name}</h4>
                                 <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${settlement ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                    {settlement ? (settlement.status === 'confirmed' ? '已确认 SETTLED' : '待确认 PENDING') : '未提交 NO DATA'}
                                 </span>
                              </div>
                           </div>
                           <button onClick={() => { if (settlement) selectSettlementForReview(settlement); }} className={`p-2 rounded-xl border transition-all ${settlement ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-300 opacity-50 cursor-not-allowed'}`}>
                              <ChevronRight size={18} />
                           </button>
                        </div>

                        <div className="space-y-3">
                           <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                              <span>理论应收 (EXPECTED)</span>
                              <span className="text-slate-900">TZS {expectedNet.toLocaleString()}</span>
                           </div>
                           <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                              <span>实收纸币 (CASH)</span>
                              <span className="text-emerald-600">TZS {settlement?.actualCash.toLocaleString() || 0}</span>
                           </div>
                           <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                              <span>短/长款 (DIFF)</span>
                              <span className={`${(settlement?.shortage || 0) < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                 {(settlement?.shortage || 0).toLocaleString()} TZS
                              </span>
                           </div>
                        </div>
                     </div>
                   );
                })
              ) : (
                <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-2xl space-y-8 animate-in slide-in-from-bottom-8 col-span-full">
                   <div className="text-center space-y-2">
                      <div className="w-20 h-20 bg-emerald-500 rounded-[30px] flex items-center justify-center mx-auto text-white shadow-xl shadow-emerald-100 mb-4 animate-bounce">
                         <Receipt size={40} />
                      </div>
                      <h2 className="text-2xl font-black text-slate-900 uppercase">日终对账结算 (DAILY SETTLEMENT)</h2>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">请确认今日所有巡检工作已提交后再进行结算</p>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-slate-50 p-6 rounded-[35px] border border-slate-100 shadow-inner">
                         <p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">今日理论应交 (EXPECTED NET)</p>
                         <p className="text-4xl font-black text-slate-900">TZS {dailyStats.expectedTotal.toLocaleString()}</p>
                      </div>

                      <div className="space-y-4">
                         <div className="bg-white p-6 rounded-[35px] border-2 border-indigo-100 shadow-xl">
                            <label className="text-[10px] font-black text-indigo-600 uppercase block mb-4 tracking-widest">实缴纸币 (INPUT CASH)</label>
                            <input type="number" value={actualCash} onChange={e => setActualCash(e.target.value)} className="w-full text-3xl font-black bg-transparent outline-none text-slate-900" placeholder="0" />
                         </div>
                         <div className="bg-white p-6 rounded-[35px] border-2 border-emerald-100 shadow-xl">
                            <label className="text-[10px] font-black text-emerald-600 uppercase block mb-4 tracking-widest">实缴硬币 (INPUT COINS)</label>
                            <input type="number" value={actualCoins} onChange={e => setActualCoins(e.target.value)} className="w-full text-3xl font-black bg-transparent outline-none text-slate-900" placeholder="0" />
                         </div>
                      </div>
                   </div>

                   <button 
                     onClick={() => {
                        const newSettlement: DailySettlement = {
                           id: `STL-${Date.now()}`,
                           date: new Date().toISOString().split('T')[0],
                           driverId: currentUser.id,
                           driverName: currentUser.name,
                           totalRevenue: dailyStats.expectedTotal,
                           totalNetPayable: dailyStats.expectedTotal,
                           totalExpenses: 0,
                           driverFloat: drivers.find(d => d.id === currentUser.id)?.dailyFloatingCoins || 0,
                           expectedTotal: dailyStats.expectedTotal,
                           actualCash: parseInt(actualCash) || 0,
                           actualCoins: parseInt(actualCoins) || 0,
                           shortage: shortage,
                           status: 'pending',
                           timestamp: new Date().toISOString(),
                           isSynced: false
                        };
                        onSaveSettlement(newSettlement);
                        alert("对账单已提交，等待管理员确认结算。");
                     }}
                     disabled={!actualCash || !actualCoins || dailyStats.isSettled}
                     className="w-full py-6 bg-slate-900 text-white rounded-[32px] font-black uppercase text-sm shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-4"
                   >
                     {dailyStats.isSettled ? "今日账目已结算 SETTLED" : "提交对账报告 SUBMIT REPORT"}
                   </button>
                </div>
              )}
           </div>
        </div>
      )}

      {/* DRIVER DETAIL MODAL */}
      {selectedDriverForLocation && (
        <div className="fixed inset-0 z-[130] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden relative p-8">
              <button onClick={() => setSelectedDriverForLocation(null)} className="absolute top-6 right-6 p-2 bg-slate-100 rounded-full"><X size={18} /></button>
              <h3 className="text-xl font-black uppercase mb-4">{selectedDriverForLocation.name}</h3>
              <div className="space-y-4">
                 <div className="bg-slate-50 p-4 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase">状态</p>
                    <p className="text-sm font-bold">{bossStats.activeDriversList.find(d => d.id === selectedDriverForLocation.id) ? '在线 Online' : '离线 Offline'}</p>
                 </div>
                 <button onClick={() => setSelectedDriverForLocation(null)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase">返回</button>
              </div>
           </div>
        </div>
      )}

      {/* REVIEW SETTLEMENT MODAL */}
      {reviewingSettlement && (
        <div className="fixed inset-0 z-[140] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-md rounded-[40px] p-8 space-y-6 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="text-xl font-black text-slate-900 uppercase">审核对账单: {reviewingSettlement.driverName}</h3>
                 <button onClick={() => setReviewingSettlement(null)}><X size={24}/></button>
              </div>
              <div className="space-y-4">
                 <div className="bg-slate-50 p-4 rounded-2xl flex justify-between">
                    <span className="text-xs font-bold text-slate-500">理论应收</span>
                    <span className="text-xs font-black">TZS {reviewingSettlement.expectedTotal.toLocaleString()}</span>
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border p-4 rounded-2xl">
                       <label className="text-[10px] font-black text-slate-400 block mb-2 uppercase">确认纸币 (CASH)</label>
                       <input type="number" value={actualCash} onChange={e => setActualCash(e.target.value)} className="w-full text-lg font-black outline-none" />
                    </div>
                    <div className="bg-white border p-4 rounded-2xl">
                       <label className="text-[10px] font-black text-slate-400 block mb-2 uppercase">确认硬币 (COINS)</label>
                       <input type="number" value={actualCoins} onChange={e => setActualCoins(e.target.value)} className="w-full text-lg font-black outline-none" />
                    </div>
                 </div>
                 <div className={`p-4 rounded-2xl text-white font-black text-center ${shortage >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    差异 DIFF: TZS {shortage.toLocaleString()}
                 </div>
              </div>
              <button onClick={handleAdminConfirmSettlement} className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black uppercase">确认并结算</button>
           </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center p-8 animate-in zoom-in">
           <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center text-white mb-6 shadow-2xl shadow-emerald-200">
              <CheckCircle2 size={48} />
           </div>
           <h2 className="text-3xl font-black text-slate-900 uppercase mb-2">结算成功</h2>
           <p className="text-slate-400 font-bold uppercase tracking-widest mb-8">Settlement Confirmed</p>
           <button onClick={() => setShowSuccessModal(false)} className="px-12 py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase">返回面板</button>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
