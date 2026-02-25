
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Coins, MapPin, Radio, Search, ExternalLink, Map as MapIcon, Truck, Wallet, Calculator, AlertTriangle, CheckCircle2, Banknote, Plus, X, Save, User, Key, Phone, Pencil, Clock, Loader2, CalendarRange, Calendar, FileText, ChevronRight, Receipt, Fuel, Wrench, Gavel, MoreHorizontal, AlertCircle, Building2, HandCoins, Camera, Info, Share2, Printer, Navigation, Download, ShieldCheck, Percent, LayoutList, TrendingUp, TrendingDown, Target, BellRing, Layers, Settings, BrainCircuit, Store, Signal, Smartphone, ThumbsUp, ThumbsDown, ArrowUpDown, ArrowUp, ArrowDown, Link, FileClock, ImagePlus, Trash2, Send, ArrowRight, ImageIcon, Eye, Sparkles, SlidersHorizontal } from 'lucide-react';
import { Transaction, Driver, Location, CONSTANTS, User as UserType, DailySettlement, TRANSLATIONS, AILog } from '../types';
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

const Dashboard: React.FC<DashboardProps> = ({ transactions, drivers, locations, dailySettlements, aiLogs, currentUser, onUpdateDrivers, onUpdateLocations, onUpdateTransaction, onNewTransaction, onSaveSettlement, onSync, isSyncing, offlineCount, lang, onNavigate }) => {
  const t = TRANSLATIONS[lang];
  const isAdmin = currentUser.role === 'admin';
  const [activeTab, setActiveTab] = useState<'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'ai-logs' | 'tracking' | 'payroll'>(isAdmin ? 'overview' : 'settlement');
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
        <div className="space-y-6">
           {isAdmin && pendingSettlements.length > 0 && (
             <div className="bg-amber-50 p-6 rounded-[32px] border-2 border-amber-200">
                <h3 className="text-sm font-black text-amber-900 uppercase mb-4">待审核结算 ({pendingSettlements.length})</h3>
                <div className="space-y-2">
                   {pendingSettlements.map(s => (
                     <button key={s.id} onClick={() => selectSettlementForReview(s)} className="w-full bg-white p-4 rounded-2xl border border-amber-100 flex justify-between items-center">
                        <span className="text-xs font-black text-slate-900">{s.driverName}</span>
                        <span className="text-[10px] font-bold text-amber-600">TZS {s.actualCash.toLocaleString()} <ArrowRight size={12} className="inline ml-1"/></span>
                     </button>
                   ))}
                </div>
             </div>
           )}
           <div className="bg-white p-8 rounded-[40px] border border-slate-200 text-center">
              <Calculator size={48} className="mx-auto text-slate-200 mb-4" />
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">请在移动端执行每日结算操作</p>
           </div>
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
