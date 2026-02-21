
import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Calendar, 
  Download, 
  TrendingUp, 
  DollarSign, 
  MapPin, 
  User, 
  BarChart3,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { Transaction, Driver, Location, DailySettlement, TRANSLATIONS } from '../types';

interface FinancialReportsProps {
  transactions: Transaction[];
  drivers: Driver[];
  locations: Location[];
  dailySettlements: DailySettlement[];
  lang: 'zh' | 'sw';
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 border-b border-white/5 pb-1">{label}</p>
        <div className="space-y-1.5">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }}></div>
                <span className="text-[11px] font-bold text-slate-300 uppercase">{entry.name === 'revenue' ? '营收' : entry.name === 'expenses' ? '支出' : '利润'}</span>
              </div>
              <span className="text-[11px] font-black text-white">TZS {entry.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

const FinancialReports: React.FC<FinancialReportsProps> = ({ transactions, drivers, locations, dailySettlements, lang }) => {
  const t = TRANSLATIONS[lang];
  
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [driverFilter, setDriverFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  // NEW: Cascading location filter based on selected driver
  const availableLocations = useMemo(() => {
    if (driverFilter === 'all') return locations;
    return locations.filter(l => l.assignedDriverId === driverFilter);
  }, [locations, driverFilter]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const txDate = tx.timestamp.split('T')[0];
      const matchDate = txDate >= startDate && txDate <= endDate;
      const matchDriver = driverFilter === 'all' || tx.driverId === driverFilter;
      const matchLocation = locationFilter === 'all' || tx.locationId === locationFilter;
      return matchDate && matchDriver && matchLocation;
    });
  }, [transactions, startDate, endDate, driverFilter, locationFilter]);

  // Reset location filter if it's no longer in the available list
  useEffect(() => {
    if (locationFilter !== 'all' && !availableLocations.find(l => l.id === locationFilter)) {
      setLocationFilter('all');
    }
  }, [availableLocations, locationFilter]);

  const stats = useMemo(() => {
// ... (rest of the calculation)
    const revenue = filteredTransactions.reduce((acc, tx) => acc + tx.revenue, 0);
    // Only count Public expenses as actual Company Expenses. Private are just transfers.
    const expenses = filteredTransactions
      .filter(tx => tx.expenseType !== 'private')
      .reduce((acc, tx) => acc + tx.expenses, 0);
      
    // Net Profit = Revenue - Public Expenses (Private expenses are just cash flow movements, not P&L items)
    // Note: This simple calculation assumes all collection transactions are profit based. 
    // If strict P&L: Profit = Revenue - Commission - OwnerShare - Public Expenses.
    // For simplicity here matching previous logic but excluding private.
    const netProfit = filteredTransactions.reduce((acc, tx) => {
        if (tx.type === 'expense') {
            return acc + (tx.expenseType === 'private' ? 0 : -tx.expenses);
        }
        // For collection, netPayable is Cash. Profit is different. 
        // Let's stick to the visual: Profit ~ Net Payable for now, but adjusted for expenses.
        // Actually, let's refine:
        // P&L Profit = Revenue - Commission - Owner Retention - Public Expenses.
        const cost = tx.commission + tx.ownerRetention + (tx.expenseType === 'public' ? tx.expenses : 0);
        return acc + (tx.revenue - cost);
    }, 0);

    const outstandingDebt = locations.reduce((acc, loc) => acc + loc.remainingStartupDebt, 0) + drivers.reduce((acc, d) => acc + d.remainingDebt, 0);
    
    return { revenue, expenses, netProfit, outstandingDebt };
  }, [filteredTransactions, locations, drivers]);

  const chartData = useMemo(() => {
    const dataMap: Record<string, { date: string; revenue: number; expenses: number; profit: number }> = {};
    
    filteredTransactions.forEach(tx => {
      let key = tx.timestamp.split('T')[0];
      if (groupBy === 'week') {
        const d = new Date(key);
        const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1);
        key = new Date(d.setDate(diff)).toISOString().split('T')[0];
      } else if (groupBy === 'month') {
        key = key.substring(0, 7);
      }

      if (!dataMap[key]) dataMap[key] = { date: key, revenue: 0, expenses: 0, profit: 0 };
      
      // Expenses Logic for Chart
      const isPrivate = tx.expenseType === 'private';
      const expenseAmount = isPrivate ? 0 : tx.expenses; // Don't chart private loans as expenses
      
      dataMap[key].revenue += tx.revenue;
      dataMap[key].expenses += expenseAmount;
      
      // Profit Logic
      const cost = tx.commission + tx.ownerRetention + expenseAmount;
      dataMap[key].profit += (tx.revenue - cost);
    });

    return Object.values(dataMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredTransactions, groupBy]);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const exportToCSV = () => {
    const headers = ['Date', 'Location', 'Driver', 'Revenue', 'Public Expense', 'Private Loan', 'Net Payable', 'Category', 'Notes'];
    const rows = filteredTransactions.map(tx => [
      new Date(tx.timestamp).toLocaleString(),
      tx.locationName,
      drivers.find(d => d.id === tx.driverId)?.name || 'Unknown',
      tx.revenue,
      tx.expenseType === 'public' ? tx.expenses : 0,
      tx.expenseType === 'private' ? tx.expenses : 0,
      tx.netPayable,
      tx.expenseCategory || '-',
      tx.notes || ''
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Financial_Report_${startDate}_to_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg"><BarChart3 size={24} /></div>
            {t.reports}
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Financial Analysis & Performance Ledger</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <Calendar size={16} className="text-slate-400 mr-2" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-xs font-black text-slate-700 outline-none" />
            <span className="mx-2 text-slate-300">→</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-xs font-black text-slate-700 outline-none" />
          </div>
          <button onClick={exportToCSV} className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95">
            <Download size={16} /> {t.export}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 p-8 bg-indigo-50 rounded-full opacity-50 group-hover:scale-110 transition-transform"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">{t.revenue}</p>
          <div className="flex items-baseline gap-1 relative z-10">
            <span className="text-[10px] font-bold text-slate-400">TZS</span>
            <span className="text-2xl font-black text-slate-900">{stats.revenue.toLocaleString()}</span>
          </div>
          <div className="mt-4 flex items-center gap-1 text-[9px] font-black text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg w-fit"><TrendingUp size={10} /> 30天分析</div>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 p-8 bg-rose-50 rounded-full opacity-50 group-hover:scale-110 transition-transform"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">{t.expenses} (Public)</p>
          <div className="flex items-baseline gap-1 relative z-10">
            <span className="text-[10px] font-bold text-slate-400">TZS</span>
            <span className="text-2xl font-black text-rose-600">{stats.expenses.toLocaleString()}</span>
          </div>
          <div className="mt-4 flex items-center gap-1 text-[9px] font-black text-rose-500 bg-rose-50 px-2 py-1 rounded-lg w-fit"><ArrowDownRight size={10} /> 仅含公司运营支出</div>
        </div>

        <div className="bg-slate-900 p-6 rounded-[32px] shadow-2xl relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 p-8 bg-white/5 rounded-full opacity-50 group-hover:scale-110 transition-transform"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">{t.profit} (Est.)</p>
          <div className="flex items-baseline gap-1 relative z-10">
            <span className="text-[10px] font-bold text-slate-500">TZS</span>
            <span className="text-2xl font-black text-white">{stats.netProfit.toLocaleString()}</span>
          </div>
          <div className="mt-4 flex items-center gap-1 text-[9px] font-black text-indigo-400 bg-white/10 px-2 py-1 rounded-lg w-fit"><ArrowUpRight size={10} /> 净利润估算</div>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 p-8 bg-amber-50 rounded-full opacity-50 group-hover:scale-110 transition-transform"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">{t.outstanding}</p>
          <div className="flex items-baseline gap-1 relative z-10">
            <span className="text-[10px] font-bold text-slate-400">TZS</span>
            <span className="text-2xl font-black text-amber-600">{stats.outstandingDebt.toLocaleString()}</span>
          </div>
          <div className="mt-4 flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg w-fit"><DollarSign size={10} /> 待收资产</div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 flex-1 min-w-[200px]">
           <User size={16} className="text-slate-400" />
           <select value={driverFilter} onChange={e => setDriverFilter(e.target.value)} className="bg-transparent text-xs font-black text-slate-700 outline-none w-full uppercase">
             <option value="all">所有司机 (All Drivers)</option>
             {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
           </select>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 flex-1 min-w-[200px]">
           <MapPin size={16} className="text-slate-400" />
           <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} className="bg-transparent text-xs font-black text-slate-700 outline-none w-full uppercase">
             <option value="all">所有点位 (All Locations)</option>
             {availableLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
           </select>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl">
           {(['day', 'week', 'month'] as const).map(type => (
             <button key={type} onClick={() => setGroupBy(type)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${groupBy === type ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
               {type === 'day' ? '按日' : type === 'week' ? '按周' : '按月'}
             </button>
           ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
           <div className="flex justify-between items-center mb-8">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">营收趋势对比 (Revenue Trend)</h3>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase"><div className="w-2 h-2 bg-indigo-500 rounded-full"></div> 营收</div>
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase"><div className="w-2 h-2 bg-rose-500 rounded-full"></div> 支出 (Public)</div>
              </div>
           </div>
           <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} tickFormatter={(val) => `TZS ${val.toLocaleString()}`} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Area type="monotone" name="revenue" dataKey="revenue" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" activeDot={{ r: 6, strokeWidth: 0 }} />
                  <Area type="monotone" name="expenses" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fillOpacity={0} activeDot={{ r: 4, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
           </div>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
           <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-8 text-center">支出构成分析 (Public & Private)</h3>
           <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                    <Pie
                      data={[
                        { name: 'Fuel', value: filteredTransactions.filter(t => t.expenseCategory === 'fuel').reduce((a,b)=>a+b.expenses,0) },
                        { name: 'Repair', value: filteredTransactions.filter(t => t.expenseCategory === 'repair').reduce((a,b)=>a+b.expenses,0) },
                        { name: 'Allowance', value: filteredTransactions.filter(t => t.expenseCategory === 'allowance').reduce((a,b)=>a+b.expenses,0) },
                        { name: 'Salary Adv', value: filteredTransactions.filter(t => t.expenseCategory === 'salary_advance').reduce((a,b)=>a+b.expenses,0) },
                        { name: 'Other', value: filteredTransactions.filter(t => t.expenseCategory === 'other' || (!t.expenseCategory && t.expenses > 0)).reduce((a,b)=>a+b.expenses,0) }
                      ].filter(v => v.value > 0)}
                      cx="50%"
                      cy="45%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {COLORS.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="hover:opacity-80 transition-opacity cursor-pointer outline-none" />)}
                    </Pie>
                    <Tooltip 
                       content={({ active, payload }: any) => {
                         if (active && payload && payload.length) {
                           return (
                             <div className="bg-slate-900 text-white p-3 rounded-xl border border-white/10 shadow-xl">
                               <p className="text-[10px] font-black uppercase mb-1">{payload[0].name}</p>
                               <p className="text-xs font-black">TZS {payload[0].value.toLocaleString()}</p>
                             </div>
                           );
                         }
                         return null;
                       }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', paddingTop: '20px' }} />
                 </PieChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
           <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">财务流水明细 (Detailed Ledger)</h3>
           <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full">{filteredTransactions.length} 条记录</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase">日期</th>
                <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase">点位/内容</th>
                <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase">司机</th>
                <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase text-right">营收</th>
                <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase text-right">支出</th>
                <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase text-right">净收/还款</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredTransactions.map(tx => (
                <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-[10px] font-bold text-slate-500">{new Date(tx.timestamp).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <p className="text-xs font-black text-slate-900">{tx.locationName}</p>
                    {tx.expenses > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${tx.expenseType === 'public' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                           {tx.expenseType === 'public' ? '公' : '私'}
                        </span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase">{tx.expenseCategory || 'Expense'}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-[9px] font-black text-slate-500">{drivers.find(d => d.id === tx.driverId)?.name.charAt(0)}</div>
                      <span className="text-[10px] font-bold text-slate-700">{drivers.find(d => d.id === tx.driverId)?.name || 'Admin'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-black text-slate-900 text-right">{tx.revenue > 0 ? `TZS ${tx.revenue.toLocaleString()}` : '-'}</td>
                  <td className="px-6 py-4 text-xs font-black text-rose-500 text-right">{tx.expenses > 0 ? `TZS ${tx.expenses.toLocaleString()}` : '-'}</td>
                  <td className={`px-6 py-4 text-xs font-black text-right ${tx.netPayable > 0 ? 'text-indigo-600' : 'text-slate-400'}`}>{`TZS ${tx.netPayable.toLocaleString()}`}</td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-20 text-center text-slate-400 text-xs font-black uppercase tracking-widest">所选时间段内暂无匹配财务记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FinancialReports;
