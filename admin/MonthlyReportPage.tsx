import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { CalendarDays, TrendingUp, Users, MapPin, DollarSign } from 'lucide-react';
import { useAppData } from '../contexts/DataContext';

interface MonthlyStats {
  month: string;         // "YYYY-MM"
  label: string;         // "1月" / "2月" ...
  revenue: number;
  commission: number;
  netPayable: number;
  collections: number;
  activeDrivers: number;
  activeSites: number;
}

function buildMonthlyStats(
  transactions: import('../types/models').Transaction[],
  monthCount: number,
): MonthlyStats[] {
  const now = new Date();
  const months: MonthlyStats[] = [];

  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${d.getMonth() + 1}月`;
    months.push({ month: key, label, revenue: 0, commission: 0, netPayable: 0, collections: 0, activeDrivers: 0, activeSites: 0 });
  }

  const byMonth = new Map<string, MonthlyStats>(months.map((m) => [m.month, m]));

  for (const tx of transactions) {
    if (tx.type !== 'collection' && tx.type !== undefined) continue;
    const ts = tx.timestamp || tx.uploadTimestamp;
    if (!ts) continue;
    const d = new Date(ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const stat = byMonth.get(key);
    if (!stat) continue;
    stat.revenue += tx.revenue ?? 0;
    stat.commission += tx.commission ?? 0;
    stat.netPayable += tx.netPayable ?? 0;
    stat.collections += 1;
  }

  // Count unique drivers/sites per month
  for (const stat of months) {
    const monthTxs = transactions.filter((tx) => {
      if (tx.type !== 'collection' && tx.type !== undefined) return false;
      const ts = tx.timestamp || tx.uploadTimestamp;
      if (!ts) return false;
      const d = new Date(ts);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return key === stat.month;
    });
    stat.activeDrivers = new Set(monthTxs.map((t) => t.driverId)).size;
    stat.activeSites = new Set(monthTxs.map((t) => t.locationId)).size;
  }

  return months;
}

const MONTH_OPTIONS = [3, 6, 12] as const;

const MonthlyReportPage: React.FC = () => {
  const { transactions } = useAppData();
  const [monthCount, setMonthCount] = useState<(typeof MONTH_OPTIONS)[number]>(6);

  const stats = useMemo(
    () => buildMonthlyStats(transactions, monthCount),
    [transactions, monthCount],
  );

  const totals = useMemo(() => {
    const revenue = stats.reduce((s, m) => s + m.revenue, 0);
    const commission = stats.reduce((s, m) => s + m.commission, 0);
    const netPayable = stats.reduce((s, m) => s + m.netPayable, 0);
    const collections = stats.reduce((s, m) => s + m.collections, 0);
    return { revenue, commission, netPayable, collections };
  }, [stats]);

  const fmt = (n: number) =>
    n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays size={20} className="text-indigo-600" />
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-wide">月度报表</h2>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {MONTH_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setMonthCount(n)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                monthCount === n
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-500 hover:text-indigo-600'
              }`}
            >
              近{n}月
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-indigo-600" />
            <p className="text-[10px] font-black text-indigo-500 uppercase">总营收</p>
          </div>
          <p className="text-xl font-black text-indigo-800">¥{fmt(totals.revenue)}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={14} className="text-emerald-600" />
            <p className="text-[10px] font-black text-emerald-500 uppercase">净应付</p>
          </div>
          <p className="text-xl font-black text-emerald-800">¥{fmt(totals.netPayable)}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users size={14} className="text-amber-600" />
            <p className="text-[10px] font-black text-amber-500 uppercase">提成总额</p>
          </div>
          <p className="text-xl font-black text-amber-800">¥{fmt(totals.commission)}</p>
        </div>
        <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={14} className="text-rose-600" />
            <p className="text-[10px] font-black text-rose-500 uppercase">总收款次数</p>
          </div>
          <p className="text-xl font-black text-rose-800">{fmt(totals.collections)}</p>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-xs font-black text-slate-600 uppercase mb-3">月度营收趋势</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stats} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700 }} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `¥${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(value: number, name: string) => [`¥${fmt(value)}`, name]}
              labelStyle={{ fontWeight: 700 }}
            />
            <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
            <Bar dataKey="revenue" name="营收" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="commission" name="提成" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey="netPayable" name="净应付" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Active Drivers / Sites Chart */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-xs font-black text-slate-600 uppercase mb-3">月度活跃司机 & 机器</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={stats} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700 }} />
            <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
            <Tooltip labelStyle={{ fontWeight: 700 }} />
            <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
            <Bar dataKey="activeDrivers" name="活跃司机" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="activeSites" name="活跃机器" fill="#ec4899" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <p className="text-xs font-black text-slate-600 uppercase px-4 pt-4 pb-2">明细数据</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] font-bold">
            <thead>
              <tr className="bg-slate-50 text-slate-500 uppercase">
                <th className="px-3 py-2 text-left">月份</th>
                <th className="px-3 py-2 text-right">营收</th>
                <th className="px-3 py-2 text-right">提成</th>
                <th className="px-3 py-2 text-right">净应付</th>
                <th className="px-3 py-2 text-right">收款次</th>
                <th className="px-3 py-2 text-right">活跃司机</th>
                <th className="px-3 py-2 text-right">活跃机器</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((m, i) => (
                <tr key={m.month} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                  <td className="px-3 py-2 font-black text-slate-700">{m.label}</td>
                  <td className="px-3 py-2 text-right text-indigo-700">¥{fmt(m.revenue)}</td>
                  <td className="px-3 py-2 text-right text-amber-700">¥{fmt(m.commission)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">¥{fmt(m.netPayable)}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{m.collections}</td>
                  <td className="px-3 py-2 text-right text-violet-600">{m.activeDrivers}</td>
                  <td className="px-3 py-2 text-right text-pink-600">{m.activeSites}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MonthlyReportPage;
