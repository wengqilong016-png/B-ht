
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
    const activeDrivers = drivers.filter(d => {
        const lastActive = d.lastActive ? new Date(d.lastActive) : null;
        return lastActive && (now.getTime() - lastActive.getTime()) < 600000; // 10 mins
    }).length;
    const brokenSites = locations.filter(l => l.status !== 'active').length;
    return { todayRev, activeDrivers, brokenSites };
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
           <SystemStatus />
           
           {/* Top Command Stats */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 text-white p-6 rounded-[32px] shadow-xl relative overflow-hidden group">
                 <TrendingUp className="absolute -right-4 -top-4 w-24 h-24 opacity-10 group-hover:scale-110 transition-transform" />
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">今日总营收 Revenue</p>
                 <p className="text-3xl font-black">TZS {bossStats.todayRev.toLocaleString()}</p>
              </div>
              <div className="bg-white border border-slate-200 p-6 rounded-[32px] shadow-sm relative">
                 <div className="flex justify-between items-center">
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">当前在线司机 Live</p>
                       <p className="text-3xl font-black text-emerald-600">{bossStats.activeDrivers} / {drivers.length}</p>
                    </div>
                    <div className="p-3 bg-emerald-50 text-emerald-500 rounded-2xl animate-pulse"><Radio size={24} /></div>
                 </div>
              </div>
              <div className={`p-6 rounded-[32px] border relative ${bossStats.brokenSites > 0 ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-white border-slate-200 text-slate-400'}`}>
                 <p className="text-[10px] font-black uppercase tracking-widest mb-1">异常机器 Sites</p>
                 <p className="text-3xl font-black">{bossStats.brokenSites}</p>
                 <AlertTriangle className="absolute right-6 top-6 opacity-20" size={24} />
              </div>
           </div>

           {/* Route Tracking */}
           <div className="bg-white p-6 rounded-[35px] border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600"><Truck size={20} /></div>
                    <h3 className="text-lg font-black text-slate-900 uppercase">今日轨迹监控 TRACKING</h3>
                 </div>
                 <button onClick={() => setShowAssetMap(true)} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-2">
                    <MapIcon size={14} /> 全网地图
                 </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {driverRoutes.filter(r => r.legs.length > 0).map(route => (
                   <div key={route.driverId} className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                      <div className="flex justify-between items-center mb-4">
                         <p className="text-sm font-black text-slate-900">{route.driverName}</p>
                         <p className="text-base font-black text-indigo-900">{route.totalKm.toFixed(1)} KM</p>
                      </div>
                      <div className="space-y-3 relative">
                         <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-slate-200"></div>
                         {route.legs.map((leg, idx) => (
                           <div key={idx} className="flex items-start gap-4 relative z-10">
                              <div className={`w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[8px] font-black ${idx === 0 ? 'bg-emerald-500 text-white' : 'bg-slate-300'}`}>{idx + 1}</div>
                              <div className="flex-1">
                                 <div className="flex justify-between">
                                    <p className="text-xs font-bold text-slate-700">{leg.locationName}</p>
                                    <p className="text-[10px] font-black text-slate-400">{leg.time}</p>
                                 </div>
                              </div>
                           </div>
                         ))}
                      </div>
                   </div>
                 ))}
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
                        <div className="flex gap-1">
                           <button onClick={() => handleExpenseAction(tx, 'approve')} className="p-2 bg-emerald-500 text-white rounded-xl"><ThumbsUp size={12} /></button>
                           <button onClick={() => handleExpenseAction(tx, 'reject')} className="p-2 bg-rose-500 text-white rounded-xl"><ThumbsDown size={12} /></button>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
           )}

           <SmartInsights transactions={transactions} locations={locations} />

           {/* Sites Monitoring */}
           <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                 <h3 className="text-lg font-black text-slate-900 uppercase">点位监控 SITES</h3>
                 <div className="relative max-w-xs">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="搜索点位..." value={siteSearch} onChange={e => setSiteSearch(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-11 pr-4 text-xs font-bold" />
                 </div>
              </div>
              <table className="w-full text-left">
                 <tbody className="divide-y divide-slate-50">
                    {locations.filter(l => l.name.toLowerCase().includes(siteSearch.toLowerCase())).slice(0, 10).map(loc => (
                      <tr key={loc.id} className="hover:bg-slate-50 transition-colors">
                         <td className="px-6 py-4">
                            <p className="text-xs font-black text-slate-900">{loc.name}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">{loc.machineId}</p>
                         </td>
                         <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${loc.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{loc.status}</span>
                         </td>
                         <td className="px-6 py-4 text-right">
                            <button onClick={() => {
                               setEditingLoc(loc);
                               setLocEditForm({ name: loc.name, commissionRate: (loc.commissionRate*100).toString(), lastScore: loc.lastScore.toString(), status: loc.status });
                            }} className="p-2 text-slate-400 hover:text-indigo-600"><Pencil size={14}/></button>
                         </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      )}

      {/* Driver Settlement View */}
      {activeTab === 'settlement' && !isAdmin && (
        <div className="max-w-md mx-auto space-y-6">
           <div className={`p-8 rounded-[40px] border-2 shadow-xl text-center space-y-4 ${dailyStats.isSettled ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-indigo-100'}`}>
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${dailyStats.isSettled ? 'bg-emerald-500 text-white' : 'bg-indigo-100 text-indigo-600'}`}>
                 {dailyStats.isSettled ? <CheckCircle2 size={40} /> : <Calculator size={40} />}
              </div>
              <h2 className="text-2xl font-black text-slate-900 uppercase">{dailyStats.isSettled ? '今日已结账' : '日终对账结算'}</h2>
              {dailyStats.isSettled ? (
                <button onClick={() => { setLastSettlement(dailyStats.todaySettlement || null); setShowSuccessModal(true); }} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs">查看回执 RECEIPT</button>
              ) : (
                <div className="space-y-4 pt-4">
                   <div className="grid grid-cols-2 gap-3">
                      <input type="number" value={actualCash} onChange={e => setActualCash(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-lg font-black text-slate-900" placeholder="纸币" />
                      <input type="number" value={actualCoins} onChange={e => setActualCoins(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-lg font-black text-indigo-600" placeholder="硬币" />
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
                   }} disabled={!actualCash} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-sm shadow-xl">提交审核</button>
                </div>
              )}
           </div>
        </div>
      )}

      {/* Success Receipt Modal */}
      {showSuccessModal && lastSettlement && (
        <div className="fixed inset-0 z-[120] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6">
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

      {/* Site Editing Modal */}
      {editingLoc && (
        <div className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden">
              <div className="bg-slate-900 p-8 text-white relative">
                 <button onClick={() => setEditingLoc(null)} className="absolute top-6 right-6 p-2 bg-white/10 rounded-full"><X size={18} /></button>
                 <h3 className="text-xl font-black uppercase">配置修改</h3>
              </div>
              <div className="p-8 space-y-4">
                 <input type="text" value={locEditForm.name} onChange={e => setLocEditForm({...locEditForm, name: e.target.value})} className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm font-black" placeholder="点位名称" />
                 <div className="grid grid-cols-2 gap-4">
                    <input type="number" value={locEditForm.commissionRate} onChange={e => setLocEditForm({...locEditForm, commissionRate: e.target.value})} className="w-full bg-indigo-50 border rounded-xl px-4 py-3 text-sm font-black text-indigo-600" placeholder="提成%" />
                    <input type="number" value={locEditForm.lastScore} onChange={e => setLocEditForm({...locEditForm, lastScore: e.target.value})} className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm font-black" placeholder="读数" />
                 </div>
                 <button onClick={() => {
                    const updated = locations.map(l => l.id === editingLoc.id ? { ...l, name: locEditForm.name, commissionRate: (parseFloat(locEditForm.commissionRate)||15)/100, lastScore: parseInt(locEditForm.lastScore)||0 } : l);
                    onUpdateLocations(updated);
                    setEditingLoc(null);
                 }} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs">保存配置 SAVE</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
