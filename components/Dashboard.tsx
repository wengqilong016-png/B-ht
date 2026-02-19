

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Coins, MapPin, Radio, Search, ExternalLink, Map as MapIcon, Truck, Wallet, Calculator, AlertTriangle, CheckCircle2, Banknote, Plus, X, Save, User, Key, Phone, Pencil, Clock, Loader2, CalendarRange, Calendar, FileText, ChevronRight, Receipt, Fuel, Wrench, Gavel, MoreHorizontal, AlertCircle, Building2, HandCoins, Camera, Info, Share2, Printer, Navigation, Download, ShieldCheck, Percent, LayoutList, TrendingUp, TrendingDown, Target, BellRing, Layers, Settings, BrainCircuit, Store, Signal, Smartphone, ThumbsUp, ThumbsDown, ArrowUpDown, ArrowUp, ArrowDown, Link, FileClock, ImagePlus, Trash2, Send, ArrowRight, ImageIcon, Eye, Sparkles } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'ai-logs'>(isAdmin ? 'overview' : 'settlement');
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [selectedDriverFilter, setSelectedDriverFilter] = useState<string | null>(null);

  const [actualCash, setActualCash] = useState<string>('');
  const [actualCoins, setActualCoins] = useState<string>('');
  const [settlementProof, setSettlementProof] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastSettlement, setLastSettlement] = useState<DailySettlement | null>(null);
  const [showAssetMap, setShowAssetMap] = useState(false);
  
  const [reviewingSettlement, setReviewingSettlement] = useState<DailySettlement | null>(null);
  const settlementFileInputRef = useRef<HTMLInputElement>(null);

  const [mapMode, setMapMode] = useState<'live' | 'strategy'>('live');
  const [customMapUrl, setCustomMapUrl] = useState('');
  const [isSettingMap, setIsSettingMap] = useState(false);

  const [editingLoc, setEditingLoc] = useState<Location | null>(null);
  const [locEditForm, setLocEditForm] = useState({ name: '', commissionRate: '', lastScore: '', status: 'active' as Location['status'] });

  // --- Sites Management State ---
  const [siteSearch, setSiteSearch] = useState('');
  const [siteFilterStatus, setSiteFilterStatus] = useState<'all' | 'active' | 'maintenance' | 'broken'>('all');
  const [siteFilterArea, setSiteFilterArea] = useState<string>('all');
  const [siteSort, setSiteSort] = useState<{ key: 'name' | 'status' | 'lastScore' | 'commission'; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

  // AI Logs Filtering & Viewing
  const [aiLogSearch, setAiLogSearch] = useState('');
  const [aiLogTypeFilter, setAiLogTypeFilter] = useState<'all' | 'image' | 'text'>('all');
  const [viewingLog, setViewingLog] = useState<AILog | null>(null);

  useEffect(() => {
    const savedUrl = localStorage.getItem('kiosk_custom_map_url');
    if (savedUrl) setCustomMapUrl(savedUrl);
  }, []);
  
  useEffect(() => {
    if (!isAdmin) setActiveTab('settlement');
  }, [isAdmin]);

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
  
  const pendingExpenses = useMemo(() => {
    return transactions.filter(tx => tx.expenses > 0 && tx.expenseStatus === 'pending');
  }, [transactions]);
  
  const pendingSettlements = useMemo(() => {
      return dailySettlements.filter(s => s.status === 'pending');
  }, [dailySettlements]);

  // --- Sites Logic (Filtered & Sorted) ---
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
          valA = a.name.toLowerCase(); 
          valB = b.name.toLowerCase();
          break;
        case 'status':
          // Weight: Active (1) -> Maintenance (2) -> Broken (3)
          const statusWeight = { active: 1, maintenance: 2, broken: 3 };
          valA = statusWeight[a.status] || 99;
          valB = statusWeight[b.status] || 99;
          break;
        case 'lastScore':
          valA = a.lastScore; 
          valB = b.lastScore;
          break;
        case 'commission':
          valA = a.commissionRate; 
          valB = b.commissionRate;
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
    let result = aiLogs;
    if (aiLogSearch) {
        const q = aiLogSearch.toLowerCase();
        result = result.filter(log => 
          log.driverName.toLowerCase().includes(q) || 
          log.query.toLowerCase().includes(q) || 
          log.response.toLowerCase().includes(q) ||
          log.modelUsed.toLowerCase().includes(q)
        );
    }
    if (aiLogTypeFilter === 'image') {
        result = result.filter(log => !!log.imageUrl);
    } else if (aiLogTypeFilter === 'text') {
        result = result.filter(log => !log.imageUrl);
    }
    return result;
  }, [aiLogs, aiLogSearch, aiLogTypeFilter]);

  const toggleSort = (key: 'name' | 'status' | 'lastScore' | 'commission') => {
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

  const bossStats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

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

    const riskyDrivers = drivers.filter(d => d.remainingDebt > 100000);

    const todayRev = transactions.filter(t => t.timestamp.startsWith(todayStr)).reduce((sum, t) => sum + t.revenue, 0);
    const yesterdayRev = transactions.filter(t => t.timestamp.startsWith(yesterdayStr)).reduce((sum, t) => sum + t.revenue, 0);
    const trend = yesterdayRev === 0 ? 100 : ((todayRev - yesterdayRev) / yesterdayRev) * 100;

    return { stagnantMachines, riskyDrivers, todayRev, trend };
  }, [locations, transactions, drivers]);

  const dailyStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todaysCollections = myTransactions.filter(t => t.timestamp.startsWith(today) && t.type !== 'expense');
    
    const totalRev = todaysCollections.reduce((acc, tx) => acc + tx.revenue, 0);
    const totalPublicExp = myTransactions
      .filter(t => t.timestamp.startsWith(today) && t.expenses > 0 && t.expenseType === 'public')
      .reduce((acc, tx) => acc + tx.expenses, 0);
      
    const totalNetPayable = todaysCollections.reduce((acc, tx) => acc + tx.netPayable, 0);
    const float = isAdmin ? drivers.reduce((sum, d) => sum + (d.status === 'active' ? d.dailyFloatingCoins : 0), 0) : (myProfile?.dailyFloatingCoins || 0);
    const expectedTotal = totalNetPayable + float;
    
    const todaySettlement = dailySettlements.find(s => 
        s.date === today && 
        (isAdmin ? true : s.driverId === currentUser.id)
    );

    return { totalRev, totalPublicExp, totalNetPayable, expectedTotal, float, todaysTx: todaysCollections, isSettled: !!todaySettlement && todaySettlement.status === 'confirmed', todaySettlement };
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

  const handleSettlementProofCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const scale = Math.min(1, MAX_WIDTH / img.width);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          setSettlementProof(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDriverSubmitSettlement = async () => {
    if (offlineCount > 0) {
        if (!confirm(lang === 'zh' ? '检测到未同步记录，是否立即同步并结账？' : 'Kazi hazijatunwa Cloud bado, tuma sasa?')) return;
        await onSync();
    }
    
    const settlementData: DailySettlement = {
        id: `S-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        driverId: currentUser.id,
        driverName: currentUser.name,
        
        totalRevenue: dailyStats.totalRev, 
        totalNetPayable: dailyStats.totalNetPayable, 
        totalExpenses: dailyStats.totalPublicExp,
        driverFloat: dailyStats.float, 
        expectedTotal: dailyStats.expectedTotal,
        
        actualCash: parseInt(actualCash) || 0, 
        actualCoins: parseInt(actualCoins) || 0,
        shortage: shortage, 
        transferProofUrl: settlementProof || undefined,
        timestamp: new Date().toISOString(),
        status: 'pending' 
    };
    
    onSaveSettlement(settlementData);
    setLastSettlement(settlementData);
    setShowSuccessModal(true);
    setActualCash(''); setActualCoins(''); setSettlementProof(null);
  };

  const handleAdminConfirmSettlement = () => {
    if (!reviewingSettlement) return;
    const updated: DailySettlement = {
        ...reviewingSettlement,
        adminId: currentUser.id,
        adminName: currentUser.name,
        status: 'confirmed', 
        actualCash: parseInt(actualCash) || reviewingSettlement.actualCash,
        actualCoins: parseInt(actualCoins) || reviewingSettlement.actualCoins,
        shortage: shortage 
    };
    onSaveSettlement(updated);
    setLastSettlement(updated);
    setShowSuccessModal(true);
    setReviewingSettlement(null);
    setActualCash(''); setActualCoins(''); setSettlementProof(null);
  };

  const selectSettlementForReview = (s: DailySettlement) => {
    setReviewingSettlement(s);
    setActualCash(s.actualCash.toString());
    setActualCoins(s.actualCoins.toString());
    setSettlementProof(s.transferProofUrl || null);
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
    onUpdateTransaction(tx.id, { expenseStatus: action === 'approve' ? 'approved' : 'rejected' });
    const driver = drivers.find(d => d.id === tx.driverId);
    if (!driver) return;

    let debtAdjustment = 0;
    if (action === 'approve') {
       if (tx.expenseType === 'private') {
         debtAdjustment = tx.expenses;
       }
    } else {
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
      {/* ... (Tabs and other sections remain unchanged, focusing on AI Logs Tab update below) ... */}
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
           <SystemStatus />
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
                    <AlertCircle size={14} className="inline mr-1" /> 异常静默机器 (&gt;7 Days)
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
           {/* Quick Actions and Recent Activity... (Existing) */}
           <div className="flex items-center gap-3 overflow-x-auto pb-2">
              <button onClick={() => setShowAssetMap(true)} className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200 active:scale-95 transition-all whitespace-nowrap"><MapIcon size={16} /><span className="text-xs font-black uppercase">全网资产地图 (Map)</span></button>
              <button onClick={() => onNavigate && onNavigate('history')} className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl shadow-sm hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all whitespace-nowrap"><FileClock size={16} className="text-emerald-500" /><span className="text-xs font-black uppercase">打卡记录管理 (Check-in History)</span></button>
              <div className="h-8 w-px bg-slate-200 mx-2"></div>
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-3 flex-1 min-w-[200px] shadow-sm">
                 <Search size={16} className="text-slate-400" /><input type="text" placeholder="搜索点位 Search..." value={mapSearchQuery} onChange={e => setMapSearchQuery(e.target.value)} className="bg-transparent text-xs font-bold text-slate-900 outline-none w-full" />
              </div>
           </div>
           <SmartInsights transactions={transactions} locations={locations} />
           <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mt-4">
              <div className="flex items-center gap-3"><div className="p-2.5 bg-slate-100 rounded-2xl text-slate-600"><LayoutList size={20} /></div><div><h3 className="text-xl font-black text-slate-900 leading-tight">最近活跃点位 RECENT ACTIVITY</h3><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Sites: {filteredLocations.length}</p></div></div>
           </div>
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredLocations.slice(0, 8).map(loc => (
                <div key={loc.id} className="bg-white p-5 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                  <div className="flex justify-between items-start mb-4"><div className="flex flex-col"><span className="text-[10px] font-black text-indigo-500 uppercase">{loc.machineId}</span><h4 className="font-black text-slate-900 text-sm leading-tight line-clamp-1">{loc.name}</h4><div className="flex items-center gap-1.5 mt-1"><span className="text-[9px] font-bold text-slate-400 uppercase">{loc.area}</span><span className="w-1 h-1 bg-slate-200 rounded-full"></span><span className="text-[9px] font-black text-indigo-600">分红: {(loc.commissionRate * 100).toFixed(0)}%</span></div></div><div className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${loc.status === 'active' ? 'bg-emerald-50 text-white' : 'bg-amber-500 text-white'}`}>{loc.status === 'active' ? '在线 ON' : '故障 FIX'}</div></div>
                  <div className="grid grid-cols-2 gap-2 mb-4"><div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase">当前读数 SCORE</p><p className="text-xs font-black text-slate-900">{loc.lastScore.toLocaleString()}</p></div><div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase">点位分红 RATE</p><p className="text-xs font-black text-indigo-600">{(loc.commissionRate * 100).toFixed(0)}%</p></div></div>
                  <div className="flex gap-2"><button onClick={() => loc.coords && window.open(`https://www.google.com/maps/dir/?api=1&destination=${loc.coords.lat},${loc.coords.lng}`, '_blank')} className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1.5 active:scale-95 shadow-md"><Navigation size={12} /> 导航</button><button onClick={() => handleEditLocation(loc)} className="p-3 bg-slate-100 text-slate-400 rounded-xl hover:text-indigo-600 hover:bg-indigo-50 transition-colors"><Pencil size={14} /></button></div>
                </div>
              ))}
           </div>
        </div>
      )}

      {/* Locations Tab (Enhanced with Sorting) */}
      {activeTab === 'locations' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           {/* Summary Cards */}
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between"><div className="flex items-center gap-3 text-slate-400 mb-2"><Store size={18} /><span className="text-[9px] font-black uppercase tracking-widest">总机器数 Total</span></div><p className="text-3xl font-black text-slate-900">{siteStats.total}</p></div>
              <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between"><div className="flex items-center gap-3 text-emerald-500 mb-2"><Signal size={18} /><span className="text-[9px] font-black uppercase tracking-widest">在线 Active</span></div><div className="flex items-baseline gap-2"><p className="text-3xl font-black text-emerald-600">{siteStats.active}</p><span className="text-[10px] font-bold text-emerald-400">{siteStats.activeRate.toFixed(0)}% Rate</span></div></div>
              <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between"><div className="flex items-center gap-3 text-amber-500 mb-2"><Wrench size={18} /><span className="text-[9px] font-black uppercase tracking-widest">维护 Maintenance</span></div><p className="text-3xl font-black text-amber-600">{siteStats.maintenance}</p></div>
              <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between"><div className="flex items-center gap-3 text-rose-500 mb-2"><AlertTriangle size={18} /><span className="text-[9px] font-black uppercase tracking-widest">故障 Broken</span></div><p className="text-3xl font-black text-rose-600">{siteStats.broken}</p></div>
           </div>
           {/* Filter Toolbar */}
           <div className="bg-white p-4 rounded-[28px] border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-4 w-full md:w-auto"><div className="relative flex-1 md:w-64"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" placeholder="Search Name, ID, Area..." value={siteSearch} onChange={e => setSiteSearch(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 transition-all"/></div><div className="h-8 w-px bg-slate-200 hidden md:block"></div><div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto">{(['all', 'active', 'maintenance', 'broken'] as const).map(s => (<button key={s} onClick={() => setSiteFilterStatus(s)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap ${siteFilterStatus === s ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>{s}</button>))}</div></div>
              <div className="flex items-center gap-2 w-full md:w-auto"><MapPin size={16} className="text-slate-400" /><select value={siteFilterArea} onChange={e => setSiteFilterArea(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-xs font-black text-slate-700 outline-none min-w-[140px]"><option value="all">ALL AREAS</option>{allAreas.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
           </div>
           {/* Detailed Table */}
           <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                 <thead className="bg-slate-50 border-b border-slate-100 select-none">
                   <tr>
                     <th onClick={() => toggleSort('name')} className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase cursor-pointer hover:text-indigo-500 transition-colors group">Machine / Name <SortIcon column="name" /></th>
                     <th className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase">Driver / Contact</th>
                     <th onClick={() => toggleSort('status')} className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase cursor-pointer hover:text-indigo-500 transition-colors group">Status <SortIcon column="status" /></th>
                     <th onClick={() => toggleSort('lastScore')} className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase text-right cursor-pointer hover:text-indigo-500 transition-colors group">Last Score <SortIcon column="lastScore" /></th>
                     <th onClick={() => toggleSort('commission')} className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase text-right cursor-pointer hover:text-indigo-500 transition-colors group">Commission <SortIcon column="commission" /></th>
                     <th className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">{managedLocations.map(loc => { const driver = drivers.find(d => d.id === loc.assignedDriverId); return (<tr key={loc.id} className="hover:bg-slate-50/80 transition-colors group"><td className="px-6 py-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 uppercase">{loc.machineId.slice(-3)}</div><div><p className="text-xs font-black text-slate-900">{loc.name}</p><div className="flex items-center gap-1.5 mt-0.5"><span className="px-1.5 py-0.5 rounded bg-slate-100 text-[8px] font-bold text-slate-500 uppercase">{loc.machineId}</span><span className="text-[8px] font-bold text-slate-400 uppercase">{loc.area}</span></div></div></div></td><td className="px-6 py-4"><div className="flex items-center gap-2">{driver ? (<><div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[9px] font-black text-indigo-600">{driver.name.charAt(0)}</div><div><p className="text-[10px] font-bold text-slate-700">{driver.name}</p><p className="text-[8px] text-slate-400">{loc.shopOwnerPhone || 'No Phone'}</p></div></>) : (<span className="text-[10px] text-slate-400 italic">Unassigned</span>)}</div></td><td className="px-6 py-4"><span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${loc.status === 'active' ? 'bg-emerald-50 text-emerald-600' : loc.status === 'maintenance' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>{loc.status}</span></td><td className="px-6 py-4 text-right"><p className="text-xs font-black text-slate-900">{loc.lastScore.toLocaleString()}</p></td><td className="px-6 py-4 text-right"><p className="text-xs font-black text-indigo-600">{(loc.commissionRate * 100).toFixed(0)}%</p></td><td className="px-6 py-4 text-right"><div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => loc.coords && window.open(`https://www.google.com/maps/dir/?api=1&destination=${loc.coords.lat},${loc.coords.lng}`, '_blank')} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200"><Navigation size={14}/></button><button onClick={() => handleEditLocation(loc)} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"><Pencil size={14}/></button></div></td></tr>); })}</tbody>
               </table>
               {managedLocations.length === 0 && <div className="p-12 text-center text-slate-400"><Store size={48} className="mx-auto mb-4 opacity-20" /><p className="text-xs font-black uppercase tracking-widest">暂无匹配点位数据</p></div>}
             </div>
           </div>
        </div>
      )}

      {/* Asset Map, Edit Modal, Settlement Modal... (Existing Code) */}
      {showAssetMap && (<div className="fixed inset-0 z-[60] bg-slate-900 flex flex-col animate-in fade-in"><div className="absolute top-6 left-6 right-6 z-20 flex justify-between items-start pointer-events-none"><button onClick={() => setShowAssetMap(false)} className="pointer-events-auto p-3 bg-white text-slate-900 rounded-full shadow-xl active:scale-90 transition-transform"><X size={20} /></button></div><div className="flex-1 relative bg-slate-800"><div className="absolute inset-0 flex items-center justify-center text-white">Map View</div></div></div>)}
      {editingLoc && (<div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in"><div className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95"><div className="bg-slate-900 p-8 text-white relative"><button onClick={() => setEditingLoc(null)} className="absolute top-6 right-6 p-2 bg-white/10 rounded-full"><X size={18} /></button><h3 className="text-xl font-black uppercase">配置修改 CONFIG</h3><p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{editingLoc.machineId} • {editingLoc.name}</p></div><div className="p-8 space-y-5"><div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">点位名称 SITE NAME</label><input type="text" value={locEditForm.name} onChange={e => setLocEditForm({...locEditForm, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none" /></div><div className="grid grid-cols-2 gap-4"><div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">分红比例 COMM%</label><div className="flex items-center bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3"><Percent size={14} className="text-indigo-400 mr-2" /><input type="number" value={locEditForm.commissionRate} onChange={e => setLocEditForm({...locEditForm, commissionRate: e.target.value})} className="bg-transparent w-full text-sm font-black text-indigo-600 outline-none" /></div></div><div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">当前读数 SCORE</label><input type="number" value={locEditForm.lastScore} onChange={e => setLocEditForm({...locEditForm, lastScore: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none" /></div></div><div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">运行状态 STATUS</label><div className="flex gap-2">{(['active', 'maintenance', 'broken'] as const).map(s => (<button key={s} onClick={() => setLocEditForm({...locEditForm, status: s})} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase border transition-all ${locEditForm.status === s ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`}>{s === 'active' ? '在线' : s === 'maintenance' ? '维护' : '报废'}</button>))}</div></div><button onClick={saveLocEdit} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 active:scale-95 transition-all"><Save size={16} /> 保存修改 SAVE</button></div></div></div>)}
      {activeTab === 'settlement' && (<div className="max-w-4xl mx-auto space-y-6">{isAdmin && pendingSettlements.length > 0 && (<div className="bg-white p-6 rounded-[32px] border-2 border-amber-200 shadow-lg animate-in slide-in-from-top-4"><div className="flex items-center gap-3 mb-4"><div className="p-2.5 bg-amber-100 text-amber-600 rounded-xl animate-pulse"><AlertCircle size={20} /></div><div><h3 className="text-base font-black text-slate-900 uppercase">待审核结算请求</h3><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Pending Driver Submissions</p></div></div><div className="space-y-3">{pendingSettlements.map(s => (<button key={s.id} onClick={() => selectSettlementForReview(s)} className="w-full text-left bg-amber-50 p-4 rounded-2xl border border-amber-100 flex justify-between items-center hover:bg-amber-100 transition-colors"><div><p className="text-xs font-black text-slate-900">{s.driverName || 'Driver'}</p><p className="text-[10px] font-bold text-amber-600 mt-1">Cash: TZS {s.actualCash.toLocaleString()}</p></div><div className="flex items-center gap-2 text-[10px] font-black uppercase text-amber-700">Review <ArrowRight size={12} /></div></button>))}</div></div>)}{dailyStats.isSettled && (<div className="bg-emerald-50 border border-emerald-100 p-5 rounded-[28px] flex items-center justify-between shadow-sm"><div className="flex items-center gap-4"><div className="p-3 bg-emerald-500 text-white rounded-2xl"><CheckCircle2 size={24} /></div><div><h3 className="text-base font-black text-emerald-900">今日已结账 KAMILI</h3><p className="text-[10px] text-emerald-600 font-bold uppercase">Hesabu ya Leo Imekamilika</p></div></div><button onClick={() => { setLastSettlement(dailyStats.todaySettlement || null); setShowSuccessModal(true); }} className="px-6 py-2.5 bg-white rounded-2xl text-[11px] font-black text-emerald-600 uppercase border border-emerald-200">查看回执</button></div>)}{(!dailyStats.isSettled || reviewingSettlement) && (<div className={`bg-white p-8 rounded-[48px] border border-slate-200 shadow-2xl space-y-8 ${dailyStats.isSettled && !reviewingSettlement ? 'opacity-80 grayscale-[0.2]' : ''}`}><div className="flex justify-between items-center"><div className="flex items-center gap-4"><div className="bg-indigo-600 p-4 rounded-[22px] text-white shadow-xl shadow-indigo-100"><Calculator size={28} /></div><div><h2 className="text-2xl font-black text-slate-900">{t.dailySettlement}</h2><p className="text-xs text-slate-400 font-bold uppercase">{new Date().toDateString()} • {reviewingSettlement ? `Reviewing: ${reviewingSettlement.driverName}` : myProfile?.name}</p></div></div>{reviewingSettlement && (<button onClick={() => setReviewingSettlement(null)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-black text-slate-500 hover:text-rose-500">Cancel Review</button>)}</div><div className="bg-slate-900 rounded-[40px] p-8 text-white grid grid-cols-1 md:grid-cols-2 gap-10"><div className="space-y-5"><div className="flex justify-between items-center text-slate-400"><span className="text-[11px] font-black uppercase">{t.totalNet}</span><span>TZS {(reviewingSettlement ? reviewingSettlement.totalNetPayable : dailyStats.totalNetPayable).toLocaleString()}</span></div><div className="flex justify-between items-center text-slate-400"><span className="text-[11px] font-black uppercase">Float (Sarafu)</span><span className="text-emerald-400">TZS {(reviewingSettlement ? reviewingSettlement.driverFloat : dailyStats.float).toLocaleString()}</span></div><div className="h-px bg-white/10"></div><div className="flex justify-between items-center"><span className="text-xs font-black uppercase text-indigo-400">{t.cashInHand}</span><span className="text-2xl font-black text-indigo-400">TZS {(reviewingSettlement ? reviewingSettlement.expectedTotal : dailyStats.expectedTotal).toLocaleString()}</span></div></div><div className="space-y-4"><input type="number" placeholder={t.inputCash} value={actualCash} onChange={e => setActualCash(e.target.value)} className="bg-black/40 border border-white/5 rounded-2xl py-4 px-4 text-white font-black text-lg w-full outline-none focus:border-indigo-500 transition-all" /><input type="number" placeholder={t.inputCoins} value={actualCoins} onChange={e => setActualCoins(e.target.value)} className="bg-black/40 border border-white/5 rounded-2xl py-4 px-4 text-white font-black text-lg w-full outline-none focus:border-indigo-500 transition-all" /><div><input type="file" accept="image/*" capture="environment" ref={settlementFileInputRef} onChange={handleSettlementProofCapture} className="hidden" />{settlementProof ? (<div className="relative h-40 rounded-2xl overflow-hidden border border-white/20 group bg-black/50"><img src={settlementProof} className="w-full h-full object-contain" alt="Proof" />{!reviewingSettlement && (<div className="absolute inset-0 flex items-center justify-center bg-black/40 gap-4 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => setSettlementProof(null)} className="p-3 bg-rose-500 rounded-full text-white hover:bg-rose-600 transition-colors"><Trash2 size={18} /></button></div>)}{reviewingSettlement && (<div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white text-[9px] font-bold rounded">Driver Upload</div>)}</div>) : (<button onClick={() => !reviewingSettlement && settlementFileInputRef.current?.click()} disabled={!!reviewingSettlement} className="w-full h-16 border border-dashed border-white/20 rounded-2xl flex items-center justify-center gap-2 text-slate-400 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"><ImagePlus size={20} /><span className="text-[10px] font-black uppercase">{lang === 'zh' ? '上传汇款/转账凭证' : 'Pakia Picha ya Malipo (Risiti)'}</span></button>)}</div></div></div><div className={`p-8 rounded-[40px] border-2 border-dashed ${shortage === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}><div className="flex items-center gap-6"><div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${shortage === 0 ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>{shortage === 0 ? <CheckCircle2 size={32} /> : <AlertTriangle size={32} />}</div><div><h4 className={`text-xl font-black uppercase ${shortage === 0 ? 'text-emerald-900' : 'text-rose-900'}`}>{shortage === 0 ? t.perfect : `${t.shortage}: TZS ${Math.abs(shortage).toLocaleString()}`}</h4></div></div></div>{reviewingSettlement ? (<div className="flex gap-4"><button onClick={handleAdminConfirmSettlement} className="flex-1 py-6 bg-indigo-600 text-white rounded-[28px] font-black uppercase text-sm shadow-2xl flex items-center justify-center gap-4 transition-all hover:bg-indigo-700 active:scale-95"><CheckCircle2 size={20} /> 确认收款并结账 CONFIRM</button></div>) : (<button onClick={handleDriverSubmitSettlement} disabled={isSyncing || dailyStats.isSettled || !actualCash || !settlementProof} className="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase text-sm shadow-2xl flex items-center justify-center gap-4 transition-all disabled:bg-slate-200 active:scale-95"><Send size={20} /> {dailyStats.todaySettlement?.status === 'pending' ? '等待管理员审核 PENDING APPROVAL' : '提交日结账单 SUBMIT CLOSING'}</button>)}</div>)}</div>)}
      
      {activeTab === 'arrears' && !isAdmin && (<div className="max-w-4xl mx-auto space-y-6"><div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex items-center justify-between"><div className="flex items-center gap-5"><div className="p-4 bg-rose-50 text-rose-600 rounded-[28px] border border-rose-100"><Wallet size={32} /></div><div><h2 className="text-2xl font-black text-slate-900">{t.arrears}</h2><p className="text-xs text-slate-400 font-bold uppercase">Madeni ya Kukabidhi</p></div></div><div className="text-right"><p className="text-[10px] font-black text-slate-400 uppercase mb-1">TOTAL DEBT</p><p className="text-3xl font-black text-rose-600">TZS {totalArrears.toLocaleString()}</p></div></div><div className="grid grid-cols-1 gap-4">{myArrears.map(tx => (<div key={tx.id} className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex justify-between items-center group transition-all"><div className="flex items-center gap-5"><div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 font-black border border-rose-100">{tx.locationName.charAt(0)}</div><div><h4 className="font-black text-slate-900 text-base">{tx.locationName}</h4><p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{new Date(tx.timestamp).toLocaleString()}</p></div></div><div className="text-right"><p className="text-[9px] font-black text-slate-400 uppercase">Kiasi 挂账</p><p className="text-lg font-black text-rose-600">TZS {tx.netPayable.toLocaleString()}</p></div></div>))}</div></div>)}
      {activeTab === 'team' && isAdmin && <DriverManagement drivers={drivers} transactions={transactions} onUpdateDrivers={onUpdateDrivers} />}

      {activeTab === 'ai-logs' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
           {/* Detailed Log Modal */}
           {viewingLog && (
             <div className="fixed inset-0 z-[70] bg-slate-900/90 backdrop-blur-lg flex items-center justify-center p-6 animate-in fade-in">
               <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                 <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-4">
                       <div className="p-2.5 bg-indigo-600 rounded-2xl text-white shadow-lg"><BrainCircuit size={20} /></div>
                       <div>
                          <h3 className="text-lg font-black text-slate-900 uppercase">AI 审计详情 AUDIT DETAIL</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{viewingLog.id} • {new Date(viewingLog.timestamp).toLocaleString()}</p>
                       </div>
                    </div>
                    <button onClick={() => setViewingLog(null)} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-rose-500 transition-colors"><X size={20} /></button>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase mb-3 tracking-widest flex items-center gap-2"><User size={12} /> 操作员 Operator</p>
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                             <p className="text-sm font-black text-slate-900">{viewingLog.driverName}</p>
                             <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">ID: {viewingLog.driverId}</p>
                          </div>
                          
                          <p className="text-[9px] font-black text-slate-400 uppercase mb-3 mt-6 tracking-widest flex items-center gap-2"><Search size={12} /> 审计指令 Query</p>
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                             <p className="text-sm font-bold text-slate-700 leading-relaxed">{viewingLog.query}</p>
                          </div>
                       </div>
                       
                       <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase mb-3 tracking-widest flex items-center gap-2"><Camera size={12} /> 现场图像 Evidence</p>
                          {viewingLog.imageUrl ? (
                            <div className="rounded-2xl overflow-hidden border-2 border-slate-200 shadow-md relative group bg-slate-100">
                               <img src={viewingLog.imageUrl} className="w-full h-auto object-cover" alt="Log Evidence" />
                               <a href={viewingLog.imageUrl} download={`log_evidence_${viewingLog.id}.jpg`} className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70">
                                  <Download size={16} />
                               </a>
                            </div>
                          ) : (
                            <div className="h-32 bg-slate-50 rounded-2xl border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs font-bold uppercase">
                               No Image Attached
                            </div>
                          )}
                       </div>
                    </div>

                    <div>
                       <p className="text-[9px] font-black text-indigo-500 uppercase mb-3 tracking-widest flex items-center gap-2"><Sparkles size={12} /> AI 分析报告 Analysis Result</p>
                       <div className="bg-slate-900 text-white p-6 rounded-[28px] shadow-xl border border-slate-800">
                          <div className="prose prose-invert prose-sm max-w-none">
                             <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300">{viewingLog.response}</pre>
                          </div>
                          <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
                             <span className="text-[9px] font-bold text-slate-500 uppercase">Model: {viewingLog.modelUsed}</span>
                             <div className="flex items-center gap-1.5 text-[9px] font-black text-emerald-400 uppercase"><CheckCircle2 size={12} /> Suggestion Archived</div>
                          </div>
                       </div>
                    </div>
                 </div>
               </div>
             </div>
           )}

           <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
               <div className="flex items-center gap-4">
                 <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><BrainCircuit size={24} /></div>
                 <div>
                   <h2 className="text-lg font-black text-slate-900 uppercase">AI 审计日志</h2>
                   <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">System Audit Trails & AI Interactions</p>
                 </div>
               </div>
               
               <div className="flex gap-4 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
                      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Search logs..." 
                        value={aiLogSearch}
                        onChange={(e) => setAiLogSearch(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 transition-all"
                      />
                  </div>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button onClick={() => setAiLogTypeFilter('all')} className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${aiLogTypeFilter === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>All</button>
                      <button onClick={() => setAiLogTypeFilter('image')} className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1 ${aiLogTypeFilter === 'image' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}><ImageIcon size={12}/> Img</button>
                      <button onClick={() => setAiLogTypeFilter('text')} className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1 ${aiLogTypeFilter === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}><FileText size={12}/> Txt</button>
                  </div>
               </div>
             </div>
           </div>

           <div className="space-y-4">
             {filteredAiLogs.length > 0 ? filteredAiLogs.map(log => {
               const linkedTx = log.relatedTransactionId ? transactions.find(t => t.id === log.relatedTransactionId) : null;
               
               return (
               <div key={log.id} className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm hover:border-indigo-200 transition-colors group">
                 <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-4">
                   <div className="flex items-center gap-3">
                     <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 font-black">{log.driverName.charAt(0)}</div>
                     <div>
                       <p className="text-xs font-black text-slate-900">{log.driverName}</p>
                       <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                         <Clock size={10} />
                         {new Date(log.timestamp).toLocaleString()}
                       </p>
                     </div>
                   </div>
                   <div className="flex flex-col items-end gap-1">
                      <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg uppercase">{log.modelUsed}</span>
                      {log.response.includes("[SYSTEM ERROR]") && <span className="text-[8px] font-black bg-rose-50 text-rose-600 px-1.5 rounded uppercase">Error</span>}
                   </div>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {log.imageUrl && (
                      <div className="h-32 md:h-auto rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 relative group cursor-pointer" onClick={() => setViewingLog(log)}>
                        <img src={log.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="Audit Evidence" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                           <Eye size={20} className="text-white" />
                        </div>
                      </div>
                    )}
                    <div className={`${log.imageUrl ? 'md:col-span-3' : 'md:col-span-4'} space-y-3`}>
                       {linkedTx && (
                         <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl flex items-center gap-3 w-fit">
                            <div className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg"><Link size={12} /></div>
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-700">
                               <span className="text-emerald-700 uppercase tracking-wider">Context:</span>
                               <span>{linkedTx.locationName}</span>
                               <span className="text-slate-300">•</span>
                               <span>TZS {linkedTx.netPayable.toLocaleString()}</span>
                            </div>
                         </div>
                       )}

                       <div className="flex flex-col gap-2">
                          <p className="text-[10px] font-bold text-slate-500 line-clamp-1"><span className="text-slate-400 uppercase tracking-widest mr-2">Query:</span>{log.query}</p>
                          <div className={`p-4 rounded-2xl border relative overflow-hidden ${log.response.includes("[SYSTEM ERROR]") ? 'bg-rose-50 border-rose-100 text-rose-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                             <p className="text-xs font-medium leading-relaxed line-clamp-3">
                               {log.response}
                             </p>
                             <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-50 to-transparent"></div>
                          </div>
                          <button 
                            onClick={() => setViewingLog(log)}
                            className="self-start px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-indigo-600 hover:bg-indigo-50 hover:border-indigo-100 transition-all shadow-sm flex items-center gap-2"
                          >
                            View Full Report <ArrowRight size={12} />
                          </button>
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
