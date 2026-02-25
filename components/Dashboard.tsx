
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Coins, MapPin, Radio, Search, ExternalLink, Map as MapIcon, Truck, Wallet, Calculator, AlertTriangle, CheckCircle2, Banknote, Plus, X, Save, User, Key, Phone, Pencil, Clock, Loader2, CalendarRange, Calendar, FileText, ChevronRight, Receipt, Fuel, Wrench, Gavel, MoreHorizontal, AlertCircle, Building2, HandCoins, Camera, Info, Share2, Printer, Navigation, Download, ShieldCheck, Percent, LayoutList, TrendingUp, TrendingDown, Target, BellRing, Layers, Settings, BrainCircuit, Store, Signal, Smartphone, ThumbsUp, ThumbsDown, ArrowUpDown, ArrowUp, ArrowDown, Link, FileClock, ImagePlus, Trash2, Send, ArrowRight, ImageIcon, Eye, Sparkles, SlidersHorizontal } from 'lucide-react';
import { Transaction, Driver, Location, CONSTANTS, User as UserType, DailySettlement, TRANSLATIONS, AILog } from '../types';
import DriverManagement from './DriverManagement';
import SmartInsights from './SmartInsights';
import SystemStatus from './SystemStatus';
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
  initialTab?: 'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'ai-logs' | 'tracking' | 'payroll';
}

const Dashboard: React.FC<DashboardProps> = ({ transactions, drivers, locations, dailySettlements, aiLogs, currentUser, onUpdateDrivers, onUpdateLocations, onUpdateTransaction, onNewTransaction, onSaveSettlement, onSync, isSyncing, offlineCount, lang, onNavigate, initialTab }) => {
  const t = TRANSLATIONS[lang];
  const isAdmin = currentUser.role === 'admin';
  const [activeTab, setActiveTab] = useState<'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'ai-logs' | 'tracking' | 'payroll'>(initialTab || (isAdmin ? 'overview' : 'settlement'));
  
  // Sync activeTab when initialTab prop changes from parent
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [selectedDriverFilter, setSelectedDriverFilter] = useState<string | null>(null);

  const [actualCash, setActualCash] = useState<string>('');
  const [actualCoins, setActualCoins] = useState<string>('');
  const [driverFloatInput, setDriverFloatInput] = useState<string>('');
  const [settlementProof, setSettlementProof] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastSettlement, setLastSettlement] = useState<DailySettlement | null>(null);
  const [showAssetMap, setShowAssetMap] = useState(false);
  
  const [reviewingSettlement, setReviewingSettlement] = useState<DailySettlement | null>(null);
  const settlementFileInputRef = useRef<HTMLInputElement>(null);

  const [editingLoc, setEditingLoc] = useState<Location | null>(null);
  const [locEditForm, setLocEditForm] = useState({ name: '', commissionRate: '', lastScore: '', status: 'active' as Location['status'], ownerPhotoUrl: '' });

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
  const myProfile = useMemo(() => drivers.find(d => d.id === (isAdmin ? drivers[0]?.id : currentUser.id)), [drivers, currentUser, isAdmin]);
  const totalArrears = useMemo(() => myTransactions.filter(tx => tx.paymentStatus === 'unpaid').reduce((sum, tx) => sum + tx.netPayable, 0), [myTransactions]);
  const pendingExpenses = useMemo(() => transactions.filter(tx => tx.expenses > 0 && tx.expenseStatus === 'pending'), [transactions]);
  const pendingSettlements = useMemo(() => dailySettlements.filter(s => s.status === 'pending'), [dailySettlements]);

  // --- Payroll System ---
  const payrollStats = useMemo(() => {
    const months = Array.from(new Set(transactions.map(t => t.timestamp.substring(0, 7)))).sort().reverse();
    return drivers.filter(d => d.status === 'active').map(driver => {
      const driverTxs = transactions.filter(t => t.driverId === driver.id);
      const driverSettlements = dailySettlements.filter(s => s.driverId === driver.id && s.status === 'confirmed');
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

  const selectSettlementForReview = (s: DailySettlement) => {
    setReviewingSettlement(s);
    setActualCash(s.actualCash.toString());
    setActualCoins(s.actualCoins.toString());
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
        {isAdmin && <button onClick={() => setActiveTab('overview')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'overview' ? 'text-indigo-600' : 'text-slate-400'}`}>总览 OVERVIEW {activeTab === 'overview' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
        {isAdmin && <button onClick={() => setActiveTab('locations')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'locations' ? 'text-indigo-600' : 'text-slate-400'}`}>点位 SITES {activeTab === 'locations' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
        <button onClick={() => setActiveTab('settlement')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'settlement' ? 'text-indigo-600' : 'text-slate-400'}`}>结算 SETTLE {activeTab === 'settlement' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>
        {isAdmin && <button onClick={() => setActiveTab('payroll')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'payroll' ? 'text-indigo-600' : 'text-slate-400'}`}>工资单 PAYROLL {activeTab === 'payroll' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
        {isAdmin && <button onClick={() => setActiveTab('team')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'team' ? 'text-indigo-600' : 'text-slate-400'}`}>车队 FLEET {activeTab === 'team' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
        {isAdmin && <button onClick={() => setActiveTab('tracking')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'tracking' ? 'text-indigo-600' : 'text-slate-400'}`}>追踪 TRACKING {activeTab === 'tracking' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
        {isAdmin && <button onClick={() => setActiveTab('ai-logs')} className={`pb-2 text-[11px] font-black uppercase relative transition-all whitespace-nowrap ${activeTab === 'ai-logs' ? 'text-indigo-600' : 'text-slate-400'}`}>审计 AI LOGS {activeTab === 'ai-logs' && <div className="absolute bottom-[-9px] left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}</button>}
      </div>

      {activeTab === 'overview' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           <SystemStatus />
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 text-white p-6 rounded-[32px]">
                 <p className="text-[10px] font-black uppercase opacity-50">今日营收</p>
                 <p className="text-2xl font-black">TZS {bossStats.todayRev.toLocaleString()}</p>
              </div>
              <div className="bg-white p-6 rounded-[32px] border border-slate-200">
                 <p className="text-[10px] font-black uppercase text-slate-400">异常点位</p>
                 <p className="text-2xl font-black text-rose-600">{bossStats.stagnantMachines.length}</p>
              </div>
              <div className="bg-white p-6 rounded-[32px] border border-slate-200">
                 <p className="text-[10px] font-black uppercase text-slate-400">高风险欠款</p>
                 <p className="text-2xl font-black text-amber-600">{bossStats.riskyDrivers.length}</p>
              </div>
           </div>
           <SmartInsights transactions={transactions} locations={locations} />
        </div>
      )}

      {activeTab === 'tracking' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           <div className="flex justify-between items-center bg-white p-6 rounded-[32px] border border-slate-200">
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">车队实时地图追踪</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                   <Radio size={12} className="text-indigo-600 animate-pulse" /> Live Fleet Telemetry
                </p>
              </div>
              <div className="flex items-center gap-2">
                 <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-200">
                    <span className="w-2 h-2 bg-indigo-600 rounded-full animate-ping"></span>
                    <span className="text-[10px] font-black uppercase">Realtime</span>
                 </div>
              </div>
           </div>
           <LiveMap drivers={drivers} locations={locations} transactions={transactions} />
        </div>
      )}

      {activeTab === 'locations' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-[28px] border border-slate-200 shadow-sm">
              <div className="relative flex-1 w-full md:w-64">
                 <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                 <input type="text" placeholder="搜索点位 Search..." value={siteSearch} onChange={e => setSiteSearch(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-11 pr-4 text-xs font-bold" />
              </div>
              <select value={siteFilterArea} onChange={e => setSiteFilterArea(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-xs font-black uppercase outline-none">
                 <option value="all">所有区域 ALL AREAS</option>
                 {allAreas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
           </div>
           <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                   <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                         <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase">Machine / Name</th>
                         <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase">Status</th>
                         <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase text-right">Last Score</th>
                         <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase text-right">Commission</th>
                         <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase text-right">Actions</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {managedLocations.map(loc => (
                         <tr key={loc.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                               <p className="text-xs font-black text-slate-900">{loc.name}</p>
                               <p className="text-[8px] font-bold text-slate-400 uppercase">{loc.machineId} • {loc.area}</p>
                            </td>
                            <td className="px-6 py-4">
                               <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${loc.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{loc.status}</span>
                            </td>
                            <td className="px-6 py-4 text-right text-xs font-bold">{loc.lastScore.toLocaleString()}</td>
                            <td className="px-6 py-4 text-right text-xs font-bold text-indigo-600">{(loc.commissionRate * 100).toFixed(0)}%</td>
                            <td className="px-6 py-4 text-right">
                               <button onClick={() => handleEditLocation(loc)} className="p-2 text-slate-400 hover:text-indigo-600"><Pencil size={14} /></button>
                            </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'payroll' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           <div className="bg-white p-6 rounded-[32px] border border-slate-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase">电子工资单</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Compensation Reports</p>
              </div>
              <button onClick={() => setActiveTab('team')} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-2"><SlidersHorizontal size={14}/> 修改参数</button>
           </div>
           <div className="grid grid-cols-1 gap-4">
              {payrollStats.map(({ driver, monthlyBreakdown }) => (
                <div key={driver.id} className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
                   <h3 className="font-black text-slate-900 uppercase mb-4">{driver.name}</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {monthlyBreakdown.map((m, i) => (
                        <div key={i} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                           <div className="flex justify-between mb-2"><span className="text-[10px] font-black text-slate-400 uppercase">{m.month}</span><span className="text-xs font-black text-indigo-600">TZS {m.netPayout.toLocaleString()}</span></div>
                           <div className="flex gap-2">
                              <button onClick={() => window.print()} className="flex-1 py-2 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase">PDF</button>
                              <button onClick={() => {
                                const msg = `*PAYROLL ${m.month}*\nDriver: ${driver.name}\nNet: TZS ${m.netPayout.toLocaleString()}`;
                                window.open(`https://wa.me/${driver.phone?.replace(/\+/g,'')}?text=${encodeURIComponent(msg)}`);
                              }} className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-[9px] font-black uppercase">WhatsApp</button>
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}

      {activeTab === 'team' && isAdmin && <DriverManagement drivers={drivers} transactions={transactions} onUpdateDrivers={onUpdateDrivers} />}
      
      {activeTab === 'settlement' && (
        <div className="space-y-6 animate-in slide-in-from-right-4">
           {isAdmin ? (
             // 管理员视图：审核司机的结算申请
             <div className="space-y-4">
                <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex justify-between items-center">
                   <div>
                     <h3 className="text-lg font-black text-slate-900 uppercase">结算审批中心</h3>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pending Reviews ({pendingSettlements.length})</p>
                   </div>
                   <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><Calculator size={20} /></div>
                </div>
                
                {pendingSettlements.length === 0 ? (
                  <div className="py-20 text-center bg-white rounded-[40px] border border-dashed border-slate-200">
                     <CheckCircle2 size={40} className="mx-auto text-emerald-200 mb-3" />
                     <p className="text-xs font-black text-slate-400 uppercase tracking-widest">所有结算已处理完毕</p>
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
                             <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-[8px] font-black uppercase">待审核</div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mb-4">
                             <div className="bg-slate-50 p-3 rounded-xl">
                                <p className="text-[8px] font-black text-slate-400 uppercase">理论应收</p>
                                <p className="text-xs font-black text-slate-900">TZS {s.expectedTotal.toLocaleString()}</p>
                             </div>
                             <div className="bg-slate-50 p-3 rounded-xl">
                                <p className="text-[8px] font-black text-slate-400 uppercase">实际提交</p>
                                <p className="text-xs font-black text-indigo-600">TZS {(s.actualCash + s.actualCoins).toLocaleString()}</p>
                             </div>
                          </div>
                          {s.shortage !== 0 && (
                             <div className={`p-3 rounded-xl mb-4 flex items-center justify-between ${s.shortage < 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                <span className="text-[9px] font-black uppercase">{s.shortage < 0 ? '短款 (Shortage)' : '长款 (Surplus)'}</span>
                                <span className="text-xs font-black">TZS {Math.abs(s.shortage).toLocaleString()}</span>
                             </div>
                          )}
                          <div className="flex gap-2">
                             <button onClick={() => onSaveSettlement({...s, status: 'confirmed'})} className="flex-1 py-3 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-emerald-100">准予入库</button>
                             <button onClick={() => onSaveSettlement({...s, status: 'rejected'})} className="flex-1 py-3 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-black uppercase">驳回修改</button>
                          </div>
                       </div>
                     ))}
                  </div>
                )}
             </div>
           ) : (
             // 司机视图：发起每日结算流程
             <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-2xl space-y-8 animate-in zoom-in-95">
                <div className="text-center">
                   <div className="w-16 h-16 bg-indigo-600 rounded-[24px] flex items-center justify-center text-white mx-auto mb-4 shadow-xl shadow-indigo-100">
                      <Banknote size={32} />
                   </div>
                   <h2 className="text-xl font-black text-slate-900 uppercase">{t.dailySettlement}</h2>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Daily Reconciliation Flow</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-slate-50 p-5 rounded-[28px] border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">{t.revenue}</p>
                      <p className="text-lg font-black text-slate-900">TZS {myTransactions.reduce((sum, t) => sum + t.revenue, 0).toLocaleString()}</p>
                   </div>
                   <div className="bg-indigo-50 p-5 rounded-[28px] border border-indigo-100">
                      <p className="text-[9px] font-black text-indigo-400 uppercase mb-1 tracking-widest">{t.cashInHand}</p>
                      <p className="text-lg font-black text-indigo-600">TZS {myTransactions.reduce((sum, t) => sum + t.netPayable, 0).toLocaleString()}</p>
                   </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-50">
                   <div className="bg-slate-50 p-6 rounded-[35px] border border-slate-200">
                      <label className="text-[10px] font-black text-slate-400 uppercase block mb-4 tracking-widest text-center">{t.inputCash} (Note)</label>
                      <input 
                        type="number" 
                        value={actualCash} 
                        onChange={e => setActualCash(e.target.value)} 
                        className="w-full text-4xl font-black bg-transparent text-center outline-none text-slate-900 placeholder:text-slate-200" 
                        placeholder="0" 
                      />
                   </div>
                   <div className="bg-slate-50 p-6 rounded-[35px] border border-slate-200">
                      <label className="text-[10px] font-black text-slate-400 uppercase block mb-4 tracking-widest text-center">{t.inputCoins} (Coin)</label>
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
                  <div className={`p-6 rounded-[35px] flex justify-between items-center animate-in slide-in-from-top-4 ${parseInt(actualCash) + parseInt(actualCoins) === myTransactions.reduce((sum, t) => sum + t.netPayable, 0) ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                     <div>
                        <p className="text-[10px] font-black uppercase opacity-60">差额差异 (Variance)</p>
                        <p className="text-xl font-black">TZS {(parseInt(actualCash) + parseInt(actualCoins) - myTransactions.reduce((sum, t) => sum + t.netPayable, 0)).toLocaleString()}</p>
                     </div>
                     <div className="p-3 bg-white/20 rounded-2xl">
                        {parseInt(actualCash) + parseInt(actualCoins) === myTransactions.reduce((sum, t) => sum + t.netPayable, 0) ? <ThumbsUp size={24}/> : <AlertTriangle size={24}/>}
                     </div>
                  </div>
                )}

                <button 
                  disabled={!actualCash || !actualCoins}
                  onClick={() => {
                     const totalNet = myTransactions.reduce((sum, t) => sum + t.netPayable, 0);
                     const actual = (parseInt(actualCash) || 0) + (parseInt(actualCoins) || 0);
                     const settlement: DailySettlement = {
                        id: `STL-${Date.now()}`,
                        date: new Date().toISOString().split('T')[0],
                        driverId: currentUser.id,
                        driverName: currentUser.name,
                        totalRevenue: myTransactions.reduce((sum, t) => sum + t.revenue, 0),
                        totalNetPayable: totalNet,
                        totalExpenses: myTransactions.reduce((sum, t) => sum + t.expenses, 0),
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
                     alert('结算请求已提交，请等待审批！');
                     setActualCash('');
                     setActualCoins('');
                  }}
                  className="w-full py-6 bg-slate-900 text-white rounded-[32px] font-black uppercase text-sm shadow-2xl active:scale-95 transition-all disabled:opacity-30"
                >
                   确认并提交结算 (SUBMIT)
                </button>
             </div>
           )}
        </div>
      )}

      {activeTab === 'ai-logs' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
              <button onClick={() => setAiLogViewMode('list')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${aiLogViewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>列表</button>
              <button onClick={() => setAiLogViewMode('grid')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${aiLogViewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>网格</button>
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
