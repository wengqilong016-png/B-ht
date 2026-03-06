
import React, { useMemo, useState, useEffect } from 'react';
import { MapPin, Radio, Search, Calculator, AlertTriangle, CheckCircle2, Banknote, User, Pencil, ChevronRight, Receipt, Navigation, Store, ThumbsUp, ArrowRight, RefreshCw, Wallet, ShieldAlert, Eye, Camera } from 'lucide-react';
import { Transaction, Driver, Location, CONSTANTS, User as UserType, DailySettlement, TRANSLATIONS, AILog } from '../types';
import DriverManagement from './DriverManagement';
import SmartInsights from './SmartInsights';
import LiveMap from './LiveMap';

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
  initialTab?: 'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'ai-logs' | 'tracking';
}

const Dashboard: React.FC<DashboardProps> = ({ transactions, drivers, locations, dailySettlements, aiLogs, currentUser, onUpdateDrivers, onUpdateLocations, onUpdateTransaction, onNewTransaction, onSaveSettlement, onSync, isSyncing, offlineCount, lang, onNavigate, initialTab }) => {
  const t = TRANSLATIONS[lang];
  const isAdmin = currentUser.role === 'admin';
  const [activeTab, setActiveTab] = useState<'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'ai-logs' | 'tracking'>(initialTab || (isAdmin ? 'overview' : 'settlement'));
  const [revDrilldown, setRevDrilldown] = useState<'none' | 'drivers' | string>('none'); // revenue drill-down state
  const [expandedDriverTracking, setExpandedDriverTracking] = useState<string | null>(null); // tracking tab driver expand
  
  // Sync activeTab when initialTab prop changes from parent
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);


  const [actualCash, setActualCash] = useState<string>('');
  const [actualCoins, setActualCoins] = useState<string>('');
  const [settlementPhotoUrl, setSettlementPhotoUrl] = useState<string | null>(null);

  const [editingLoc, setEditingLoc] = useState<Location | null>(null);
  const [locEditForm, setLocEditForm] = useState({ name: '', commissionRate: '', lastScore: '', status: 'active' as Location['status'], ownerPhotoUrl: '' });
  // Tracking tab: editing location commission/status inline
  const [trackingEditLocId, setTrackingEditLocId] = useState<string | null>(null);
  const [trackingLocForm, setTrackingLocForm] = useState({ commissionRate: '', status: 'active' as Location['status'] });

  const [siteSearch, setSiteSearch] = useState('');
  const [siteFilterArea, setSiteFilterArea] = useState<string>('all');
  const [siteSort, setSiteSort] = useState<{ key: 'name' | 'status' | 'lastScore' | 'commission'; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

  const [aiLogSearch, setAiLogSearch] = useState('');
  const [aiLogTypeFilter, setAiLogTypeFilter] = useState<'all' | 'image' | 'text'>('all');
  const [aiLogViewMode, setAiLogViewMode] = useState<'list' | 'grid'>('list');
  const [viewingLog, setViewingLog] = useState<AILog | null>(null);

  useEffect(() => {
    if (!isAdmin) setActiveTab('settlement');
  }, [isAdmin]);

  const myTransactions = useMemo(() => isAdmin ? transactions : transactions.filter(t => t.driverId === currentUser.id), [transactions, currentUser, isAdmin]);
  const todayStr = new Date().toISOString().split('T')[0];
  const todayDriverTxs = useMemo(() => myTransactions.filter(t => t.timestamp.startsWith(todayStr)), [myTransactions, todayStr]);
  const myProfile = useMemo(() => drivers.find(d => d.id === (isAdmin ? drivers[0]?.id : currentUser.id)), [drivers, currentUser, isAdmin]);
  const totalArrears = useMemo(() => myTransactions.filter(tx => tx.paymentStatus === 'unpaid').reduce((sum, tx) => sum + tx.netPayable, 0), [myTransactions]);
  const pendingExpenses = useMemo(() => transactions.filter(tx => tx.expenses > 0 && tx.expenseStatus === 'pending'), [transactions]);
  const pendingSettlements = useMemo(() => dailySettlements.filter(s => s.status === 'pending'), [dailySettlements]);

  // New approval pipeline data
  const anomalyTransactions = useMemo(() => transactions.filter(tx => tx.isAnomaly === true && tx.approvalStatus !== 'approved' && tx.approvalStatus !== 'rejected'), [transactions]);
  const pendingResetRequests = useMemo(() => transactions.filter(tx => tx.type === 'reset_request' && tx.approvalStatus === 'pending'), [transactions]);
  const pendingPayoutRequests = useMemo(() => transactions.filter(tx => tx.type === 'payout_request' && tx.approvalStatus === 'pending'), [transactions]);

  // --- Payroll System ---
  const payrollStats = useMemo(() => {
    const months = Array.from(new Set(transactions.map(t => t.timestamp.substring(0, 7)))).sort().reverse();
    // Pre-group transactions and settlements by driverId to avoid O(n×m) per-driver scans
    const txByDriver = new Map<string, Transaction[]>();
    transactions.forEach(t => {
      const arr = txByDriver.get(t.driverId);
      if (arr) arr.push(t);
      else txByDriver.set(t.driverId, [t]);
    });
    const settlementByDriver = new Map<string, DailySettlement[]>();
    dailySettlements.filter(s => s.status === 'confirmed').forEach(s => {
      const arr = settlementByDriver.get(s.driverId);
      if (arr) arr.push(s);
      else settlementByDriver.set(s.driverId, [s]);
    });
    return drivers.filter(d => d.status === 'active').map(driver => {
      const driverTxs = txByDriver.get(driver.id) ?? [];
      const driverSettlements = settlementByDriver.get(driver.id) ?? [];
      const monthlyBreakdown = months.map(month => {
        const monthTxs = driverTxs.filter(t => t.timestamp.startsWith(month));
        const monthSettlements = driverSettlements.filter(s => s.date.startsWith(month));
        const totalRevenue = monthTxs.reduce((sum, t) => sum + t.revenue, 0);
        const commission = Math.floor(totalRevenue * (driver.commissionRate || 0.05));
        const loans = monthTxs.filter(t => t.expenseType === 'private').reduce((sum, t) => sum + t.expenses, 0);
        const shortage = monthSettlements.reduce((sum, s) => sum + (s.shortage < 0 ? Math.abs(s.shortage) : 0), 0);
        const netPayout = (driver.baseSalary || 0) + commission - loans - shortage;
        return { month, totalRevenue, commission, loans, shortage, netPayout };
      }).filter(m => m.totalRevenue > 0 || m.shortage > 0);
      return { driver, monthlyBreakdown };
    });
  }, [drivers, transactions, dailySettlements]);

  const allAreas = useMemo(() => Array.from(new Set(locations.map(l => l.area))).sort(), [locations]);
  
  const managedLocations = useMemo(() => {
    return locations.filter(l => {
      const matchSearch = l.name.toLowerCase().includes(siteSearch.toLowerCase()) || l.machineId.toLowerCase().includes(siteSearch.toLowerCase());
      const matchArea = siteFilterArea === 'all' || l.area === siteFilterArea;
      return matchSearch && matchArea;
    }).sort((a, b) => {
      const dir = siteSort.direction === 'asc' ? 1 : -1;
      let valA: any = a[siteSort.key as keyof Location], valB: any = b[siteSort.key as keyof Location];
      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });
  }, [locations, siteSearch, siteFilterArea, siteSort]);

  const filteredAiLogs = useMemo(() => {
    let result = aiLogs;
    if (aiLogSearch) {
        const q = aiLogSearch.toLowerCase();
        result = result.filter(log => log.driverName.toLowerCase().includes(q) || log.query.toLowerCase().includes(q) || log.response.toLowerCase().includes(q));
    }
    if (aiLogTypeFilter === 'image') result = result.filter(log => !!log.imageUrl);
    return result;
  }, [aiLogs, aiLogSearch, aiLogTypeFilter]);

  const bossStats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    let todayRev = transactions.filter(t => t.timestamp.startsWith(todayStr)).reduce((sum, t) => sum + t.revenue, 0);
    const riskyDrivers = drivers.filter(d => d.remainingDebt > 100000);
    return { todayRev, riskyDrivers, stagnantMachines: locations.filter(l => l.status === 'broken') };
  }, [transactions, drivers, locations]);

  const handleExpenseAction = (tx: Transaction, action: 'approve' | 'reject') => {
    onUpdateTransaction(tx.id, { expenseStatus: action === 'approve' ? 'approved' : 'rejected' });
  };

  const handleEditLocation = (loc: Location) => {
    setEditingLoc(loc);
    setLocEditForm({
      name: loc.name,
      commissionRate: (loc.commissionRate * 100).toString(),
      lastScore: loc.lastScore.toString(),
      status: loc.status,
      ownerPhotoUrl: loc.ownerPhotoUrl || ''
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 border-b border-slate-200 pb-2 mb-6 overflow-x-auto scrollbar-hide">
        {isAdmin && <button onClick={() => setActiveTab('overview')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'overview' ? 'text-indigo-600' : 'text-slate-400'}`}>OVERVIEW {activeTab === 'overview' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
        {isAdmin && <button onClick={() => setActiveTab('locations')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'locations' ? 'text-indigo-600' : 'text-slate-400'}`}>SITES {activeTab === 'locations' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
        <button onClick={() => setActiveTab('settlement')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'settlement' ? 'text-indigo-600' : 'text-slate-400'}`}>{isAdmin ? 'APPROVE' : "TODAY'S SETTLEMENT"} {activeTab === 'settlement' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>
        {isAdmin && <button onClick={() => setActiveTab('team')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'team' ? 'text-indigo-600' : 'text-slate-400'}`}>FLEET {activeTab === 'team' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
        {isAdmin && <button onClick={() => setActiveTab('tracking')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'tracking' ? 'text-indigo-600' : 'text-slate-400'}`}>TRACKING {activeTab === 'tracking' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
        {isAdmin && <button onClick={() => setActiveTab('ai-logs')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'ai-logs' ? 'text-indigo-600' : 'text-slate-400'}`}>AI LOGS {activeTab === 'ai-logs' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
      </div>

      {activeTab === 'overview' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           {revDrilldown === 'none' ? (
             <>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => setRevDrilldown('drivers')}
                    className="bg-slate-900 text-white p-6 rounded-[32px] text-left hover:bg-indigo-900 transition-colors group"
                  >
                     <p className="text-[10px] font-black uppercase opacity-50 group-hover:opacity-80">Today's Revenue ↗ (click for details)</p>
                     <p className="text-2xl font-black">TZS {bossStats.todayRev.toLocaleString()}</p>
                  </button>
                  <div className="bg-white p-6 rounded-[32px] border border-slate-200">
                     <p className="text-[10px] font-black uppercase text-slate-400">Anomalies</p>
                     <p className="text-2xl font-black text-rose-600">{bossStats.stagnantMachines.length}</p>
                  </div>
                  <div className="bg-white p-6 rounded-[32px] border border-slate-200">
                     <p className="text-[10px] font-black uppercase text-slate-400">High-risk Debt</p>
                     <p className="text-2xl font-black text-amber-600">{bossStats.riskyDrivers.length}</p>
                  </div>
               </div>
               <SmartInsights transactions={transactions} locations={locations} />
             </>
           ) : revDrilldown === 'drivers' ? (
             // Revenue drill-down: driver level
             <div className="space-y-4 animate-in fade-in">
               <div className="flex items-center gap-3 mb-2">
                 <button onClick={() => setRevDrilldown('none')} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50"><ArrowRight size={16} className="rotate-180"/></button>
                 <div>
                   <h3 className="text-sm font-black text-slate-900 uppercase">Today's Revenue — By Driver</h3>
                   <p className="text-[10px] text-slate-400 font-bold">Today's Revenue by Driver</p>
                 </div>
               </div>
               {drivers.map(driver => {
                  const driverDayStr = new Date().toISOString().split('T')[0];
                  const driverTxs = transactions.filter(t => t.driverId === driver.id && t.timestamp.startsWith(driverDayStr));
                  const driverRev = driverTxs.reduce((s, t) => s + t.revenue, 0);
                  const driverCommission = driverTxs.reduce((s, t) => s + t.ownerRetention, 0);
                  const driverNet = driverTxs.reduce((s, t) => s + t.netPayable, 0);
                  return (
                    <div key={driver.id} className="bg-white border border-slate-200 rounded-[28px] p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm">{driver.name.charAt(0)}</div>
                          <div>
                            <p className="text-sm font-black text-slate-900">{driver.name}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">{driver.phone} • {driverTxs.length} collections</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-indigo-600">TZS {driverRev.toLocaleString()}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Total Revenue</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                          <p className="text-[7px] font-black text-slate-400 uppercase">Revenue</p>
                          <p className="text-[10px] font-black text-slate-800">TZS {driverRev.toLocaleString()}</p>
                        </div>
                        <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-100 text-center">
                          <p className="text-[7px] font-black text-amber-400 uppercase">Owner Div.</p>
                          <p className="text-[10px] font-black text-amber-700">TZS {driverCommission.toLocaleString()}</p>
                        </div>
                        <div className="bg-indigo-50 p-2.5 rounded-xl border border-indigo-100 text-center">
                          <p className="text-[7px] font-black text-indigo-400 uppercase">Net Cash</p>
                          <p className="text-[10px] font-black text-indigo-700">TZS {driverNet.toLocaleString()}</p>
                        </div>
                      </div>
                      {driverTxs.length > 0 && (
                        <div className="space-y-2 border-t border-slate-50 pt-3">
                          {driverTxs.map(tx => {
                            const loc = locations.find(l => l.id === tx.locationId);
                            return (
                              <div key={tx.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                                <div className="flex items-center gap-2">
                                  {loc?.machinePhotoUrl ? (
                                    <img src={loc.machinePhotoUrl} alt="machine" className="w-7 h-7 rounded-lg object-cover border border-slate-200"/>
                                  ) : (
                                    <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400"><Store size={12}/></div>
                                  )}
                                  <div>
                                    <p className="text-[10px] font-black text-slate-900">{tx.locationName}</p>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase">{loc?.machineId || '-'} • {new Date(tx.timestamp).toLocaleTimeString()}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] font-black text-slate-900">TZS {tx.revenue.toLocaleString()}</p>
                                  <div className="flex gap-1 justify-end mt-0.5">
                                    <span className="text-[7px] font-bold text-amber-500 bg-amber-50 px-1 py-0.5 rounded">div {tx.ownerRetention.toLocaleString()}</span>
                                    <span className="text-[7px] font-bold text-indigo-500 bg-indigo-50 px-1 py-0.5 rounded">net {tx.netPayable.toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
             </div>
           ) : null}
        </div>
      )}

      {activeTab === 'tracking' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           <div className="flex justify-between items-center bg-white p-6 rounded-[32px] border border-slate-200">
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Fleet Tracking</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                   <Radio size={12} className="text-indigo-600 animate-pulse" /> Driver Location & Point Management
                </p>
              </div>
              <div className="flex items-center gap-3">
                 <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex flex-col items-center justify-center">
                   <span className="text-xl font-black text-indigo-600">{drivers.length}</span>
                   <span className="text-[7px] font-black text-indigo-400 uppercase leading-none">Drivers</span>
                 </div>
              </div>
           </div>

           <div className="space-y-4">
             {drivers.map(driver => {
               const driverLocs = locations.filter(l => l.assignedDriverId === driver.id);
               const isExpanded = expandedDriverTracking === driver.id;
               return (
                 <div key={driver.id} className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-sm">
                   <button
                     className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
                     onClick={() => { setExpandedDriverTracking(isExpanded ? null : driver.id); setTrackingEditLocId(null); }}
                   >
                     <div className="flex items-center gap-4">
                       <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-md ${driver.status === 'active' ? 'bg-indigo-600' : 'bg-slate-400'}`}>
                         {driver.name.charAt(0)}
                       </div>
                       <div className="text-left">
                         <p className="text-sm font-black text-slate-900">{driver.name}</p>
                         <p className="text-[9px] font-bold text-slate-400 uppercase">
                           {driverLocs.length} locations • {driver.status === 'active' ? (driver.lastActive ? `${Math.floor((Date.now() - new Date(driver.lastActive).getTime()) / 60000)} min ago` : 'Online') : 'Offline'}
                         </p>
                       </div>
                     </div>
                     <div className="flex items-center gap-3">
                       <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase ${driver.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{driver.status}</span>
                       <ChevronRight size={16} className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                     </div>
                   </button>

                   {isExpanded && (
                     <div className="border-t border-slate-100 p-5 space-y-3 animate-in slide-in-from-top-2">
                       {driverLocs.length === 0 ? (
                         <p className="text-center text-[10px] font-black text-slate-300 uppercase py-6">No locations assigned to this driver</p>
                       ) : (
                         driverLocs.map(loc => {
                           const isEditingThis = trackingEditLocId === loc.id;
                           return (
                             <div key={loc.id} className="bg-slate-50 rounded-[24px] p-4 border border-slate-100">
                               <div className="flex items-center justify-between mb-2">
                                 <div className="flex items-center gap-2">
                                   <div className={`w-2 h-2 rounded-full ${loc.status === 'active' ? 'bg-emerald-500' : loc.status === 'maintenance' ? 'bg-amber-500' : 'bg-rose-500'}`}></div>
                                   <p className="text-xs font-black text-slate-900">{loc.name}</p>
                                 </div>
                                 <button
                                   onClick={() => {
                                     if (isEditingThis) {
                                       setTrackingEditLocId(null);
                                     } else {
                                       setTrackingEditLocId(loc.id);
                                       setTrackingLocForm({ commissionRate: (loc.commissionRate * 100).toFixed(0), status: loc.status });
                                     }
                                   }}
                                   className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                                 >
                                   <Pencil size={12} />
                                 </button>
                               </div>
                               <div className="grid grid-cols-3 gap-2 text-[9px]">
                                 <div><span className="text-slate-400 font-bold uppercase block">Machine ID</span><span className="font-black text-slate-700">{loc.machineId}</span></div>
                                 <div><span className="text-slate-400 font-bold uppercase block">Last Score</span><span className="font-black text-slate-700">{loc.lastScore.toLocaleString()}</span></div>
                                 <div><span className="text-slate-400 font-bold uppercase block">Commission</span><span className="font-black text-indigo-600">{(loc.commissionRate * 100).toFixed(0)}%</span></div>
                               </div>
                               {isEditingThis && (
                                 <div className="mt-3 border-t border-slate-200 pt-3 space-y-3 animate-in slide-in-from-top-2">
                                   <div className="grid grid-cols-2 gap-2">
                                     <div>
                                       <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Commission (%)</label>
                                       <input
                                         type="number"
                                         value={trackingLocForm.commissionRate}
                                         onChange={e => setTrackingLocForm(f => ({ ...f, commissionRate: e.target.value }))}
                                         className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-black outline-none"
                                         placeholder="15"
                                       />
                                     </div>
                                     <div>
                                       <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">状态 Status</label>
                                       <select
                                         value={trackingLocForm.status}
                                         onChange={e => setTrackingLocForm(f => ({ ...f, status: e.target.value as Location['status'] }))}
                                         className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-black outline-none"
                                       >
                                         <option value="active">Active</option>
                                         <option value="maintenance">Maintenance</option>
                                         <option value="broken">Broken</option>
                                       </select>
                                     </div>
                                   </div>
                                   <button
                                     onClick={() => {
                                       const rate = parseFloat(trackingLocForm.commissionRate) / 100;
                                       if (!isNaN(rate) && rate >= 0 && rate <= 1) {
                                         const updated = locations.map(l => l.id === loc.id ? { ...l, commissionRate: rate, status: trackingLocForm.status, isSynced: false } : l);
                                         onUpdateLocations(updated);
                                         setTrackingEditLocId(null);
                                       }
                                     }}
                                     className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase"
                                   >
                                     Save Changes
                                   </button>
                                 </div>
                               )}
                             </div>
                           );
                         })
                       )}
                       {driver.currentGps && (
                         <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase pt-1">
                           <Navigation size={10} className="text-indigo-500 animate-pulse" />
                           实时GPS: {driver.currentGps.lat.toFixed(4)}, {driver.currentGps.lng.toFixed(4)}
                         </div>
                       )}
                     </div>
                   )}
                 </div>
               );
             })}
           </div>

           <details className="group">
             <summary className="cursor-pointer list-none flex items-center justify-between bg-white p-5 rounded-[32px] border border-slate-200 shadow-sm select-none">
               <div className="flex items-center gap-3">
                 <MapPin size={18} className="text-indigo-500" />
                 <span className="text-sm font-black text-slate-900 uppercase">Live Map</span>
               </div>
               <span className="text-[10px] font-black text-slate-400 uppercase group-open:hidden">Expand ▼</span>
               <span className="text-[10px] font-black text-slate-400 uppercase hidden group-open:block">Collapse ▲</span>
             </summary>
             <div className="mt-4">
               <LiveMap drivers={drivers} locations={locations} transactions={transactions} />
             </div>
           </details>
        </div>
      )}

      {activeTab === 'locations' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-[28px] border border-slate-200 shadow-sm">
              <div className="relative flex-1 w-full md:w-64">
                 <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                 <input type="text" placeholder="Search machines..." value={siteSearch} onChange={e => setSiteSearch(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-11 pr-4 text-xs font-bold" />
              </div>
              <select value={siteFilterArea} onChange={e => setSiteFilterArea(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-xs font-black uppercase outline-none">
                 <option value="all">ALL AREAS</option>
                 {allAreas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
           </div>
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {managedLocations.map(loc => (
                 <div key={loc.id} className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                    {/* Machine Photo — permanent display */}
                    <div className="h-36 bg-slate-100 relative overflow-hidden">
                       {loc.machinePhotoUrl ? (
                          <img src={loc.machinePhotoUrl} alt={loc.name} className="w-full h-full object-cover" />
                       ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                             <Store size={36} />
                          </div>
                       )}
                       <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[8px] font-black uppercase backdrop-blur-sm ${loc.status === 'active' ? 'bg-emerald-500/80 text-white' : loc.status === 'maintenance' ? 'bg-amber-500/80 text-white' : 'bg-rose-500/80 text-white'}`}>{loc.status}</div>
                    </div>
                    <div className="p-4">
                       <div className="flex justify-between items-start mb-3">
                          <div>
                             <p className="text-sm font-black text-slate-900 leading-tight">{loc.name}</p>
                             <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{loc.machineId} • {loc.area}</p>
                          </div>
                          <button onClick={() => handleEditLocation(loc)} className="p-2 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded-xl"><Pencil size={13} /></button>
                       </div>
                       <div className="grid grid-cols-3 gap-2">
                          <div className="bg-slate-50 p-2 rounded-xl">
                             <p className="text-[7px] font-black text-slate-400 uppercase">Last Score</p>
                             <p className="text-[10px] font-black text-slate-800">{loc.lastScore.toLocaleString()}</p>
                          </div>
                          <div className="bg-indigo-50 p-2 rounded-xl">
                             <p className="text-[7px] font-black text-indigo-400 uppercase">Commission</p>
                             <p className="text-[10px] font-black text-indigo-700">{(loc.commissionRate * 100).toFixed(0)}%</p>
                          </div>
                          <div className="bg-amber-50 p-2 rounded-xl">
                             <p className="text-[7px] font-black text-amber-400 uppercase">Startup</p>
                             <p className="text-[10px] font-black text-amber-700">{loc.remainingStartupDebt > 0 ? `${Math.round((1 - loc.remainingStartupDebt / (loc.initialStartupDebt || 1)) * 100)}%` : 'Paid'}</p>
                          </div>
                       </div>
                       {loc.ownerName && (
                          <p className="text-[8px] font-bold text-slate-400 uppercase mt-2 truncate">Owner: {loc.ownerName}</p>
                       )}
                    </div>
                 </div>
              ))}
           </div>
        </div>
      )}

      {activeTab === 'team' && isAdmin && (
        <div className="space-y-8 animate-in fade-in">
          <DriverManagement drivers={drivers} transactions={transactions} onUpdateDrivers={onUpdateDrivers} />
          {/* Payroll section merged into fleet tab */}
          <div className="space-y-4 border-t border-slate-100 pt-6">
            <div className="bg-white p-5 rounded-[28px] border border-slate-200 flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Receipt size={18}/></div>
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase">Payroll</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Compensation Reports — Electronic Payslip</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {payrollStats.map(({ driver, monthlyBreakdown }) => (
                <div key={driver.id} className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm">
                  <h3 className="font-black text-slate-900 uppercase mb-3 text-sm">{driver.name}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {monthlyBreakdown.map((m, i) => (
                      <div key={i} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="flex justify-between mb-1"><span className="text-[10px] font-black text-slate-400 uppercase">{m.month}</span><span className="text-xs font-black text-indigo-600">TZS {m.netPayout.toLocaleString()}</span></div>
                        <div className="grid grid-cols-3 gap-1 text-[8px] text-slate-400 mb-2">
                          <span>Base: {(driver.baseSalary || 0).toLocaleString()}</span>
                          <span>Comm: {m.commission.toLocaleString()}</span>
                          <span>Short: {m.shortage.toLocaleString()}</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => window.print()} className="flex-1 py-2 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase">PDF</button>
                          <button onClick={() => {
                            const msg = `*PAYROLL ${m.month}*\nDriver: ${driver.name}\nBase: TZS ${(driver.baseSalary||0).toLocaleString()}\nComm: TZS ${m.commission.toLocaleString()}\nNet: TZS ${m.netPayout.toLocaleString()}`;
                            window.open(`https://wa.me/${driver.phone?.replace(/\+/g,'')}?text=${encodeURIComponent(msg)}`);
                          }} className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-[9px] font-black uppercase">WhatsApp</button>
                        </div>
                      </div>
                    ))}
                    {monthlyBreakdown.length === 0 && <p className="col-span-2 text-center text-[10px] text-slate-300 font-black uppercase py-4">No payroll data</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {activeTab === 'settlement' && (
        <div className="space-y-6 animate-in slide-in-from-right-4">
           {isAdmin ? (
             // Admin view: Review driver settlements AND expense requests
             <div className="space-y-6">
                {/* Part 1: Settlement Approvals */}
                <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex justify-between items-center">
                   <div>
                     <h3 className="text-lg font-black text-slate-900 uppercase">{t.approvalCenter}</h3>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                       {lang === 'zh' ? '结算' : 'Settlements'} ({pendingSettlements.length}) • {t.anomalyReview} ({anomalyTransactions.length}) • {t.resetApproval} ({pendingResetRequests.length}) • {t.payoutApproval} ({pendingPayoutRequests.length})
                     </p>
                   </div>
                   <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><Calculator size={20} /></div>
                </div>
                
                {pendingSettlements.length === 0 ? (
                  <div className="py-12 text-center bg-white rounded-[40px] border border-dashed border-slate-200">
                     <CheckCircle2 size={40} className="mx-auto text-emerald-200 mb-3" />
                     <p className="text-xs font-black text-slate-400 uppercase tracking-widest">All settlements processed</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {pendingSettlements.map(s => (
                       <div key={s.id} className="bg-white p-6 rounded-[32px] border-2 border-amber-100 shadow-xl relative overflow-hidden">
                          <div className="flex justify-between items-start mb-4">
                             <div>
                                <p className="text-sm font-black text-slate-900 uppercase">{s.driverName}</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(s.timestamp).toLocaleString()}</p>
                             </div>
                             <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-[8px] font-black uppercase">PENDING</div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mb-4">
                             <div className="bg-slate-50 p-3 rounded-xl">
                                <p className="text-[8px] font-black text-slate-400 uppercase">Expected Total</p>
                                <p className="text-xs font-black text-slate-900">TZS {s.expectedTotal.toLocaleString()}</p>
                             </div>
                             <div className="bg-slate-50 p-3 rounded-xl">
                                <p className="text-[8px] font-black text-slate-400 uppercase">Actual Submitted</p>
                                <p className="text-xs font-black text-indigo-600">TZS {(s.actualCash + s.actualCoins).toLocaleString()}</p>
                             </div>
                          </div>
                          {s.shortage !== 0 && (
                             <div className={`p-3 rounded-xl mb-4 flex items-center justify-between ${s.shortage < 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                <span className="text-[9px] font-black uppercase">{s.shortage < 0 ? 'Shortage' : 'Surplus'}</span>
                                <span className="text-xs font-black">TZS {Math.abs(s.shortage).toLocaleString()}</span>
                             </div>
                          )}
                          {/* Show proof photo if attached */}
                          {(s as any).transferProofUrl && (
                            <div className="mb-4">
                              <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Settlement Proof</p>
                              <img src={(s as any).transferProofUrl} alt="Proof" className="w-full h-28 object-cover rounded-xl border border-slate-200" />
                            </div>
                          )}
                          <div className="flex gap-2">
                             <button onClick={() => onSaveSettlement({...s, status: 'confirmed'})} className="flex-1 py-3 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-emerald-100">✓ Approve</button>
                             <button onClick={() => onSaveSettlement({...s, status: 'rejected'})} className="flex-1 py-3 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-black uppercase">✗ Reject</button>
                          </div>
                       </div>
                     ))}
                  </div>
                )}

                {/* Part 2: Expense Approval Requests (Loans, Repairs, Fuel) */}
                {pendingExpenses.length > 0 && (
                  <div className="space-y-4">
                    <div className="bg-rose-50 p-4 rounded-[24px] border border-rose-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-black text-rose-800 uppercase">Expense Requests</h3>
                        <p className="text-[9px] font-bold text-rose-500 uppercase">Loans / Repairs / Fuel — Pending Approval ({pendingExpenses.length})</p>
                      </div>
                      <div className="bg-rose-200 text-rose-800 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{pendingExpenses.length} Pending</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pendingExpenses.map(tx => {
                        const driver = drivers.find(d => d.id === tx.driverId);
                        const categoryLabel = {
                          fuel: '⛽ Fuel',
                          repair: '🔧 Repair',
                          fine: '🚨 Fine',
                          allowance: '🍽 Allowance',
                          salary_advance: '💰 Salary Advance',
                          other: '📋 Other',
                        }[tx.expenseCategory || 'other'] || '📋 Other';
                        return (
                          <div key={tx.id} className="bg-white p-5 rounded-[24px] border border-rose-100 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-rose-100 text-rose-700 rounded-xl flex items-center justify-center font-black text-xs">{driver?.name?.charAt(0) || '?'}</div>
                                <div>
                                  <p className="text-[10px] font-black text-slate-900">{tx.driverName}</p>
                                  <p className="text-[8px] font-bold text-slate-400">{new Date(tx.timestamp).toLocaleDateString()}</p>
                                </div>
                              </div>
                              <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${tx.expenseType === 'private' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                                {tx.expenseType === 'private' ? 'Loan' : 'Company'}
                              </div>
                            </div>
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="text-[9px] font-bold text-slate-500">{categoryLabel}</p>
                                <p className="text-xs font-black text-slate-900">TZS {tx.expenses.toLocaleString()}</p>
                              </div>
                              <div className="text-[8px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-xl">{tx.locationName}</div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => onUpdateTransaction(tx.id, { expenseStatus: 'approved' })} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase">✓ Approve</button>
                              <button onClick={() => onUpdateTransaction(tx.id, { expenseStatus: 'rejected' })} className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-[9px] font-black uppercase">✗ Reject</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Part 3: AI Anomaly Review (异常审查) */}
                {anomalyTransactions.length > 0 && (
                  <div className="space-y-4">
                    <div className="bg-amber-50 p-4 rounded-[24px] border border-amber-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-black text-amber-800 uppercase flex items-center gap-2"><ShieldAlert size={16} /> {t.anomalyReview}</h3>
                        <p className="text-[9px] font-bold text-amber-500 uppercase">AI flagged discrepancies ({anomalyTransactions.length})</p>
                      </div>
                      <div className="bg-amber-200 text-amber-800 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{anomalyTransactions.length}</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {anomalyTransactions.map(tx => {
                        const driver = drivers.find(d => d.id === tx.driverId);
                        return (
                          <div key={tx.id} className="bg-white p-5 rounded-[24px] border-2 border-amber-200 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center font-black text-xs">{driver?.name?.charAt(0) || '?'}</div>
                                <div>
                                  <p className="text-[10px] font-black text-slate-900">{tx.driverName}</p>
                                  <p className="text-[8px] font-bold text-slate-400">{tx.locationName} — {new Date(tx.timestamp).toLocaleDateString()}</p>
                                </div>
                              </div>
                              <div className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-[8px] font-black uppercase">⚠️ Anomaly</div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-3">
                              <div className="bg-slate-50 p-2 rounded-xl">
                                <p className="text-[8px] font-black text-slate-400 uppercase">Driver Input</p>
                                <p className="text-xs font-black text-slate-900">{tx.currentScore}</p>
                              </div>
                              <div className="bg-amber-50 p-2 rounded-xl">
                                <p className="text-[8px] font-black text-amber-400 uppercase">AI Detected</p>
                                <p className="text-xs font-black text-amber-700">{tx.aiScore ?? 'N/A'}</p>
                              </div>
                            </div>
                            {tx.photoUrl && (
                              <div className="mb-3">
                                <img src={tx.photoUrl} alt="Evidence" className="w-full h-24 object-cover rounded-xl border border-slate-200" />
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button onClick={() => onUpdateTransaction(tx.id, { approvalStatus: 'approved', isAnomaly: false })} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase">✓ {t.approveBtn}</button>
                              <button onClick={() => onUpdateTransaction(tx.id, { approvalStatus: 'rejected' })} className="flex-1 py-2.5 bg-rose-500 text-white rounded-xl text-[9px] font-black uppercase">✗ {t.rejectBtn}</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Part 4: 9999 Reset Approval (重置审批) */}
                {pendingResetRequests.length > 0 && (
                  <div className="space-y-4">
                    <div className="bg-purple-50 p-4 rounded-[24px] border border-purple-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-black text-purple-800 uppercase flex items-center gap-2"><RefreshCw size={16} /> {t.resetApproval}</h3>
                        <p className="text-[9px] font-bold text-purple-500 uppercase">9999 Overflow Reset Requests ({pendingResetRequests.length})</p>
                      </div>
                      <div className="bg-purple-200 text-purple-800 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{pendingResetRequests.length}</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pendingResetRequests.map(tx => {
                        const driver = drivers.find(d => d.id === tx.driverId);
                        const loc = locations.find(l => l.id === tx.locationId);
                        return (
                          <div key={tx.id} className="bg-white p-5 rounded-[24px] border-2 border-purple-200 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-purple-100 text-purple-700 rounded-xl flex items-center justify-center font-black text-xs"><RefreshCw size={14} /></div>
                                <div>
                                  <p className="text-[10px] font-black text-slate-900">{tx.driverName}</p>
                                  <p className="text-[8px] font-bold text-slate-400">{tx.locationName} — {loc?.machineId}</p>
                                </div>
                              </div>
                              <div className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded text-[8px] font-black uppercase">RESET</div>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl mb-3">
                              <p className="text-[8px] font-black text-slate-400 uppercase">Current Score (Before Reset)</p>
                              <p className="text-lg font-black text-purple-700">{tx.currentScore}</p>
                            </div>
                            {tx.photoUrl && (
                              <div className="mb-3">
                                <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Reset Evidence Photo</p>
                                <img src={tx.photoUrl} alt="Reset proof" className="w-full h-28 object-cover rounded-xl border border-slate-200" />
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button 
                                onClick={() => {
                                  onUpdateTransaction(tx.id, { approvalStatus: 'approved' });
                                  // Reset the location score to 0 and unlock
                                  if (loc) {
                                    onUpdateLocations(locations.map(l => l.id === loc.id ? { ...l, lastScore: 0, resetLocked: false, isSynced: false } : l));
                                  }
                                }} 
                                className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase"
                              >
                                ✓ {t.approveBtn} & Reset to 0
                              </button>
                              <button 
                                onClick={() => {
                                  onUpdateTransaction(tx.id, { approvalStatus: 'rejected' });
                                  // Unlock the machine even on rejection
                                  if (loc) {
                                    onUpdateLocations(locations.map(l => l.id === loc.id ? { ...l, resetLocked: false, isSynced: false } : l));
                                  }
                                }} 
                                className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-[9px] font-black uppercase"
                              >
                                ✗ {t.rejectBtn}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Part 5: Payout / Dividend Withdrawal Approval (提现审批) */}
                {pendingPayoutRequests.length > 0 && (
                  <div className="space-y-4">
                    <div className="bg-emerald-50 p-4 rounded-[24px] border border-emerald-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-black text-emerald-800 uppercase flex items-center gap-2"><Wallet size={16} /> {t.payoutApproval}</h3>
                        <p className="text-[9px] font-bold text-emerald-500 uppercase">Owner Dividend Withdrawal ({pendingPayoutRequests.length})</p>
                      </div>
                      <div className="bg-emerald-200 text-emerald-800 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{pendingPayoutRequests.length}</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pendingPayoutRequests.map(tx => {
                        const driver = drivers.find(d => d.id === tx.driverId);
                        const loc = locations.find(l => l.id === tx.locationId);
                        return (
                          <div key={tx.id} className="bg-white p-5 rounded-[24px] border-2 border-emerald-200 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center font-black text-xs"><Wallet size={14} /></div>
                                <div>
                                  <p className="text-[10px] font-black text-slate-900">{tx.locationName}</p>
                                  <p className="text-[8px] font-bold text-slate-400">{lang === 'zh' ? '店主' : 'Owner'}: {loc?.ownerName || 'N/A'} — {lang === 'zh' ? '提交人' : 'By'}: {tx.driverName}</p>
                                </div>
                              </div>
                              <div className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[8px] font-black uppercase">PAYOUT</div>
                            </div>
                            <div className="bg-emerald-50 p-4 rounded-xl mb-3 text-center">
                              <p className="text-[8px] font-black text-emerald-400 uppercase">{t.payoutAmount}</p>
                              <p className="text-2xl font-black text-emerald-700">TZS {(tx.payoutAmount || 0).toLocaleString()}</p>
                              <p className="text-[8px] font-bold text-slate-400 mt-1">
                                {lang === 'zh' ? '可用余额' : 'Available'}: TZS {(loc?.dividendBalance || 0).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => {
                                  onUpdateTransaction(tx.id, { approvalStatus: 'approved' });
                                  // Deduct payoutAmount from location's dividendBalance
                                  if (loc && tx.payoutAmount) {
                                    const newBalance = Math.max(0, (loc.dividendBalance || 0) - tx.payoutAmount);
                                    onUpdateLocations(locations.map(l => l.id === loc.id ? { ...l, dividendBalance: newBalance, isSynced: false } : l));
                                  }
                                }} 
                                className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase"
                              >
                                ✓ {t.approveBtn}
                              </button>
                              <button 
                                onClick={() => onUpdateTransaction(tx.id, { approvalStatus: 'rejected' })} 
                                className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-[9px] font-black uppercase"
                              >
                                ✗ {t.rejectBtn}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
             </div>
           ) : (
              // Driver view: Today's Settlement
             <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-2xl space-y-8 animate-in zoom-in-95">
                <div className="text-center">
                   <div className="w-16 h-16 bg-indigo-600 rounded-[24px] flex items-center justify-center text-white mx-auto mb-4 shadow-xl shadow-indigo-100">
                      <Banknote size={32} />
                   </div>
                    <h2 className="text-xl font-black text-slate-900 uppercase">{t.dailySettlement}</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{todayStr} — {todayDriverTxs.length} Collections</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-slate-50 p-5 rounded-[28px] border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">{t.revenue}</p>
                       <p className="text-lg font-black text-slate-900">TZS {todayDriverTxs.reduce((sum, tx) => sum + tx.revenue, 0).toLocaleString()}</p>
                   </div>
                   <div className="bg-indigo-50 p-5 rounded-[28px] border border-indigo-100">
                      <p className="text-[9px] font-black text-indigo-400 uppercase mb-1 tracking-widest">{t.cashInHand}</p>
                       <p className="text-lg font-black text-indigo-600">TZS {todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0).toLocaleString()}</p>
                   </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-50">
                   <div className="bg-slate-50 p-6 rounded-[35px] border border-slate-200">
                       <label className="text-[10px] font-black text-slate-400 uppercase block mb-4 tracking-widest text-center">{t.inputCash} (TZS Notes)</label>
                      <input 
                        type="number" 
                        value={actualCash} 
                        onChange={e => setActualCash(e.target.value)} 
                        className="w-full text-4xl font-black bg-transparent text-center outline-none text-slate-900 placeholder:text-slate-200" 
                        placeholder="0" 
                      />
                   </div>
                   <div className="bg-slate-50 p-6 rounded-[35px] border border-slate-200">
                       <label className="text-[10px] font-black text-slate-400 uppercase block mb-4 tracking-widest text-center">{t.inputCoins} (TZS Coins)</label>
                      <input 
                        type="number" 
                        value={actualCoins} 
                        onChange={e => setActualCoins(e.target.value)} 
                        className="w-full text-4xl font-black bg-transparent text-center outline-none text-slate-900 placeholder:text-slate-200" 
                        placeholder="0" 
                      />
                   </div>
                </div>

                {actualCash && (
                  <div className={`p-6 rounded-[35px] flex justify-between items-center animate-in slide-in-from-top-4 ${parseInt(actualCash) + (parseInt(actualCoins) || 0) === todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0) ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                     <div>
                         <p className="text-[10px] font-black uppercase opacity-60">Variance</p>
                         <p className="text-xl font-black">TZS {(parseInt(actualCash) + (parseInt(actualCoins) || 0) - todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0)).toLocaleString()}</p>
                     </div>
                     <div className="p-3 bg-white/20 rounded-2xl">
                         {parseInt(actualCash) + (parseInt(actualCoins) || 0) === todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0) ? <ThumbsUp size={24}/> : <AlertTriangle size={24}/>}
                     </div>
                  </div>
                )}

                <button 
                  disabled={!actualCash || !actualCoins}
                  onClick={() => {
                      const totalNet = todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0);
                     const actual = (parseInt(actualCash) || 0) + (parseInt(actualCoins) || 0);
                     const settlement: DailySettlement = {
                        id: `STL-${Date.now()}`,
                        date: todayStr,
                        driverId: currentUser.id,
                        driverName: currentUser.name,
                         totalRevenue: todayDriverTxs.reduce((sum, tx) => sum + tx.revenue, 0),
                        totalNetPayable: totalNet,
                         totalExpenses: todayDriverTxs.reduce((sum, tx) => sum + tx.expenses, 0),
                        driverFloat: myProfile?.dailyFloatingCoins || 0,
                        expectedTotal: totalNet,
                        actualCash: parseInt(actualCash) || 0,
                        actualCoins: parseInt(actualCoins) || 0,
                        shortage: actual - totalNet,
                        status: 'pending',
                        timestamp: new Date().toISOString(),
                        isSynced: false
                     };
                     onSaveSettlement(settlement);
                      alert("✅ Settlement submitted! Waiting for approval.");
                     setActualCash('');
                     setActualCoins('');
                  }}
                  className="w-full py-6 bg-slate-900 text-white rounded-[32px] font-black uppercase text-sm shadow-2xl active:scale-95 transition-all disabled:opacity-30"
                >
                   ✓ Submit Today's Settlement
                </button>
             </div>
           )}
        </div>
      )}

      {activeTab === 'ai-logs' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
              <button onClick={() => setAiLogViewMode('list')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${aiLogViewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>LIST</button>
              <button onClick={() => setAiLogViewMode('grid')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${aiLogViewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>GRID</button>
           </div>
           <div className={aiLogViewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-4 gap-4" : "space-y-4"}>
              {filteredAiLogs.map(log => (
                <div key={log.id} className="bg-white p-4 rounded-3xl border border-slate-200">
                   {log.imageUrl && <img src={log.imageUrl} className="w-full aspect-square object-cover rounded-2xl mb-2" alt="Log"/>}
                   <p className="text-[10px] font-black text-slate-900 truncate">{log.driverName}</p>
                   <p className="text-[8px] font-bold text-slate-400 uppercase">{new Date(log.timestamp).toLocaleDateString()}</p>
                </div>
              ))}
           </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
