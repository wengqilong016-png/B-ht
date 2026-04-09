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
  type TooltipProps,
} from 'recharts';
import { CalendarDays, TrendingUp, Users, MapPin, DollarSign, Download, Building2 } from 'lucide-react';
import { useAppData } from '../contexts/DataContext';

interface MonthlyStats {
  month: string;
  label: string;
  revenue: number;
  commission: number;
  netPayable: number;
  collections: number;
  activeDrivers: number;
  activeSites: number;
}

interface DriverMonthStat {
  month: string;
  label: string;
  revenue: number;
  commission: number;
  netPayable: number;
  collections: number;
  activeSites: number;
}

const formatMoney = (value: number): string => value.toLocaleString();
const MONTH_LABEL_LOCALE = 'zh-CN';
const MONTH_KEY_PAD_LENGTH = 2;

type ChartTooltipFormatter = NonNullable<TooltipProps<any, any>['formatter']>;

const moneyTooltipFormatter: ChartTooltipFormatter = (value, name) => {
  const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
  return [`TZS ${formatMoney(numericValue)}`, String(name ?? '')];
};

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(MONTH_KEY_PAD_LENGTH, '0')}`;
}

function getMonthLabel(date: Date): string {
  return `${date.getMonth() + 1}月`;
}

function getTransactionMonthKey(
  tx: import('../types/models').Transaction,
): string | null {
  const ts = tx.timestamp || tx.uploadTimestamp;
  if (!ts) return null;
  return getMonthKey(new Date(ts));
}

function isCollectionTransaction(
  tx: import('../types/models').Transaction,
): boolean {
  return tx.type === 'collection' || tx.type === undefined;
}

function createMonthBuckets<T extends { month: string; label: string }>(
  monthCount: number,
  createBucket: (month: string, label: string) => T,
): T[] {
  const now = new Date();
  const months: T[] = [];

  for (let i = monthCount - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = getMonthKey(date);
    months.push(createBucket(month, getMonthLabel(date)));
  }

  return months;
}

function sumByMonth<T>(items: T[], selector: (item: T) => number): number {
  return items.reduce((sum, item) => sum + selector(item), 0);
}

function exportCsvSafely(filename: string, rows: string[][], headers: string[]) {
  try {
    downloadCSV(filename, rows, headers);
  } catch (error) {
    console.error('Failed to export monthly report CSV.', error);
  }
}

function buildMonthlyStats(
  transactions: import('../types/models').Transaction[],
  monthCount: number,
): MonthlyStats[] {
  const months = createMonthBuckets(monthCount, (month, label): MonthlyStats => ({
    month,
    label,
    revenue: 0,
    commission: 0,
    netPayable: 0,
    collections: 0,
    activeDrivers: 0,
    activeSites: 0,
  }));

  const byMonth = new Map<string, MonthlyStats>(months.map((m) => [m.month, m]));

  for (const tx of transactions) {
    if (!isCollectionTransaction(tx)) continue;
    const key = getTransactionMonthKey(tx);
    if (!key) continue;
    const stat = byMonth.get(key);
    if (!stat) continue;
    stat.revenue += tx.revenue ?? 0;
    stat.commission += tx.commission ?? 0;
    stat.netPayable += tx.netPayable ?? 0;
    stat.collections += 1;
  }

  for (const stat of months) {
    const monthTxs = transactions.filter((tx) => {
      return isCollectionTransaction(tx) && getTransactionMonthKey(tx) === stat.month;
    });
    stat.activeDrivers = new Set(monthTxs.map((t) => t.driverId)).size;
    stat.activeSites = new Set(monthTxs.map((t) => t.locationId)).size;
  }

  return months;
}

function buildDriverStats(
  transactions: import('../types/models').Transaction[],
  driverId: string,
  monthCount: number,
): DriverMonthStat[] {
  const months = createMonthBuckets(monthCount, (month, label): DriverMonthStat => ({
    month,
    label,
    revenue: 0,
    commission: 0,
    netPayable: 0,
    collections: 0,
    activeSites: 0,
  }));

  const byMonth = new Map<string, DriverMonthStat>(months.map((m) => [m.month, m]));

  for (const tx of transactions) {
    if (tx.driverId !== driverId) continue;
    if (!isCollectionTransaction(tx)) continue;
    const key = getTransactionMonthKey(tx);
    if (!key) continue;
    const stat = byMonth.get(key);
    if (!stat) continue;
    stat.revenue += tx.revenue ?? 0;
    stat.commission += tx.commission ?? 0;
    stat.netPayable += tx.netPayable ?? 0;
    stat.collections += 1;
  }

  // Count unique sites per month for this driver
  for (const stat of months) {
    const monthTxs = transactions.filter((tx) => {
      return tx.driverId === driverId
        && isCollectionTransaction(tx)
        && getTransactionMonthKey(tx) === stat.month;
    });
    stat.activeSites = new Set(monthTxs.map((t) => t.locationId)).size;
  }

  return months;
}

function downloadCSV(filename: string, rows: string[][], headers: string[]) {
  const escape = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const MONTH_OPTIONS = [3, 6, 12] as const;

const MonthlyReportPage: React.FC = () => {
  const { transactions, drivers } = useAppData();
  const [monthCount, setMonthCount] = useState<(typeof MONTH_OPTIONS)[number]>(6);
  const [tab, setTab] = useState<'fleet' | 'driver'>('fleet');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');

  const activeDriverId = selectedDriverId || drivers[0]?.id || '';

  const fleetStats = useMemo(
    () => buildMonthlyStats(transactions, monthCount),
    [transactions, monthCount],
  );

  const driverStats = useMemo(
    () => activeDriverId ? buildDriverStats(transactions, activeDriverId, monthCount) : [],
    [transactions, activeDriverId, monthCount],
  );

  const fleetTotals = useMemo(() => ({
    revenue: fleetStats.reduce((s, m) => s + m.revenue, 0),
    commission: fleetStats.reduce((s, m) => s + m.commission, 0),
    netPayable: fleetStats.reduce((s, m) => s + m.netPayable, 0),
    collections: fleetStats.reduce((s, m) => s + m.collections, 0),
  }), [fleetStats]);

  const driverTotals = useMemo(() => ({
    revenue: sumByMonth(driverStats, (m) => m.revenue),
    commission: sumByMonth(driverStats, (m) => m.commission),
    netPayable: sumByMonth(driverStats, (m) => m.netPayable),
    collections: sumByMonth(driverStats, (m) => m.collections),
  }), [driverStats]);

  const fmt = (n: number) =>
    n.toLocaleString(MONTH_LABEL_LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const selectedDriver = drivers.find(d => d.id === activeDriverId);

  const exportFleetCSV = () => {
    exportCsvSafely(
      `fleet-report-${monthCount}months.csv`,
      fleetStats.map(m => [m.label, String(m.revenue), String(m.commission), String(m.netPayable), String(m.collections), String(m.activeDrivers), String(m.activeSites)]),
      ['月份', '营收(TZS)', '提成(TZS)', '净应付(TZS)', '收款次数', '活跃司机', '活跃机器'],
    );
  };

  const exportDriverCSV = () => {
    exportCsvSafely(
      `driver-${selectedDriver?.name ?? activeDriverId}-${monthCount}months.csv`,
      driverStats.map(m => [m.label, String(m.revenue), String(m.commission), String(m.netPayable), String(m.collections), String(m.activeSites)]),
      ['月份', '营收(TZS)', '提成(TZS)', '净应付(TZS)', '收款次数', '活跃机器'],
    );
  };

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

      {/* Tab Toggle */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-2xl p-1">
        <button
          onClick={() => setTab('fleet')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black uppercase transition-all ${tab === 'fleet' ? 'bg-white text-indigo-700 shadow' : 'text-slate-500'}`}
        >
          <Building2 size={13} /> 总站汇总
        </button>
        <button
          onClick={() => setTab('driver')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black uppercase transition-all ${tab === 'driver' ? 'bg-white text-indigo-700 shadow' : 'text-slate-500'}`}
        >
          <Users size={13} /> 司机明细
        </button>
      </div>

      {tab === 'fleet' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1"><TrendingUp size={14} className="text-indigo-600" /><p className="text-[10px] font-black text-indigo-500 uppercase">总营收</p></div>
              <p className="text-xl font-black text-indigo-800">TZS {fmt(fleetTotals.revenue)}</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1"><DollarSign size={14} className="text-emerald-600" /><p className="text-[10px] font-black text-emerald-500 uppercase">净应付</p></div>
              <p className="text-xl font-black text-emerald-800">TZS {fmt(fleetTotals.netPayable)}</p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1"><Users size={14} className="text-amber-600" /><p className="text-[10px] font-black text-amber-500 uppercase">提成总额</p></div>
              <p className="text-xl font-black text-amber-800">TZS {fmt(fleetTotals.commission)}</p>
            </div>
            <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1"><MapPin size={14} className="text-rose-600" /><p className="text-[10px] font-black text-rose-500 uppercase">总收款次数</p></div>
              <p className="text-xl font-black text-rose-800">{fmt(fleetTotals.collections)}</p>
            </div>
          </div>

          {/* Revenue Chart */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs font-black text-slate-600 uppercase mb-3">月度营收趋势</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={fleetStats} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={moneyTooltipFormatter} labelStyle={{ fontWeight: 700 }} />
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
              <BarChart data={fleetStats} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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

          {/* Fleet Table + Export */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <p className="text-xs font-black text-slate-600 uppercase">总站明细数据</p>
              <button onClick={exportFleetCSV} className="flex items-center gap-1 rounded-xl bg-indigo-50 px-2.5 py-1.5 text-[10px] font-black text-indigo-600 hover:bg-indigo-100">
                <Download size={11} /> 导出 CSV
              </button>
            </div>
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
                  {fleetStats.map((m, i) => (
                    <tr key={m.month} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                      <td className="px-3 py-2 font-black text-slate-700">{m.label}</td>
                      <td className="px-3 py-2 text-right text-indigo-700">{fmt(m.revenue)}</td>
                      <td className="px-3 py-2 text-right text-amber-700">{fmt(m.commission)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{fmt(m.netPayable)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{m.collections}</td>
                      <td className="px-3 py-2 text-right text-violet-600">{m.activeDrivers}</td>
                      <td className="px-3 py-2 text-right text-pink-600">{m.activeSites}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'driver' && (
        <>
          {/* Driver selector */}
          <div className="flex items-center gap-2">
            <Users size={15} className="text-indigo-500 shrink-0" />
            <select
              value={activeDriverId}
              onChange={e => setSelectedDriverId(e.target.value)}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
              ))}
            </select>
          </div>

          {/* Driver summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1"><TrendingUp size={14} className="text-indigo-600" /><p className="text-[10px] font-black text-indigo-500 uppercase">营收合计</p></div>
              <p className="text-xl font-black text-indigo-800">TZS {fmt(driverTotals.revenue)}</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1"><DollarSign size={14} className="text-emerald-600" /><p className="text-[10px] font-black text-emerald-500 uppercase">提成合计</p></div>
              <p className="text-xl font-black text-emerald-800">TZS {fmt(driverTotals.commission)}</p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1"><MapPin size={14} className="text-amber-600" /><p className="text-[10px] font-black text-amber-500 uppercase">收款总次</p></div>
              <p className="text-xl font-black text-amber-800">{fmt(driverTotals.collections)}</p>
            </div>
            <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1"><DollarSign size={14} className="text-violet-600" /><p className="text-[10px] font-black text-violet-500 uppercase">净应付</p></div>
              <p className="text-xl font-black text-violet-800">TZS {fmt(driverTotals.netPayable)}</p>
            </div>
          </div>

          {/* Driver revenue chart */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs font-black text-slate-600 uppercase mb-3">{selectedDriver?.name ?? activeDriverId} — 月度营收</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={driverStats} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={moneyTooltipFormatter} labelStyle={{ fontWeight: 700 }} />
                <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                <Bar dataKey="revenue" name="营收" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="commission" name="提成" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Driver monthly table + export */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <p className="text-xs font-black text-slate-600 uppercase">{selectedDriver?.name ?? activeDriverId} — 明细</p>
              <button onClick={exportDriverCSV} className="flex items-center gap-1 rounded-xl bg-indigo-50 px-2.5 py-1.5 text-[10px] font-black text-indigo-600 hover:bg-indigo-100">
                <Download size={11} /> 导出 CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] font-bold">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase">
                    <th className="px-3 py-2 text-left">月份</th>
                    <th className="px-3 py-2 text-right">营收</th>
                    <th className="px-3 py-2 text-right">提成</th>
                    <th className="px-3 py-2 text-right">净应付</th>
                    <th className="px-3 py-2 text-right">收款次</th>
                    <th className="px-3 py-2 text-right">活跃机器</th>
                  </tr>
                </thead>
                <tbody>
                  {driverStats.map((m, i) => (
                    <tr key={m.month} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                      <td className="px-3 py-2 font-black text-slate-700">{m.label}</td>
                      <td className="px-3 py-2 text-right text-indigo-700">{fmt(m.revenue)}</td>
                      <td className="px-3 py-2 text-right text-amber-700">{fmt(m.commission)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{fmt(m.netPayable)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{m.collections}</td>
                      <td className="px-3 py-2 text-right text-violet-600">{m.activeSites}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MonthlyReportPage;
