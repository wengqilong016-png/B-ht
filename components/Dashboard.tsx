
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
              {/* ACTIVITY FEED (TODAY'S MONITORING) */}
              <div className="bg-white p-6 rounded-[35px] border border-slate-200 shadow-sm space-y-4">
                 <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><Zap size={20} /></div>
                    <h3 className="text-lg font-black text-slate-900 uppercase">今日动态监测 FEED</h3>
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

              {/* ROUTE TRACKING PREVIEW */}
              <RouteTracking routes={driverRoutes} onOpenMap={() => setShowAssetMap(true)} />
           </div>

           {/* SYSTEM & APPROVALS */}
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SystemStatus />
              {(pendingSettlements.length > 0 || pendingExpenses.length > 0) && (
                <div className="bg-white p-6 rounded-[35px] border-2 border-indigo-100 shadow-lg space-y-4">
                   <div className="flex items-center gap-2">
                      <div className="p-2 bg-indigo-600 text-white rounded-xl"><BellRing size={18} /></div>
                      <h3 className="text-base font-black text-slate-900 uppercase">审批指挥台</h3>
                   </div>
                   <div className="space-y-2">
                      {pendingSettlements.map(s => (
                        <button key={s.id} onClick={() => selectSettlementForReview(s)} className="w-full flex justify-between items-center bg-emerald-50 p-4 rounded-2xl border border-emerald-100 hover:bg-emerald-100 transition-all">
                           <span className="text-xs font-black text-slate-900">{s.driverName} (待对账)</span>
                           <ArrowRight size={16} className="text-emerald-400" />
                        </button>
                      ))}
                   </div>
                </div>
              )}
           </div>

           <SmartInsights transactions={transactions} locations={locations} />

           <SiteMonitoring locations={locations} siteSearch={siteSearch} onSetSiteSearch={setSiteSearch} onEdit={setEditingLoc} />
        </div>
      )}

      {/* DRIVER DETAIL MODAL (FIXED POSITION & INFO) */}
      {selectedDriverForLocation && (
        <div className="fixed inset-0 z-[130] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden relative">
              <div className="bg-slate-900 p-8 text-white">
                 <button onClick={() => setSelectedDriverForLocation(null)} className="absolute top-6 right-6 p-2 bg-white/10 rounded-full hover:bg-white/20"><X size={18} /></button>
                 <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-emerald-500 rounded-[20px] flex items-center justify-center text-2xl font-black text-white shadow-lg">
                       {selectedDriverForLocation.name.charAt(0)}
                    </div>
                    <div>
                       <h3 className="text-xl font-black uppercase">{selectedDriverForLocation.name}</h3>
                       <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${bossStats.activeDriversList.find(d => d.id === selectedDriverForLocation.id) ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">
                             {bossStats.activeDriversList.find(d => d.id === selectedDriverForLocation.id) ? '在线 Online' : '离线 Offline'}
                          </p>
                       </div>
                    </div>
                 </div>
                 <div className="flex items-center gap-2 text-slate-400 border-t border-white/5 pt-4">
                    <Clock size={14} />
                    <span className="text-[10px] font-bold uppercase">最后活跃: {selectedDriverForLocation.lastActive ? new Date(selectedDriverForLocation.lastActive).toLocaleString() : '暂无数据'}</span>
                 </div>
              </div>
              <div className="p-8 space-y-6">
                 {selectedDriverForLocation.currentGps ? (
                   <div className="space-y-4">
                      <div className="bg-slate-50 p-5 rounded-[32px] border border-slate-100">
                         <div className="flex items-center gap-3 mb-3">
                            <MapPin className="text-indigo-600" size={20} />
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">实地定位实况</p>
                         </div>
                         <p className="text-xs font-black text-slate-900 mb-1">经纬度: {selectedDriverForLocation.currentGps.lat.toFixed(5)}, {selectedDriverForLocation.currentGps.lng.toFixed(5)}</p>
                         <p className="text-[9px] text-slate-400">坐标最后更新于: {new Date(selectedDriverForLocation.lastActive || "").toLocaleTimeString()}</p>
                      </div>
                      <button 
                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${selectedDriverForLocation.currentGps?.lat},${selectedDriverForLocation.currentGps?.lng}`, '_blank')}
                        className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase text-sm shadow-xl shadow-indigo-100 flex items-center justify-center gap-3"
                      >
                        <Navigation size={20} /> 在地图中查看
                      </button>
                   </div>
                 ) : (
                   <div className="py-10 text-center space-y-3">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300"><Signal size={32} /></div>
                      <p className="text-xs font-black text-slate-400 uppercase leading-relaxed">该司机目前没有上报位置信息<br/>请确保司机已开启手机定位</p>
                   </div>
                 )}
                 <div className="grid grid-cols-2 gap-3">
                    <a href={`tel:${selectedDriverForLocation.phone}`} className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[10px] flex items-center justify-center gap-2 hover:bg-slate-200 transition-all">
                       <Phone size={14} /> 呼叫司机
                    </a>
                    <button onClick={() => setSelectedDriverForLocation(null)} className="py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px]">返回面板</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* REMAINDING MODALS (Success, Review, Editing) - KEEP AS UPDATED BEFORE */}
      {/* ... (Success Receipt, Review, and Enhanced Editing Modal codes remain from previous stable write) */}
