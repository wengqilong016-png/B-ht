import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, AlertTriangle, DollarSign, TrendingUp, Users, Printer, ShieldAlert, BadgeCheck, Scale } from 'lucide-react';
import { Driver, Transaction, DailySettlement, CONSTANTS } from '../types';

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

  // 1. 自动对账引擎 (Auto-Reconciliation Engine)
  const reconciliationReports = useMemo(() => {
    return transactions.filter(t => t.timestamp.startsWith(selectedMonth)).map(tx => {
      // 理论应交现金 = 营收 - 店主留存 - 报销支出
      const theoreticalNet = tx.revenue - (tx.ownerRetention || 0) - (tx.expenses || 0);
      const difference = tx.netPayable - theoreticalNet;
      const isDiscrepant = Math.abs(difference) > 10; // 容差10 TZS

      return {
        tx,
        theoreticalNet,
        difference,
        isDiscrepant
      };
    });
  }, [transactions, selectedMonth]);

  const discrepantCount = reconciliationReports.filter(r => r.isDiscrepant).length;

  // 2. 司机月度财务深度汇总
  const driverStats = useMemo(() => {
    const confirmedSettlements = dailySettlements.filter(
      (s) => s.status === 'confirmed' && s.date.startsWith(selectedMonth)
    );

    return drivers.filter((d) => d.status === 'active').map((driver) => {
      const monthTxs = transactions.filter(
        (t) => t.driverId === driver.id && t.timestamp.startsWith(selectedMonth)
      );
      
      const totalRevenue = monthTxs.reduce((s, t) => s + t.revenue, 0);
      const totalNetPayable = monthTxs.reduce((s, t) => s + t.netPayable, 0);
      const commission = Math.floor(totalRevenue * (driver.commissionRate || 0.05));
      const baseSalary = driver.baseSalary || 300000;
      
      // 自动计算短款 (Shortage)
      const shortage = confirmedSettlements
        .filter((s) => s.driverId === driver.id)
        .reduce((sum, s) => sum + (s.shortage < 0 ? Math.abs(s.shortage) : 0), 0);
      
      // 自动计算私人借款 (Salary Advance)
      const loans = monthTxs
        .filter((t) => t.expenseType === 'private' && t.expenseStatus === 'approved')
        .reduce((s, t) => s + t.expenses, 0);

      // 自动计算债务抵扣 (Debt Deduction) - 封顶20%
      const maxDeduction = Math.floor((baseSalary + commission) * 0.2);
      const debtDeduction = Math.min(driver.remainingDebt, maxDeduction);
      
      const netPayout = baseSalary + commission - shortage - loans - debtDeduction;
      
      // 该司机本月是否有对账异常
      const hasAuditWarning = reconciliationReports.some(r => r.tx.driverId === driver.id && r.isDiscrepant);

      return {
        driver,
        totalRevenue,
        totalNetPayable,
        commission,
        baseSalary,
        shortage,
        loans,
        debtDeduction,
        netPayout: Math.max(0, netPayout),
        hasAuditWarning,
        txCount: monthTxs.length,
        settlementStatus: confirmedSettlements.filter((s) => s.driverId === driver.id).length >= 25 ? 'complete' : 'partial'
      };
    });
  }, [drivers, transactions, dailySettlements, selectedMonth, reconciliationReports]);

  const fleetTotal = useMemo(() => {
    const totalRevenue = driverStats.reduce((s, d) => s + d.totalRevenue, 0);
    const totalPayout = driverStats.reduce((s, d) => s + d.netPayout, 0);
    return { totalRevenue, totalPayout };
  }, [driverStats]);

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* 状态看板 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <div className="md:col-span-2 bg-slate-900 rounded-[35px] p-6 text-white flex justify-between items-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12"><Scale size={120}/></div>
            <div className="relative z-10">
               <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Fleet Total Revenue</p>
               <p className="text-3xl font-black">TZS {fleetTotal.totalRevenue.toLocaleString()}</p>
               <div className="flex items-center gap-2 mt-3">
                  <span className="px-2 py-0.5 bg-indigo-500 rounded text-[8px] font-black uppercase">{selectedMonth}</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Automated Billing Active</span>
               </div>
            </div>
            <div className="text-right relative z-10">
               <TrendingUp className="text-emerald-400 ml-auto mb-2" size={24}/>
               <p className="text-[9px] font-black text-slate-400 uppercase">Growth Rate</p>
               <p className="text-sm font-black text-emerald-400">+12.5%</p>
            </div>
         </div>

         <div className={`rounded-[35px] p-6 border-2 flex flex-col justify-between transition-all ${discrepantCount > 0 ? 'bg-rose-50 border-rose-200 shadow-rose-100 shadow-xl' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="flex justify-between items-start">
               <p className="text-[10px] font-black uppercase text-slate-400">对账异常</p>
               {discrepantCount > 0 ? <ShieldAlert className="text-rose-500 animate-bounce" size={20}/> : <BadgeCheck className="text-emerald-500" size={20}/>}
            </div>
            <div>
               <p className={`text-2xl font-black ${discrepantCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{discrepantCount}</p>
               <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">{discrepantCount > 0 ? '需要立即人工介入' : '全量交易自动匹配成功'}</p>
            </div>
         </div>

         <div className="bg-white rounded-[35px] p-6 border border-slate-200 flex flex-col justify-between shadow-sm">
            <div className="flex justify-between items-start">
               <p className="text-[10px] font-black uppercase text-slate-400">选择月份</p>
               <FileSpreadsheet className="text-indigo-500" size={20}/>
            </div>
            <select
              value={selectedMonth}
              onChange={(e) => { setSelectedMonth(e.target.value); setConfirmed(false); }}
              className="w-full bg-slate-50 border-none rounded-xl px-2 py-2 text-xs font-black text-slate-900 outline-none"
            >
              {Array.from(new Set(transactions.map(t => t.timestamp.substring(0, 7)))).sort().reverse().map(m => <option key={m} value={m}>{m}</option>)}
            </select>
         </div>
      </div>

      <div className="bg-white rounded-[40px] border border-slate-200 shadow-xl overflow-hidden">
         <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h2 className="text-lg font-black text-slate-900 uppercase">自动化工资对账清单</h2>
            <div className="flex gap-2">
               <button onClick={() => window.print()} className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:text-indigo-600 transition-all shadow-sm"><Printer size={18}/></button>
               <button className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase shadow-lg active:scale-95 transition-all"><Download size={16}/> 导出全量财务报表</button>
            </div>
         </div>

         <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                     <th className="px-6 py-4">司机与巡检详情</th>
                     <th className="px-6 py-4">总营收 (Gross)</th>
                     <th className="px-6 py-4">实收现金 (Net)</th>
                     <th className="px-6 py-4">提成与基本薪资</th>
                     <th className="px-6 py-4">扣款 (借款/短款)</th>
                     <th className="px-6 py-4">实发预测</th>
                     <th className="px-6 py-4 text-center">审计状态</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {driverStats.map((stat) => (
                     <tr key={stat.driver.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-5">
                           <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-sm shadow-lg group-hover:bg-indigo-600 transition-colors">
                                 {stat.driver.name.charAt(0)}
                              </div>
                              <div>
                                 <p className="text-xs font-black text-slate-900 uppercase">{stat.driver.name}</p>
                                 <p className="text-[8px] font-bold text-slate-400 mt-0.5">{stat.txCount} 次网点巡检记录</p>
                              </div>
                           </div>
                        </td>
                        <td className="px-6 py-5">
                           <p className="text-[10px] font-bold text-slate-400">TZS</p>
                           <p className="text-xs font-black text-slate-900">{stat.totalRevenue.toLocaleString()}</p>
                        </td>
                        <td className="px-6 py-5">
                           <p className="text-[10px] font-bold text-slate-400">TZS</p>
                           <p className="text-xs font-black text-slate-900">{stat.totalNetPayable.toLocaleString()}</p>
                        </td>
                        <td className="px-6 py-5 text-[10px]">
                           <div className="space-y-1">
                              <div className="flex justify-between w-24 text-slate-400"><span>底薪:</span><span className="font-black text-slate-600">{stat.baseSalary.toLocaleString()}</span></div>
                              <div className="flex justify-between w-24 text-indigo-400"><span>提成:</span><span className="font-black text-indigo-600">{stat.commission.toLocaleString()}</span></div>
                           </div>
                        </td>
                        <td className="px-6 py-5 text-[10px]">
                           <div className="space-y-1">
                              <div className="flex justify-between w-24 text-rose-400"><span>欠款:</span><span className="font-black text-rose-600">-{stat.debtDeduction.toLocaleString()}</span></div>
                              <div className="flex justify-between w-24 text-rose-400"><span>借款:</span><span className="font-black text-rose-600">-{stat.loans.toLocaleString()}</span></div>
                           </div>
                        </td>
                        <td className="px-6 py-5">
                           <div className="bg-emerald-50 px-3 py-2 rounded-xl inline-block border border-emerald-100">
                              <p className="text-[8px] font-black text-emerald-500 uppercase leading-none mb-1">Estimated</p>
                              <p className="text-xs font-black text-emerald-700">TZS {stat.netPayout.toLocaleString()}</p>
                           </div>
                        </td>
                        <td className="px-6 py-5">
                           <div className="flex justify-center">
                              {stat.hasAuditWarning ? (
                                 <div className="flex items-center gap-1 px-3 py-1 bg-rose-50 text-rose-600 rounded-full border border-rose-100 text-[8px] font-black uppercase animate-pulse">
                                    <ShieldAlert size={10}/> 交易异常
                                 </div>
                              ) : (
                                 <div className="flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 text-[8px] font-black uppercase">
                                    <BadgeCheck size={10}/> 账目平衡
                                 </div>
                              )}
                           </div>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};

export default BillingReconciliation;
