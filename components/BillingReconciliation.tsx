import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, AlertTriangle, DollarSign, TrendingUp, Users, Printer } from 'lucide-react';
import { Driver, Transaction, DailySettlement } from '../types';

interface BillingReconciliationProps {
  drivers: Driver[];
  transactions: Transaction[];
  dailySettlements: DailySettlement[];
}

const BillingReconciliation: React.FC<BillingReconciliationProps> = ({
  drivers,
  transactions,
  dailySettlements,
}) => {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const [confirmed, setConfirmed] = useState(false);

  // Available months from transaction data
  const availableMonths = useMemo(() => {
    const months = Array.from(new Set(transactions.map((t) => t.timestamp.substring(0, 7)))).sort().reverse();
    if (!months.includes(selectedMonth)) months.unshift(selectedMonth);
    return months;
  }, [transactions, selectedMonth]);

  // Per-driver monthly stats
  const driverStats = useMemo(() => {
    const confirmedSettlements = dailySettlements.filter(
      (s) => s.status === 'confirmed' && s.date.startsWith(selectedMonth)
    );
    return drivers.filter((d) => d.status === 'active').map((driver) => {
      const monthTxs = transactions.filter(
        (t) => t.driverId === driver.id && t.timestamp.startsWith(selectedMonth)
      );
      const totalRevenue = monthTxs.reduce((s, t) => s + t.revenue, 0);
      const commission = Math.floor(totalRevenue * (driver.commissionRate || 0.05));
      const baseSalary = driver.baseSalary || 300000;
      const shortage = confirmedSettlements
        .filter((s) => s.driverId === driver.id)
        .reduce((sum, s) => sum + (s.shortage < 0 ? Math.abs(s.shortage) : 0), 0);
      const loans = monthTxs
        .filter((t) => t.expenseType === 'private' && t.expenseStatus === 'approved')
        .reduce((s, t) => s + t.expenses, 0);
      const maxDeduction = Math.floor((baseSalary + commission) * 0.2);
      const debtDeduction = Math.min(driver.remainingDebt, maxDeduction);
      const netPayout = baseSalary + commission - shortage - loans - debtDeduction;
      const bonus = 0; // Future: configurable bonus
      return {
        driver,
        totalRevenue,
        commission,
        baseSalary,
        shortage,
        loans,
        debtDeduction,
        bonus,
        netPayout: Math.max(0, netPayout),
        txCount: monthTxs.length,
        hasMissingSettlement: monthTxs.length > 0 && confirmedSettlements.filter((s) => s.driverId === driver.id).length === 0,
      };
    });
  }, [drivers, transactions, dailySettlements, selectedMonth]);

  const fleetTotal = useMemo(() => {
    const totalBaseSalary = driverStats.reduce((s, d) => s + d.baseSalary, 0);
    const totalCommission = driverStats.reduce((s, d) => s + d.commission, 0);
    const totalBonus = driverStats.reduce((s, d) => s + d.bonus, 0);
    const totalDeductions = driverStats.reduce((s, d) => s + d.shortage + d.loans + d.debtDeduction, 0);
    const netFleetCost = driverStats.reduce((s, d) => s + d.netPayout, 0);
    return { totalBaseSalary, totalCommission, totalBonus, totalDeductions, netFleetCost };
  }, [driverStats]);

  const handleExport = () => {
    const lines = [
      `BAHATI JACKPOTS - 月度工资报表 ${selectedMonth}`,
      `生成时间: ${new Date().toLocaleString('zh-CN')}`,
      '',
      '司机,基本薪资,提成,奖金,扣款,实发工资',
      ...driverStats.map(
        (d) =>
          `${d.driver.name},${d.baseSalary},${d.commission},${d.bonus},${d.shortage + d.loans + d.debtDeduction},${d.netPayout}`
      ),
      '',
      `车队合计,,,,, ${fleetTotal.netFleetCost}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bahati-payroll-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Page Title & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">月账单核对</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            Monthly Billing &amp; Payroll Verification
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); setConfirmed(false); }}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-black text-slate-900 outline-none focus:border-indigo-500 shadow-sm"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase shadow-lg active:scale-95 transition-all"
          >
            <Download size={14} /> 导出报表
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase shadow-sm active:scale-95 transition-all"
          >
            <Printer size={14} /> 打印
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Driver Settlement List ─────────────────────────────────── */}
        <div className="lg:col-span-2 bg-white rounded-[28px] border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                <FileSpreadsheet size={18} />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase">司机月度结算清单</h2>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{selectedMonth}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 rounded-lg">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[9px] font-black text-amber-600">{driverStats.filter((d) => d.hasMissingSettlement).length > 0 ? '待核对' : '已齐全'}</span>
            </div>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-5 gap-2 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
            {['司机', '总营收', '提成', '应发分额', '状态'].map((h) => (
              <p key={h} className="text-[9px] font-black text-slate-400 uppercase">{h}</p>
            ))}
          </div>

          {/* Driver Rows */}
          <div className="divide-y divide-slate-50">
            {driverStats.map(({ driver, totalRevenue, commission, netPayout, txCount, hasMissingSettlement }) => (
              <div key={driver.id} className="grid grid-cols-5 gap-2 items-center px-5 py-4 hover:bg-slate-50/50 transition-colors">
                {/* Driver */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-800 text-white flex items-center justify-center font-black text-sm flex-shrink-0">
                    {driver.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-900 uppercase truncate">{driver.name}</p>
                    <p className="text-[8px] font-bold text-slate-400">{txCount} 次</p>
                  </div>
                </div>

                {/* Revenue */}
                <div>
                  <p className="text-xs font-black text-slate-700">TZS</p>
                  <p className="text-xs font-black text-slate-900">{totalRevenue.toLocaleString()}</p>
                </div>

                {/* Commission */}
                <div>
                  <p className="text-xs font-black text-indigo-400">TZS</p>
                  <p className="text-xs font-black text-indigo-600">{commission.toLocaleString()}</p>
                </div>

                {/* Net Payout */}
                <div>
                  <p className="text-xs font-black text-slate-700">TZS</p>
                  <p className="text-xs font-black text-slate-900">{netPayout.toLocaleString()}</p>
                </div>

                {/* Status */}
                <div className="flex flex-col gap-1">
                  {hasMissingSettlement ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 rounded-lg text-[8px] font-black uppercase">
                      <AlertTriangle size={8} /> 待核
                    </span>
                  ) : totalRevenue === 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-400 rounded-lg text-[8px] font-black uppercase">
                      — 无数据
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg text-[8px] font-black uppercase">
                      <CheckCircle2 size={8} /> 已对
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {driverStats.length === 0 && (
            <div className="py-16 text-center">
              <Users size={40} className="mx-auto text-slate-200 mb-3" />
              <p className="text-xs font-black text-slate-300 uppercase tracking-widest">暂无活跃司机数据</p>
            </div>
          )}
        </div>

        {/* ── Right: Fleet Total Payout Card ───────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <div className="bg-slate-900 rounded-[28px] p-6 text-white shadow-xl">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Fleet Total Payout</p>
            <p className="text-[10px] font-bold text-slate-300 uppercase">{selectedMonth}</p>
            <p className="text-3xl font-black text-white mt-1">
              TZS {fleetTotal.netFleetCost.toLocaleString()}
            </p>

            <div className="mt-6 space-y-3 border-t border-white/10 pt-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase">Total Base Salary</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-300">TZS</p>
                  <p className="text-xs font-black text-white">{fleetTotal.totalBaseSalary.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase">Total Commission</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-indigo-400">TZS</p>
                  <p className="text-xs font-black text-indigo-300">{fleetTotal.totalCommission.toLocaleString()}</p>
                </div>
              </div>
              {fleetTotal.totalBonus > 0 && (
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase">Total Bonuses</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-amber-400">TZS</p>
                    <p className="text-xs font-black text-amber-300">{fleetTotal.totalBonus.toLocaleString()}</p>
                  </div>
                </div>
              )}
              {fleetTotal.totalDeductions > 0 && (
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase">Deductions</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-rose-400">- TZS</p>
                    <p className="text-xs font-black text-rose-300">{fleetTotal.totalDeductions.toLocaleString()}</p>
                  </div>
                </div>
              )}
              <div className="h-px bg-white/10 my-2" />
              <div className="flex justify-between items-center">
                <p className="text-[9px] font-black text-slate-300 uppercase">Net Fleet Cost</p>
                <p className="text-base font-black text-white">TZS {fleetTotal.netFleetCost.toLocaleString()}</p>
              </div>
            </div>

            <button
              onClick={() => setConfirmed(true)}
              disabled={confirmed}
              className={`mt-6 w-full py-3.5 rounded-xl text-[10px] font-black uppercase transition-all active:scale-95 ${
                confirmed
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/50'
              }`}
            >
              {confirmed ? '✓ 已确认生成本月工资单' : '确认并生成本月工资单'}
            </button>
          </div>

          {/* Notes */}
          <div className="bg-amber-50 border border-amber-100 rounded-[24px] p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-amber-500" />
              <p className="text-[10px] font-black text-amber-700 uppercase">核对注意事项</p>
            </div>
            <ul className="space-y-2">
              {[
                '请核对所有异常营收是否已处理，异常订单将影响提成计算。',
                '确认本月报销费用已全部审批，未审批费用将不计入扣款。',
                '工资单生成后将无法修改，请务必仔细核对各项明细。',
              ].map((note, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                  <p className="text-[9px] font-bold text-amber-700 leading-relaxed">{note}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-slate-200 rounded-[20px] p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-indigo-500" />
                <p className="text-[8px] font-black text-slate-400 uppercase">总营收</p>
              </div>
              <p className="text-sm font-black text-slate-900">
                TZS {driverStats.reduce((s, d) => s + d.totalRevenue, 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-[20px] p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={14} className="text-emerald-500" />
                <p className="text-[8px] font-black text-slate-400 uppercase">实发总额</p>
              </div>
              <p className="text-sm font-black text-slate-900">
                TZS {fleetTotal.netFleetCost.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingReconciliation;
