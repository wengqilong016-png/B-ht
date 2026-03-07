
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Truck, User, Phone, Save, X, Plus,
  Pencil, Banknote, Wallet, 
  UserCog, AlertCircle, ShieldCheck,
  Percent, Loader2,
  Calculator, Receipt, TrendingUp, BarChart3, LayoutGrid, ArrowUpDown, ArrowUp, ArrowDown,
  Search, SlidersHorizontal, ChevronLeft, ChevronRight
} from 'lucide-react';
import { Driver, Transaction, DailySettlement } from '../types';

interface DriverManagementProps {
  drivers: Driver[];
  transactions: Transaction[];
  dailySettlements?: DailySettlement[];
  onUpdateDrivers: (drivers: Driver[]) => void;
}

const DriverManagement: React.FC<DriverManagementProps> = ({ drivers, transactions, dailySettlements = [], onUpdateDrivers }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'analytics'>('grid');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [salaryId, setSalaryId] = useState<string | null>(null);
  
  // --- List Management State ---
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'revenue' | 'debt' | 'status'>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = viewMode === 'grid' ? 9 : 12;

  // Form State
  const [form, setForm] = useState({
    name: '', username: '', phone: '',
    model: '', plate: '', dailyFloatingCoins: '10000', 
    initialDebt: '0', baseSalary: '300000', commissionRate: '5'
  });

  const resetForm = () => {
    setForm({
      name: '', username: '', phone: '',
      model: '', plate: '', dailyFloatingCoins: '10000', initialDebt: '0',
      baseSalary: '300000', commissionRate: '5'
    });
    setEditingId(null);
    setIsFormOpen(false);
  };

  const openEdit = (d: Driver) => {
    setForm({
      name: d.name || '',
      username: d.username || '',
      phone: d.phone || '',
      model: d.vehicleInfo?.model || '',
      plate: d.vehicleInfo?.plate || '',
      dailyFloatingCoins: (d.dailyFloatingCoins ?? 10000).toString(),
      initialDebt: (d.initialDebt ?? 0).toString(),
      baseSalary: (d.baseSalary ?? 300000).toString(),
      commissionRate: ((d.commissionRate ?? 0.05) * 100).toString()
    });
    setEditingId(d.id);
    setIsFormOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.username) {
      alert("请填写姓名和账号 (Name and ID are required)");
      return;
    }

    setIsSaving(true);
    setTimeout(() => {
        const parseNum = (str: string) => {
            const cleanStr = str.replace(/,/g, '').trim();
            const num = parseInt(cleanStr);
            return isNaN(num) ? 0 : num;
        };

        const parsedBaseSalary = parseNum(form.baseSalary);
        const parsedCommRate = parseFloat(form.commissionRate);

        const driverData = {
          name: form.name,
          username: form.username,
          phone: form.phone,
          dailyFloatingCoins: parseNum(form.dailyFloatingCoins),
          initialDebt: parseNum(form.initialDebt),
          vehicleInfo: { model: form.model, plate: form.plate },
          baseSalary: parsedBaseSalary === 0 ? 300000 : parsedBaseSalary,
          commissionRate: (isNaN(parsedCommRate) ? 5 : parsedCommRate) / 100
        };

        if (editingId) {
          onUpdateDrivers(drivers.map(d => d.id === editingId ? { ...d, ...driverData } : d));
        } else {
          const newDriver: Driver = {
            id: `D-${Date.now()}`,
            ...driverData,
            remainingDebt: driverData.initialDebt,
            status: 'active'
          };
          onUpdateDrivers([...drivers, newDriver]);
        }
        resetForm();
        setIsSaving(false);
    }, 600);
  };

  const toggleStatus = (id: string) => {
    if (confirm("Confirm status change?")) {
        onUpdateDrivers(drivers.map(d => d.id === id ? { ...d, status: d.status === 'active' ? 'inactive' : 'active' } : d));
    }
  };

  const calculateSalary = (id: string) => {
    const driver = drivers.find(d => d.id === id);
    if (!driver) return null;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const currentMonthTxs = transactions.filter(t => {
      const txDate = new Date(t.timestamp);
      return t.driverId === id && 
             txDate.getMonth() === currentMonth && 
             txDate.getFullYear() === currentYear;
    });

    const revenue = currentMonthTxs.reduce((sum, t) => sum + t.revenue, 0);
    const expenses = currentMonthTxs.reduce((sum, t) => sum + t.expenses, 0);
    const base = driver.baseSalary ?? 300000;
    const rate = driver.commissionRate ?? 0.05;
    const comm = Math.floor(revenue * rate);
    const maxDeduction = Math.floor((base + comm) * 0.2);
    const debt = Math.min(driver.remainingDebt, maxDeduction);
    
    return { 
      driver, revenue, expenses, base, comm, debt, rate, 
      txCount: currentMonthTxs.length,
      month: now.toLocaleString('zh-CN', { month: 'long' }),
      total: base + comm - debt 
    };
  };

  // --- 1. Enrich Data Stats (Memoized) ---
  const driversWithStats = useMemo(() => {
    // Pre-group transactions by driverId to avoid O(n×m) filter per driver
    const txByDriver = new Map<string, Transaction[]>();
    transactions.forEach(t => {
      const arr = txByDriver.get(t.driverId);
      if (arr) arr.push(t);
      else txByDriver.set(t.driverId, [t]);
    });

    return drivers.map(d => {
      const dTx = txByDriver.get(d.id) ?? [];
      const totalRevenue = dTx.reduce((sum, t) => sum + t.revenue, 0);
      const totalNet = dTx.reduce((sum, t) => sum + t.netPayable, 0);
      const collectionRate = totalRevenue > 0 ? (totalNet / totalRevenue) * 100 : 0;
      
      return {
        ...d,
        stats: {
          totalRevenue,
          totalNet,
          collectionRate,
          txCount: dTx.length
        }
      };
    });
  }, [drivers, transactions]);

  // --- 2. Filter & Sort (Memoized) ---
  const processedDrivers = useMemo(() => {
    let result = [...driversWithStats];

    // Filter
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(d => 
        d.name.toLowerCase().includes(q) || 
        d.username.toLowerCase().includes(q) ||
        d.phone.includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      let valA: any, valB: any;
      
      switch (sortBy) {
        case 'name': valA = a.name; valB = b.name; break;
        case 'revenue': valA = a.stats.totalRevenue; valB = b.stats.totalRevenue; break;
        case 'debt': valA = a.remainingDebt; valB = b.remainingDebt; break;
        case 'status': valA = a.status; valB = b.status; break;
        default: valA = a.stats.totalRevenue; valB = b.stats.totalRevenue;
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [driversWithStats, searchTerm, sortBy, sortDir]);

  // --- 3. Fleet Aggregates (Based on Full List) ---
  const fleetStats = useMemo(() => {
    const totalRev = driversWithStats.reduce((sum, d) => sum + d.stats.totalRevenue, 0);
    const avgCollection = driversWithStats.length > 0 
        ? driversWithStats.reduce((sum, d) => sum + d.stats.collectionRate, 0) / driversWithStats.length 
        : 0;
    const totalDebt = driversWithStats.reduce((sum, d) => sum + d.remainingDebt, 0);
    return { totalRev, avgCollection, totalDebt };
  }, [driversWithStats]);

  // --- 4. Pagination ---
  const totalPages = Math.ceil(processedDrivers.length / ITEMS_PER_PAGE);
  const paginatedDrivers = processedDrivers.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Reset page on filter change
  useEffect(() => setPage(1), [searchTerm, sortBy, sortDir, viewMode]);

  const toggleSort = (key: typeof sortBy) => {
    if (sortBy === key) {
        setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
        setSortBy(key);
        setSortDir('desc'); // Default new sort to descending
    }
  };

  const SortIndicator = ({ column }: { column: typeof sortBy }) => {
    if (sortBy !== column) return <ArrowUpDown size={12} className="opacity-20 ml-1 inline" />;
    return sortDir === 'asc' 
        ? <ArrowUp size={12} className="text-indigo-600 ml-1 inline" /> 
        : <ArrowDown size={12} className="text-indigo-600 ml-1 inline" />;
  };

  const salaryData = salaryId ? calculateSalary(salaryId) : null;

  return (
    <div className="space-y-6 animate-in fade-in">
       {/* Salary Calculation Modal (Unchanged) */}
       {salaryId && salaryData && (
         <div className="fixed inset-0 z-[70] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl relative">
             <div className="bg-slate-900 p-6 text-white relative">
               <button onClick={() => setSalaryId(null)} className="absolute top-6 right-6 p-2 bg-white/10 rounded-full hover:bg-white/20"><X size={18} /></button>
               <div className="flex items-center gap-3 mb-2">
                 <div className="p-2 bg-indigo-500 rounded-xl"><Calculator size={20} /></div>
                 <h3 className="text-xl font-black uppercase">Monthly Payroll</h3>
               </div>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{salaryData.driver.name} • {salaryData.month} 周期</p>
             </div>
             
             <div className="p-6 space-y-6">
               <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 flex justify-between items-center">
                  <div>
                    <p className="text-[9px] font-black text-indigo-400 uppercase mb-1">当月营收统计</p>
                    <p className="text-xl font-black text-slate-900">TZS {salaryData.revenue.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-indigo-400 uppercase mb-1">巡检次数</p>
                    <p className="text-base font-black text-slate-700">{salaryData.txCount}</p>
                  </div>
               </div>

               <div className="space-y-3 px-1">
                  <div className="flex justify-between items-center">
                     <span className="text-xs font-black text-slate-500 uppercase">基本薪资 (Base)</span>
                     <span className="text-sm font-black text-slate-700">TZS {salaryData.base.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                     <span className="text-xs font-black text-slate-500 uppercase">绩效提成 ({(salaryData.rate*100).toFixed(0)}%)</span>
                     <span className="text-sm font-black text-emerald-600">+ TZS {salaryData.comm.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                     <span className="text-xs font-black text-slate-500 uppercase">欠款抵扣 (Deduction)</span>
                     <span className="text-sm font-black text-rose-500">- TZS {salaryData.debt.toLocaleString()}</span>
                  </div>
                  <div className="h-px bg-slate-100 my-2"></div>
                  <div className="flex justify-between items-center">
                     <span className="text-sm font-black text-slate-900 uppercase tracking-widest">实发工资 (Net)</span>
                     <span className="text-xl font-black text-indigo-600">TZS {salaryData.total.toLocaleString()}</span>
                  </div>
               </div>

               <div className="bg-slate-50 p-3 rounded-xl flex items-center gap-2">
                  <AlertCircle size={14} className="text-slate-400" />
                  <p className="text-[9px] font-bold text-slate-400 leading-tight">注：欠款抵扣已自动限制在总额的 20% 以内。</p>
               </div>

               <button onClick={() => setSalaryId(null)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs">确认并关闭</button>
             </div>
           </div>
         </div>
       )}

       {/* View Switcher Header & Toolbar */}
       <div className="space-y-4">
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
           <div>
             <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Fleet Management</h2>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Manage Drivers, Salaries, and Performance</p>
           </div>
           
           <div className="flex gap-2 flex-shrink-0">
              <div className="flex bg-slate-100 p-1 rounded-2xl">
                  <button 
                    onClick={() => setViewMode('grid')} 
                    className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all flex items-center gap-1.5 whitespace-nowrap ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                  >
                    <LayoutGrid size={12} /> Cards
                  </button>
                  <button 
                    onClick={() => setViewMode('analytics')} 
                    className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all flex items-center gap-1.5 whitespace-nowrap ${viewMode === 'analytics' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                  >
                    <BarChart3 size={12} /> Analytics
                  </button>
              </div>
              <button onClick={() => { resetForm(); setIsFormOpen(true); }} className="px-4 py-2 bg-indigo-600 text-white rounded-2xl text-[9px] font-black uppercase flex items-center gap-2 shadow-lg active:scale-95 transition-all whitespace-nowrap hover:bg-indigo-700">
                <Plus size={13} /> Add New Driver
              </button>
           </div>
         </div>

         {/* Filtering & Sorting Bar */}
         <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
               <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
               <input 
                 type="text" 
                 placeholder="Search Name / Phone..." 
                 value={searchTerm}
                 onChange={e => setSearchTerm(e.target.value)}
                 className="w-full bg-white border border-slate-200 rounded-[20px] py-3 pl-11 pr-4 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 transition-all shadow-sm"
               />
            </div>
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-[20px] px-4 py-2 shadow-sm min-w-[200px]">
               <SlidersHorizontal size={14} className="text-slate-400" />
               <span className="text-[10px] font-bold text-slate-400 uppercase mr-2">Sort By:</span>
               <select 
                 value={sortBy} 
                 onChange={(e) => { setSortBy(e.target.value as any); setSortDir('desc'); }}
                 className="bg-transparent text-xs font-black text-slate-900 outline-none flex-1 uppercase"
               >
                 <option value="revenue">总营收 Revenue</option>
                 <option value="debt">欠款 Debt</option>
                 <option value="name">姓名 Name</option>
                 <option value="status">状态 Status</option>
               </select>
               <button onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')} className="p-1 rounded hover:bg-slate-100 text-indigo-600">
                  {sortDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
               </button>
            </div>
         </div>
       </div>

       {/* Grid View - Redesigned cards matching screenshot */}
       {viewMode === 'grid' && (() => {
         const revenueMax = Math.max(...driversWithStats.map(d => d.stats.totalRevenue), 1);
         return (
         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 animate-in slide-in-from-bottom-2">
            {paginatedDrivers.map(driver => {
              const revProgress = Math.min(100, (driver.stats.totalRevenue / revenueMax) * 100);
              return (
              <div key={driver.id} className="bg-white rounded-[28px] border border-slate-200 shadow-sm hover:shadow-lg transition-all overflow-hidden">
                {/* Card Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-[14px] bg-slate-800 text-white flex items-center justify-center font-black text-base shadow-md">
                      {driver.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 text-sm uppercase tracking-wide">{driver.name}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${driver.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <span className={`text-[8px] font-black uppercase ${driver.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {driver.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleStatus(driver.id)}
                    className="p-1.5 bg-slate-50 rounded-xl border border-slate-100 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all"
                  >
                    <ShieldCheck size={14} />
                  </button>
                </div>

                {/* Salary & Commission */}
                <div className="grid grid-cols-2 gap-2.5 px-5 pb-4">
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                    <p className="text-[7px] font-black text-slate-400 uppercase flex items-center gap-1 mb-1">
                      <span className="text-indigo-400">$</span> Base Salary
                    </p>
                    <p className="text-xs font-black text-slate-900">TZS {(driver.baseSalary || 300000).toLocaleString()}</p>
                  </div>
                  <div className="bg-indigo-50 rounded-2xl p-3 border border-indigo-100">
                    <p className="text-[7px] font-black text-indigo-400 uppercase flex items-center gap-1 mb-1">
                      <Percent size={8} /> Commission
                    </p>
                    <p className="text-xs font-black text-indigo-700">{((driver.commissionRate ?? 0.05) * 100).toFixed(0)}%</p>
                  </div>
                </div>

                {/* Lifetime Revenue */}
                <div className="px-5 pb-4">
                  <div className="flex justify-between items-center mb-1.5">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Lifetime Revenue</p>
                    <p className="text-[10px] font-black text-slate-900">TZS {driver.stats.totalRevenue.toLocaleString()}</p>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${revProgress}%` }}
                    />
                  </div>
                </div>

                {/* Phone & Actions */}
                <div className="flex items-center justify-between px-5 pb-5 pt-1 border-t border-slate-50">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Phone size={10} />
                    <span className="text-[9px] font-bold">{driver.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSalaryId(driver.id)} className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-[8px] font-black uppercase hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all flex items-center gap-1">
                      <Calculator size={10} /> Payroll
                    </button>
                    <button onClick={() => openEdit(driver)} className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-[8px] font-black uppercase hover:bg-indigo-700 transition-all">
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            );})}
            {paginatedDrivers.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-400">
                    <p className="text-xs font-black uppercase">No Drivers Found</p>
                </div>
            )}
         </div>
         );
       })()}

       {/* Analytics View */}
       {viewMode === 'analytics' && (
         <div className="space-y-6 animate-in slide-in-from-right-2">
            {/* Top Cards (Using full fleetStats) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               <div className="bg-slate-900 text-white p-6 rounded-[28px] relative overflow-hidden">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Revenue (All Time)</p>
                  <p className="text-2xl font-black text-white">TZS {fleetStats.totalRev.toLocaleString()}</p>
                  <div className="absolute right-4 top-4 p-3 bg-white/10 rounded-full"><TrendingUp size={20} /></div>
               </div>
               <div className="bg-white p-6 rounded-[28px] border border-slate-200 relative overflow-hidden">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">平均收款效率 (Collection)</p>
                  <p className="text-2xl font-black text-indigo-600">{fleetStats.avgCollection.toFixed(1)}%</p>
                  <div className="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                     <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${fleetStats.avgCollection}%` }}></div>
                  </div>
               </div>
               <div className="bg-white p-6 rounded-[28px] border border-slate-200 relative overflow-hidden">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">总欠款风险 (Risk)</p>
                  <p className="text-2xl font-black text-rose-600">TZS {fleetStats.totalDebt.toLocaleString()}</p>
                  <div className="absolute right-4 top-4 p-3 bg-rose-50 text-rose-500 rounded-full"><AlertCircle size={20} /></div>
               </div>
            </div>

            {/* Detailed Table (Using paginatedDrivers) */}
            <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
               <div className="overflow-x-auto">
                  <table className="w-full text-left">
                     <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                           <th onClick={() => toggleSort('name')} className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase cursor-pointer hover:text-indigo-600 transition-colors">Driver <SortIndicator column="name" /></th>
                           <th onClick={() => toggleSort('revenue')} className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase cursor-pointer hover:text-indigo-600 transition-colors text-right">Revenue <SortIndicator column="revenue" /></th>
                           <th onClick={() => toggleSort('status')} className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase cursor-pointer hover:text-indigo-600 transition-colors text-right">Efficiency</th>
                           <th onClick={() => toggleSort('debt')} className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase cursor-pointer hover:text-indigo-600 transition-colors text-right">Debt <SortIndicator column="debt" /></th>
                           <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase text-center">Status</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-50">
                        {paginatedDrivers.map(d => (
                           <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                 <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-black text-slate-500">{d.name.charAt(0)}</div>
                                    <div>
                                       <p className="text-xs font-black text-slate-900">{d.name}</p>
                                       <p className="text-[8px] text-slate-400">{d.stats.txCount} Txns</p>
                                    </div>
                                 </div>
                              </td>
                              <td className="px-6 py-4 text-right font-bold text-xs text-slate-700">
                                 {d.stats.totalRevenue.toLocaleString()}
                              </td>
                              <td className="px-6 py-4 text-right">
                                 <div className="flex flex-col items-end gap-1">
                                    <span className={`text-xs font-black ${d.stats.collectionRate > 80 ? 'text-emerald-600' : d.stats.collectionRate > 50 ? 'text-amber-500' : 'text-rose-500'}`}>
                                       {d.stats.collectionRate.toFixed(1)}%
                                    </span>
                                    <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                                       <div className={`h-full rounded-full ${d.stats.collectionRate > 80 ? 'bg-emerald-500' : d.stats.collectionRate > 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${d.stats.collectionRate}%` }}></div>
                                    </div>
                                 </div>
                              </td>
                              <td className="px-6 py-4 text-right font-bold text-xs text-rose-600">
                                 {d.remainingDebt.toLocaleString()}
                              </td>
                              <td className="px-6 py-4 text-center">
                                 <span className={`px-2 py-1 rounded-full text-[8px] font-black uppercase ${d.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                    {d.status}
                                 </span>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
                  {paginatedDrivers.length === 0 && (
                    <div className="py-12 text-center text-slate-400">
                        <p className="text-xs font-black uppercase">No Drivers Found</p>
                    </div>
                  )}
               </div>
            </div>
         </div>
       )}

       {/* Pagination Controls */}
       {totalPages > 1 && (
         <div className="flex items-center justify-center gap-4 py-4">
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))} 
              disabled={page === 1}
              className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
               Page {page} of {totalPages}
            </span>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
              disabled={page === totalPages}
              className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
         </div>
       )}

       {/* Registration Form Modal (Existing) */}
       {isFormOpen && (
         <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95">
             <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <div className="flex items-center gap-3">
                 <div className="p-2 bg-indigo-600 rounded-xl text-white"><User size={20}/></div>
                 <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">{editingId ? 'Edit Driver' : 'New Driver'}</h3>
               </div>
               <button onClick={resetForm} className="p-2 bg-white rounded-full text-slate-400 shadow-sm hover:text-rose-500 transition-colors"><X size={18} /></button>
             </div>
             
             <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                 <div className="grid grid-cols-2 gap-4">
                    <InputField label="姓名 NAME" value={form.name} icon={<User size={16}/>} onChange={v => setForm({...form, name: v})} />
                    <InputField label="电话 PHONE" value={form.phone} icon={<Phone size={16}/>} onChange={v => setForm({...form, phone: v})} />
                 </div>
                 <div>
                    <InputField label="登录账号 USERNAME" value={form.username} icon={<ShieldCheck size={16}/>} onChange={v => setForm({...form, username: v})} />
                 </div>
                
                {/* Vehicle & Asset Configuration */}
                <div className="p-5 bg-slate-50 rounded-[28px] border border-slate-200 space-y-4">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                     <Truck size={14} /> Vehicle & Asset
                   </p>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                         <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Vehicle Model</label>
                         <input type="text" value={form.model} onChange={e => setForm({...form, model: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold" placeholder="Bajaj / TVS" />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[8px] font-black text-slate-400 uppercase ml-1">License Plate</label>
                         <input type="text" value={form.plate} onChange={e => setForm({...form, plate: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold uppercase" placeholder="T 000 XXX" />
                      </div>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Daily Coin Float</label>
                      <input type="number" value={form.dailyFloatingCoins} onChange={e => setForm({...form, dailyFloatingCoins: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold" />
                   </div>
                </div>

                {/* 薪资方案配置区块 */}
                <div className="p-5 bg-indigo-50/50 rounded-[28px] border border-indigo-100 space-y-4">
                   <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                     <Receipt size={14} /> 薪资与提成方案
                   </p>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                         <label className="text-[8px] font-black text-indigo-400 uppercase ml-1">Monthly Base Salary (TZS)</label>
                         <div className="relative">
                            <Banknote size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-300" />
                            <input type="number" value={form.baseSalary} onChange={e => setForm({...form, baseSalary: e.target.value})} className="w-full bg-white border border-indigo-100 rounded-xl pl-9 pr-4 py-3 text-sm font-black text-indigo-600 outline-none" placeholder="300000" />
                         </div>
                      </div>
                      <div className="space-y-1">
                         <label className="text-[8px] font-black text-indigo-400 uppercase ml-1">提成比例 (%)</label>
                         <div className="relative">
                            <Percent size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-300" />
                            <input type="number" value={form.commissionRate} onChange={e => setForm({...form, commissionRate: e.target.value})} className="w-full bg-white border border-indigo-100 rounded-xl pl-9 pr-4 py-3 text-sm font-black text-indigo-600 outline-none" placeholder="5" />
                         </div>
                      </div>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[8px] font-black text-indigo-400 uppercase ml-1">初始欠款 (如有)</label>
                      <input type="number" value={form.initialDebt} onChange={e => setForm({...form, initialDebt: e.target.value})} className="w-full bg-white border border-indigo-100 rounded-xl px-4 py-2.5 text-xs font-bold" />
                   </div>
                </div>
             </div>

             <div className="p-6 border-t border-slate-100 bg-slate-50">
               <button 
                 onClick={handleSave} 
                 disabled={isSaving}
                 className="w-full bg-indigo-600 text-white rounded-2xl font-black py-4 uppercase shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 disabled:bg-slate-300 transition-all active:scale-95"
               >
                 {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                 {isSaving ? 'Saving...' : 'Save Driver Profile'}
               </button>
             </div>
           </div>
         </div>
       )}
    </div>
  );
};

const InputField = ({ label, value, onChange, icon, type = "text" }: any) => (
  <div className="space-y-1 flex-1">
    <label className="text-[8px] font-black text-slate-400 uppercase ml-1 tracking-widest">{label}</label>
    <div className="flex items-center bg-white border border-slate-200 rounded-xl px-4 py-2.5 focus-within:border-indigo-400 transition-all">
      <span className="text-slate-400 mr-2">{icon}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="bg-transparent w-full text-xs font-bold outline-none text-slate-900" />
    </div>
  </div>
);

export default DriverManagement;
