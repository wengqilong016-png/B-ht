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

// ... (previous component code)

const Dashboard: React.FC<DashboardProps> = ({ 
  transactions, drivers, locations, dailySettlements, aiLogs, 
  currentUser, onUpdateDrivers, onUpdateLocations, onUpdateTransaction, 
  onNewTransaction, onSaveSettlement, onSync, isSyncing, offlineCount, lang, onNavigate 
}) => {
  const t = TRANSLATIONS[lang];
  const isAdmin = currentUser.role === 'admin';
  
  // Tabs & Map States
  const [activeTab, setActiveTab] = useState<'overview' | 'team' | 'arrears' | 'ai-logs' | 'settlement'>(isAdmin ? 'overview' : 'settlement');
  const [showAssetMap, setShowAssetMap] = useState(false);
  const [trackingDriverId, setTrackingDriverId] = useState<string | null>(null);
  
  // ... (existing states)

  // NEW: Route Tracking Logic
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

  // ... (previous methods)

  return (
    <div className="space-y-6">
      {/* ... (Tabs) */}

      {activeTab === 'overview' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           {/* ... (Stats cards) */}

           {/* NEW: Field Activity Tracking (外勤轨迹) */}
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
                         <div className="text-right">
                            <p className="text-[10px] font-black text-indigo-600 uppercase">预估里程</p>
                            <p className="text-base font-black text-indigo-900">{route.totalKm.toFixed(1)} KM</p>
                         </div>
                      </div>
                      <div className="space-y-3 relative">
                         {/* Visual connection line */}
                         <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-slate-200"></div>
                         
                         {route.legs.map((leg, idx) => (
                           <div key={idx} className="flex items-start gap-4 relative z-10">
                              <div className={`w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[8px] font-black ${idx === 0 ? 'bg-emerald-500 text-white' : idx === route.legs.length - 1 ? 'bg-indigo-600 text-white' : 'bg-slate-300 text-slate-600'}`}>
                                 {idx + 1}
                              </div>
                              <div className="flex-1">
                                 <div className="flex justify-between">
                                    <p className="text-xs font-bold text-slate-700">{leg.locationName}</p>
                                    <p className="text-[10px] font-black text-slate-400">{leg.time}</p>
                                 </div>
                                 {leg.distanceFromPrev > 0 && (
                                   <p className="text-[9px] font-black text-amber-600 uppercase mt-0.5">↑ 移动距离: {leg.distanceFromPrev.toFixed(1)} km</p>
                                 )}
                              </div>
                           </div>
                         ))}
                      </div>
                      <button 
                        onClick={() => {
                          const url = `https://www.google.com/maps/dir/${route.legs.map(l => `${l.gps.lat},${l.gps.lng}`).join('/')}`;
                          window.open(url, '_blank');
                        }}
                        className="w-full mt-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-slate-50"
                      >
                        <Navigation size={12} /> 在 Google Maps 查看完整轨迹
                      </button>
                   </div>
                 ))}
                 {driverRoutes.every(r => r.legs.length === 0) && (
                   <div className="col-span-full py-10 text-center text-slate-400 italic text-xs uppercase tracking-widest">今日暂无外勤轨迹数据</div>
                 )}
              </div>
           </div>

           {/* ... (Approvals, Insights, Sites) */}
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
      
      {/* ... (Remaining components) */}


      {/* Remaining Tabs (Team, AI Logs, Arrears) */}
      {activeTab === 'team' && <DriverManagement drivers={drivers} transactions={transactions} onUpdateDrivers={onUpdateDrivers} />}
      {activeTab === 'ai-logs' && (
        <div className="space-y-4">
           {aiLogs.map(log => (
             <div key={log.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between group">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400"><BrainCircuit size={24}/></div>
                   <div>
                      <p className="text-xs font-black text-slate-900">{log.driverName}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(log.timestamp).toLocaleString()}</p>
                   </div>
                </div>
                <div className="max-w-xs text-right">
                   <p className="text-[10px] font-bold text-slate-600 truncate">{log.query}</p>
                   <p className="text-[9px] font-black text-indigo-600 uppercase">{log.modelUsed}</p>
                </div>
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
                   <div>
                      <p className="text-xs font-black text-slate-900">{tx.locationName}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(tx.timestamp).toLocaleString()}</p>
                   </div>
                </div>
                <p className="text-lg font-black text-rose-600">TZS {tx.netPayable.toLocaleString()}</p>
             </div>
           ))}
        </div>
      )}

      {/* Editing Modal (Sites) */}
      {editingLoc && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden">
              <div className="bg-slate-900 p-8 text-white relative">
                 <button onClick={() => setEditingLoc(null)} className="absolute top-6 right-6 p-2 bg-white/10 rounded-full"><X size={18} /></button>
                 <h3 className="text-xl font-black uppercase">配置修改</h3>
                 <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{editingLoc.machineId} • {editingLoc.name}</p>
              </div>
              <div className="p-8 space-y-5">
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">点位名称 SITE NAME</label>
                    <input type="text" value={locEditForm.name} onChange={e => setLocEditForm({...locEditForm, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none" />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-slate-400 uppercase ml-1">分红比例 %</label>
                       <input type="number" value={locEditForm.commissionRate} onChange={e => setLocEditForm({...locEditForm, commissionRate: e.target.value})} className="w-full bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-xl px-4 py-3 text-sm font-black outline-none" />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-slate-400 uppercase ml-1">最后读数 Score</label>
                       <input type="number" value={locEditForm.lastScore} onChange={e => setLocEditForm({...locEditForm, lastScore: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none" />
                    </div>
                 </div>
                 <button onClick={() => {
                    const updated = locations.map(l => l.id === editingLoc.id ? { ...l, name: locEditForm.name, commissionRate: (parseFloat(locEditForm.commissionRate)||15)/100, lastScore: parseInt(locEditForm.lastScore)||0, status: locEditForm.status } : l);
                    onUpdateLocations(updated);
                    setEditingLoc(null);
                 }} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs active:scale-95 transition-all">保存配置 SAVE</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
