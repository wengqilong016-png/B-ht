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

  // Memoized Data
  const myTransactions = useMemo(() => isAdmin ? transactions : transactions.filter(t => t.driverId === currentUser.id), [transactions, currentUser, isAdmin]);
  const pendingExpenses = useMemo(() => transactions.filter(tx => tx.expenses > 0 && tx.expenseStatus === 'pending'), [transactions]);
  const pendingSettlements = useMemo(() => dailySettlements.filter(s => s.status === 'pending'), [dailySettlements]);

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
           {/* Combined Stats Banner */}
           <div className="bg-slate-900 text-white rounded-[32px] p-1 shadow-xl overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/10">
                 <div className="p-6 relative group overflow-hidden">
                    <TrendingUp className="absolute -right-2 -top-2 w-16 h-16 opacity-10 group-hover:scale-110 transition-transform" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">今日营收 Revenue</p>
                    <p className="text-2xl font-black">TZS {bossStats.todayRev.toLocaleString()}</p>
                 </div>
                 <div className="p-6 flex items-center justify-between">
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">在线司机 Live Drivers</p>
                       <p className="text-2xl font-black text-emerald-400">{bossStats.activeDriversCount} / {drivers.length}</p>
                    </div>
                    <div className="flex gap-1">
                       {bossStats.activeDriversList.map(d => (
                         <button key={d.id} onClick={() => setSelectedDriverForLocation(d)} className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[10px] font-black text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all">
                            {d.name.charAt(0)}
                         </button>
                       ))}
                    </div>
                 </div>
                 <div className="p-6 flex items-center justify-between">
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">异常点位 Alerts</p>
                       <p className="text-2xl font-black text-rose-400">{bossStats.brokenSites}</p>
                    </div>
                    <div className="p-3 bg-rose-500/10 text-rose-500 rounded-2xl"><AlertTriangle size={20} /></div>
                 </div>
              </div>
           </div>

           {/* Route Tracking */}
           <RouteTracking routes={driverRoutes} onOpenMap={() => setShowAssetMap(true)} />

           {/* System Status (Local Agent) */}
           <div className="bg-white p-4 rounded-[28px] border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Smartphone size={18} /></div>
                 <div>
                    <p className="text-[10px] font-black text-slate-900 uppercase">Local Agent (设备监控)</p>
                    <p className="text-[8px] text-slate-400 font-bold uppercase">监控本地硬件状态、电池、及同步服务</p>
                 </div>
              </div>
              <div className="flex items-center gap-2">
                 <span className="text-[8px] font-black text-rose-500 bg-rose-50 px-2 py-1 rounded-lg uppercase">Disconnected</span>
                 <p className="text-[8px] text-slate-300 font-bold max-w-[120px] text-right italic leading-tight">需要本地环境支持 (Termux Daemon)</p>
              </div>
           </div>

           {/* Pending Approvals */}
           {(pendingSettlements.length > 0 || pendingExpenses.length > 0) && (
             <div className="bg-white p-6 rounded-[35px] border-2 border-indigo-100 shadow-lg space-y-4">
                <div className="flex items-center gap-2 mb-2">
                   <div className="p-2 bg-indigo-600 text-white rounded-xl"><BellRing size={18} /></div>
                   <h3 className="text-base font-black text-slate-900 uppercase">审批指挥台</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {pendingSettlements.map(s => (
                     <button key={s.id} onClick={() => selectSettlementForReview(s)} className="flex justify-between items-center bg-emerald-50 p-4 rounded-2xl border border-emerald-100 hover:bg-emerald-100 transition-all">
                        <p className="text-xs font-black text-slate-900">{s.driverName}</p>
                        <ArrowRight size={16} className="text-emerald-400" />
                     </button>
                   ))}
                   {pendingExpenses.map(tx => (
                     <div key={tx.id} className="flex justify-between items-center bg-rose-50 p-4 rounded-2xl border border-rose-100">
                        <p className="text-xs font-black text-slate-900">{drivers.find(d => d.id === tx.driverId)?.name} - TZS {tx.expenses.toLocaleString()}</p>
                        <div className="flex gap-2">
                           <button onClick={() => handleExpenseAction(tx, 'approve')} className="p-2 bg-emerald-500 text-white rounded-xl"><ThumbsUp size={14} /></button>
                           <button onClick={() => handleExpenseAction(tx, 'reject')} className="p-2 bg-rose-500 text-white rounded-xl"><ThumbsDown size={14} /></button>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
           )}

           <SmartInsights transactions={transactions} locations={locations} />

           <SiteMonitoring locations={locations} siteSearch={siteSearch} onSetSiteSearch={setSiteSearch} onEdit={setEditingLoc} />
        </div>
      )}

      {/* Driver Detail / Tracking Modal */}
      {selectedDriverForLocation && (
        <div className="fixed inset-0 z-[130] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden relative">
              <div className="bg-slate-900 p-8 text-white relative">
                 <button onClick={() => setSelectedDriverForLocation(null)} className="absolute top-6 right-6 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"><X size={18} /></button>
                 <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-emerald-500 rounded-[20px] flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-emerald-500/20">
                       {selectedDriverForLocation.name.charAt(0)}
                    </div>
                    <div>
                       <h3 className="text-xl font-black uppercase">{selectedDriverForLocation.name}</h3>
                       <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Driver Online Now</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-2 text-slate-400">
                    <Clock size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-tight">最后活跃: {selectedDriverForLocation.lastActive ? new Date(selectedDriverForLocation.lastActive).toLocaleTimeString() : 'N/A'}</span>
                 </div>
              </div>
              <div className="p-8 space-y-6">
                 {selectedDriverForLocation.currentGps ? (
                   <div className="space-y-4">
                      <div className="bg-slate-50 p-5 rounded-[32px] border border-slate-100">
                         <p className="text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">最后已知位置 Last GPS</p>
                         <div className="flex items-center gap-3">
                            <MapPin className="text-indigo-600" size={24} />
                            <div>
                               <p className="text-xs font-black text-slate-900">Lat: {selectedDriverForLocation.currentGps.lat.toFixed(4)}</p>
                               <p className="text-xs font-black text-slate-900">Lng: {selectedDriverForLocation.currentGps.lng.toFixed(4)}</p>
                            </div>
                         </div>
                      </div>
                      <button 
                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${selectedDriverForLocation.currentGps?.lat},${selectedDriverForLocation.currentGps?.lng}`, '_blank')}
                        className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase text-sm shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95 transition-all"
                      >
                        <Navigation size={20} /> 在地图中打开
                      </button>
                   </div>
                 ) : (
                   <div className="py-10 text-center space-y-3">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300"><Signal size={32} /></div>
                      <p className="text-xs font-black text-slate-400 uppercase">当前暂无位置信号</p>
                   </div>
                 )}
                 <div className="grid grid-cols-2 gap-3">
                    <a href={`tel:${selectedDriverForLocation.phone}`} className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[10px] flex items-center justify-center gap-2">
                       <Phone size={14} /> 呼叫司机
                    </a>
                    <button onClick={() => setSelectedDriverForLocation(null)} className="py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px]">返回主页</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Driver Settlement View (Fix: Explicit Empty State check) */}
      {activeTab === 'settlement' && !isAdmin && (
        <div className="max-w-md mx-auto space-y-6">
           <div className={`p-8 rounded-[40px] border-2 shadow-xl text-center space-y-4 ${dailyStats.isSettled ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-indigo-100'}`}>
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${dailyStats.isSettled ? 'bg-emerald-500 text-white' : 'bg-indigo-100 text-indigo-600'}`}>
                 {dailyStats.isSettled ? <CheckCircle2 size={40} /> : <Calculator size={40} />}
              </div>
              <h2 className="text-2xl font-black text-slate-900 uppercase">{dailyStats.isSettled ? '今日已结账' : '日终对账结算'}</h2>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center text-left">
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase">今日应缴</p>
                    <p className="text-lg font-black text-slate-900">TZS {dailyStats.expectedTotal.toLocaleString()}</p>
                 </div>
                 <Info size={16} className="text-slate-300" />
              </div>
              {dailyStats.isSettled ? (
                <button onClick={() => { setLastSettlement(dailyStats.todaySettlement || null); setShowSuccessModal(true); }} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs">查看回执 RECEIPT</button>
              ) : (
                <div className="space-y-4 pt-4">
                   <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1 text-left">
                         <label className="text-[9px] font-black text-slate-400 uppercase ml-1">纸币 Noti</label>
                         <input type="number" value={actualCash} onChange={e => setActualCash(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-lg font-black text-slate-900" placeholder="0" />
                      </div>
                      <div className="space-y-1 text-left">
                         <label className="text-[9px] font-black text-slate-400 uppercase ml-1">硬币 Sarafu</label>
                         <input type="number" value={actualCoins} onChange={e => setActualCoins(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-lg font-black text-indigo-600" placeholder="0" />
                      </div>
                   </div>
                   <button onClick={() => {
                      const settlementData: DailySettlement = {
                        id: `S-${Date.now()}`,
                        date: new Date().toISOString().split('T')[0],
                        driverId: currentUser.id,
                        driverName: currentUser.name,
                        totalRevenue: 0, totalNetPayable: 0, totalExpenses: 0, driverFloat: 0,
                        expectedTotal: dailyStats.expectedTotal,
                        actualCash: parseInt(actualCash) || 0,
                        actualCoins: parseInt(actualCoins) || 0,
                        shortage: shortage,
                        timestamp: new Date().toISOString(),
                        status: 'pending'
                      };
                      onSaveSettlement(settlementData);
                      alert('✅ 结算请求已提交');
                   }} disabled={!actualCash} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-sm shadow-xl">提交审核 SUBMIT</button>
                </div>
              )}
           </div>
        </div>
      )}

      {/* Success Receipt Modal */}
      {showSuccessModal && lastSettlement && (
        <div className="fixed inset-0 z-[140] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden relative border border-slate-100">
              <div className="bg-emerald-500 p-8 text-white text-center">
                 <button onClick={() => setShowSuccessModal(false)} className="absolute top-6 right-6 p-2 bg-white/20 rounded-full"><X size={18} /></button>
                 <CheckCircle2 size={48} className="mx-auto mb-2" />
                 <h3 className="text-xl font-black uppercase">结算详情回执</h3>
              </div>
              <div className="p-8 space-y-4">
                 <div className="flex justify-between border-b pb-2"><span className="text-[10px] font-black text-slate-400 uppercase">Driver</span><span className="text-sm font-black">{lastSettlement.driverName}</span></div>
                 <div className="flex justify-between"><span className="text-[10px] font-black text-slate-400 uppercase">Cash</span><span className="text-sm font-black">TZS {lastSettlement.actualCash.toLocaleString()}</span></div>
                 <div className="flex justify-between"><span className="text-[10px] font-black text-indigo-400 uppercase">Coins</span><span className="text-sm font-black text-indigo-600">TZS {lastSettlement.actualCoins.toLocaleString()}</span></div>
                 <button onClick={() => setShowSuccessModal(false)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs mt-4">关闭 CLOSE</button>
              </div>
           </div>
        </div>
      )}

      {/* Review Settlement Modal (Admin) */}
      {reviewingSettlement && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden">
              <div className="bg-slate-900 p-8 text-white">
                 <h3 className="text-xl font-black uppercase">审核结算</h3>
                 <p className="text-[10px] font-bold text-slate-400 uppercase">{reviewingSettlement.driverName}</p>
              </div>
              <div className="p-8 space-y-4">
                 <div className="bg-slate-50 p-4 rounded-xl border flex justify-between"><span className="text-[10px] font-black uppercase">理论应收</span><span className="text-base font-black">TZS {reviewingSettlement.expectedTotal.toLocaleString()}</span></div>
                 <div className="grid grid-cols-2 gap-3">
                    <input type="number" value={actualCash} onChange={e => setActualCash(e.target.value)} className="w-full bg-slate-50 border rounded-xl p-3 text-sm font-black" placeholder="现金" />
                    <input type="number" value={actualCoins} onChange={e => setActualCoins(e.target.value)} className="w-full bg-slate-50 border rounded-xl p-3 text-sm font-black text-indigo-600" placeholder="硬币" />
                 </div>
                 <button onClick={handleAdminConfirmSettlement} className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2"><ShieldCheck size={18} /> 确认并同步硬币</button>
              </div>
           </div>
        </div>
      )}

      {/* Other Tabs Content */}
      {activeTab === 'team' && <DriverManagement drivers={drivers} transactions={transactions} onUpdateDrivers={onUpdateDrivers} />}
      {activeTab === 'ai-logs' && (
        <div className="space-y-4">
           {aiLogs.map(log => (
             <div key={log.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400"><BrainCircuit size={24}/></div>
                   <div><p className="text-xs font-black text-slate-900">{log.driverName}</p><p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(log.timestamp).toLocaleString()}</p></div>
                </div>
                <div className="text-right"><p className="text-[9px] font-black text-indigo-600 uppercase">{log.modelUsed}</p></div>
             </div>
           ))}
        </div>
      )}
      {activeTab === 'arrears' && (
        <div className="space-y-4">
           {myTransactions.filter(t => t.paymentStatus === 'unpaid').map(tx => (
             <div key={tx.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center font-black">!</div>
                   <div><p className="text-xs font-black text-slate-900">{tx.locationName}</p></div>
                </div>
                <p className="text-lg font-black text-rose-600">TZS {tx.netPayable.toLocaleString()}</p>
             </div>
           ))}
        </div>
      )}

      {/* Site Editing Modal - ENHANCED */}
      {editingLoc && (
        <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="bg-slate-900 p-8 text-white relative">
                 <button onClick={() => setEditingLoc(null)} className="absolute top-6 right-6 p-2 bg-white/10 rounded-full"><X size={18} /></button>
                 <h3 className="text-xl font-black uppercase">点位档案管理 INFO</h3>
                 <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{editingLoc.machineId} • {editingLoc.name}</p>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                 {/* Proof Images Section */}
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-slate-400 uppercase">机器照 Machine</label>
                       <div className="h-32 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200">
                          {editingLoc.machinePhotoUrl ? <img src={editingLoc.machinePhotoUrl} className="w-full h-full object-cover" /> : <div className="h-full flex items-center justify-center text-slate-300"><ImageIcon size={32}/></div>}
                       </div>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-slate-400 uppercase">老板合影 Boss</label>
                       <div className="h-32 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200">
                          {editingLoc.ownerPhotoUrl ? <img src={editingLoc.ownerPhotoUrl} className="w-full h-full object-cover" /> : <div className="h-full flex items-center justify-center text-slate-300"><User size={32}/></div>}
                       </div>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-slate-400 uppercase">点位名称</label>
                       <input type="text" value={locEditForm.name} onChange={e => setLocEditForm({...locEditForm, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black" />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-slate-400 uppercase">当前读数</label>
                       <input type="number" value={locEditForm.lastScore} onChange={e => setLocEditForm({...locEditForm, lastScore: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black" />
                    </div>
                 </div>

                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase">归属司机 Assigned Driver</label>
                    <select 
                      value={editingLoc.assignedDriverId} 
                      onChange={e => {
                        const updated = locations.map(l => l.id === editingLoc.id ? { ...l, assignedDriverId: e.target.value } : l);
                        onUpdateLocations(updated);
                      }}
                      className="w-full bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-xl px-4 py-3 text-sm font-black outline-none"
                    >
                       {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                 </div>

                 {editingLoc.coords && (
                   <button 
                     onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${editingLoc.coords?.lat},${editingLoc.coords?.lng}`, '_blank')}
                     className="w-full py-4 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-2xl text-[10px] font-black uppercase flex items-center justify-center gap-2"
                   >
                      <MapPin size={14}/> 查看实地 GPS 位置
                   </button>
                 )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100">
                 <button onClick={() => {
                    const updated = locations.map(l => l.id === editingLoc.id ? { ...l, name: locEditForm.name, commissionRate: (parseFloat(locEditForm.commissionRate)||15)/100, lastScore: parseInt(locEditForm.lastScore)||0 } : l);
                    onUpdateLocations(updated);
                    setEditingLoc(null);
                 }} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs active:scale-95 transition-all shadow-xl">保存并应用更正 SAVE</button>
              </div>
           </div>
        </div>
      )}

      {/* FIXED ASSET MAP MODAL */}
      {showAssetMap && (
        <div className="fixed inset-0 z-[110] bg-slate-900 flex flex-col animate-in fade-in">
           <header className="p-6 bg-slate-900 border-b border-white/10 flex justify-between items-center">
              <div>
                 <h2 className="text-xl font-black text-white uppercase">全网资产实时分布</h2>
                 <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Active Kiosks: {locations.length}</p>
              </div>
              <button onClick={() => setShowAssetMap(false)} className="p-3 bg-white/10 text-white rounded-full hover:bg-white/20"><X size={20}/></button>
           </header>
           <div className="flex-1 bg-slate-800 relative overflow-y-auto p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                 {locations.filter(l => l.coords).map(loc => (
                   <div key={loc.id} className="bg-slate-900 border border-white/10 p-5 rounded-[32px] flex justify-between items-center group hover:border-indigo-500 transition-all">
                      <div>
                         <p className="text-[10px] font-black text-indigo-400 uppercase mb-1">{loc.machineId}</p>
                         <h4 className="text-sm font-black text-white">{loc.name}</h4>
                         <p className="text-[9px] text-slate-500 uppercase mt-1">{loc.area}</p>
                      </div>
                      <button 
                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${loc.coords?.lat},${loc.coords?.lng}`, '_blank')}
                        className="p-4 bg-white/5 text-white rounded-2xl group-hover:bg-indigo-600 transition-all"
                      >
                        <Navigation size={20} />
                      </button>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
