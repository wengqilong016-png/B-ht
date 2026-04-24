import { ArrowRight, Store, BrainCircuit, ChevronDown } from 'lucide-react';
import React from 'react';

import { Transaction, Driver, Location, DailySettlement, MonthlyPayroll, TRANSLATIONS } from '../../types';
import { getOptimizedImageUrl } from '../../utils/imageUtils';
import SmartInsights from '../SmartInsights';

interface BossStats {
  todayRev: number;
  riskyDrivers: Driver[];
  stagnantMachines: Location[];
}

interface TodayDriverStat {
  driver: Driver;
  driverTxs: Transaction[];
  driverRev: number;
  driverCommission: number;
  driverNet: number;
}

interface OverviewTabProps {
  bossStats: BossStats;
  todayDriverStats: TodayDriverStat[];
  locationMap: Map<string, Location>;
  transactions: Transaction[];
  locations: Location[];
  drivers: Driver[];
  dailySettlements: DailySettlement[];
  monthlyPayrolls: MonthlyPayroll[];
  unsyncedCount: number;
  lang: 'zh' | 'sw';
  onOpenTab?: (tab: 'settlement' | 'locations' | 'team' | 'tracking') => void;
}

const OverviewTab: React.FC<OverviewTabProps> = ({
  bossStats,
  todayDriverStats,
  locationMap,
  transactions,
  locations,
  drivers,
  dailySettlements,
  monthlyPayrolls,
  unsyncedCount,
  lang,
  onOpenTab,
}) => {
  const [revDrilldown, setRevDrilldown] = React.useState<'none' | 'drivers' | string>('none');
  const [aiInsightsExpanded, setAiInsightsExpanded] = React.useState(false);
  const t = TRANSLATIONS[lang];
  const todayActionItems = React.useMemo(() => {
    const pendingApprovals =
      dailySettlements.filter((settlement) => settlement.status === 'pending').length +
      transactions.filter((tx) =>
        (tx.expenses > 0 && tx.expenseStatus === 'pending') ||
        (tx.isAnomaly === true && tx.approvalStatus !== 'approved' && tx.approvalStatus !== 'rejected') ||
        (tx.type === 'reset_request' && tx.approvalStatus === 'pending') ||
        (tx.type === 'payout_request' && tx.approvalStatus === 'pending')
      ).length;

    const attentionSiteIds = new Set(
      locations
        .filter((location) => location.status !== 'active' || location.resetLocked || location.lastScore >= 9000)
        .map((location) => location.id)
    );
    bossStats.stagnantMachines.forEach((location) => attentionSiteIds.add(location.id));

    const pendingPayrolls = monthlyPayrolls.filter((payroll) => payroll.status === 'pending').length;

    return [
      {
        key: 'approvals',
        title: t.approvalCenter,
        count: pendingApprovals,
        subtitle: t.pendingApproval,
        detail: lang === 'zh' ? '结算、费用、异常、重置、提现待处理' : 'Settlements, expenses, anomalies, reset and payout need review',
        tone: 'border-amber-100 bg-amber-50 text-amber-700',
        severity: 4,
        action: 'settlement' as const,
      },
      {
        key: 'sites',
        title: t.attentionSites,
        count: attentionSiteIds.size,
        subtitle: lang === 'zh' ? '异常点位' : 'Attention sites',
        detail: lang === 'zh' ? '异常、锁定、9999 风险和静默点位' : 'Abnormal, locked, near-9999 and silent locations',
        tone: 'border-slate-200 bg-slate-100 text-slate-700',
        severity: 3,
        action: 'locations' as const,
      },
      {
        key: 'riskyAssets',
        title: t.highRiskAssets,
        count: bossStats.riskyDrivers.length,
        subtitle: lang === 'zh' ? '高风险司机' : 'High-risk drivers',
        detail: lang === 'zh' ? '异常收入方差或连续短缺的司机' : 'Drivers with abnormal revenue variance or consecutive shortages',
        tone: 'border-amber-100 bg-amber-50 text-amber-700',
        severity: 2,
        action: 'team' as const,
      },
      {
        key: 'payroll',
        title: t.payrollTitle,
        count: pendingPayrolls,
        subtitle: t.pendingSettlementShort,
        detail: lang === 'zh' ? '待生成、待支付或待取消的工资单' : 'Payrolls waiting to generate, pay or cancel',
        tone: 'border-amber-100 bg-amber-50 text-amber-700',
        severity: 1,
        action: 'team' as const,
      },
      {
        key: 'sync',
        title: t.unsyncedLabel,
        count: unsyncedCount,
        subtitle: t.historyLog,
        detail: lang === 'zh' ? '待同步记录和轨迹审计异常' : 'Unsynced records and tracking audit issues',
        tone: 'border-slate-200 bg-slate-100 text-slate-700',
        severity: 0,
        action: 'tracking' as const,
      },
    ];
  }, [bossStats.stagnantMachines, bossStats.riskyDrivers.length, dailySettlements, lang, locations, monthlyPayrolls, t, transactions, unsyncedCount]);
  const actionableItems = React.useMemo(
    () => todayActionItems.filter((item) => item.count > 0).sort((a, b) => b.severity - a.severity),
    [todayActionItems]
  );
  const primaryAction = actionableItems[0] ?? null;
  const queuedActions = actionableItems.slice(1);

  return (
    <div className="space-y-3 animate-in fade-in">
      {revDrilldown === 'none' ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr] gap-2">
            <button
              onClick={() => setRevDrilldown('drivers')}
            className="col-span-2 lg:col-span-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-all hover:border-amber-200 hover:bg-amber-50/40 group"
            >
              <p className="text-caption font-black uppercase text-slate-400 group-hover:text-amber-700 transition-colors">{t.revenue} ↗</p>
              <p className="mt-0.5 text-xl font-black text-slate-900">TZS {bossStats.todayRev.toLocaleString()}</p>
            </button>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-caption font-black uppercase text-slate-400">{t.attentionSites}</p>
              <p className="mt-0.5 text-xl font-black text-slate-700">{bossStats.stagnantMachines.length}</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-caption font-black uppercase text-amber-500">{t.highRiskAssets}</p>
              <p className="mt-0.5 text-xl font-black text-amber-700">{bossStats.riskyDrivers.length}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-caption font-black uppercase tracking-[0.25em] text-slate-400">{t.actionCenter}</p>
                <h3 className="mt-0.5 text-sm font-black uppercase text-slate-900">{t.todayActionCenter}</h3>
              </div>
              <p className="text-caption font-bold uppercase tracking-wide text-slate-300">{t.reviewNow}</p>
            </div>
            {primaryAction ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => onOpenTab?.(primaryAction.action)}
                  className="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-left text-white transition-colors hover:bg-slate-900"
                >
                  <div className="min-w-0">
                    <p className="text-caption font-black uppercase tracking-[0.22em] text-white/55">{t.reviewNow}</p>
                    <h4 className="mt-0.5 text-sm font-black uppercase">{primaryAction.title}</h4>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">{primaryAction.subtitle}</p>
                    <p className="mt-1 max-w-xl text-[11px] font-bold leading-relaxed text-white/80">{primaryAction.detail}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-amber-400 px-3 py-1 text-caption font-black uppercase text-slate-950">
                      {primaryAction.count}
                    </span>
                    <ArrowRight size={15} className="text-white/50" />
                  </div>
                </button>
                {queuedActions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="px-1 text-caption font-black uppercase tracking-[0.22em] text-slate-400">{t.nextActionQueue}</p>
                    <div className="grid gap-1.5 md:grid-cols-2">
                      {queuedActions.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => onOpenTab?.(item.action)}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-left transition-colors hover:border-amber-200 hover:bg-amber-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-caption font-black uppercase tracking-wide text-slate-900">{item.title}</p>
                            <p className="mt-0.5 truncate text-caption font-bold uppercase tracking-[0.18em] text-slate-400">{item.subtitle}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-caption font-black uppercase ${item.tone}`}>
                              {item.count}
                            </span>
                            <ArrowRight size={14} className="text-slate-300" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                <p className="text-caption font-black uppercase tracking-[0.2em] text-amber-600">{t.allQueuesClear}</p>
                <p className="mt-1 text-sm font-black text-amber-800">{t.noUrgentWork}</p>
                <p className="mt-1 text-[11px] font-bold leading-relaxed text-emerald-700/80">
                  {lang === 'zh'
                    ? '审批、网点风险、工资和同步队列目前都没有堆积，可以转去看营收和轨迹。'
                    : 'Approvals, site risks, payroll, and sync queues are currently clear. Move on to revenue and tracking review.'}
                </p>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setAiInsightsExpanded(p => !p)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <BrainCircuit size={14} className="text-amber-500" />
                <span className="text-caption font-black uppercase tracking-widest text-slate-600">AI 智能分析</span>
              </div>
              <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${aiInsightsExpanded ? 'rotate-180' : ''}`} />
            </button>
            {aiInsightsExpanded && (
              <div className="px-4 pb-4 border-t border-slate-100">
                <SmartInsights transactions={transactions} locations={locations} drivers={drivers} lang={lang} onNavigate={onOpenTab} />
              </div>
            )}
          </div>
        </>
      ) : revDrilldown === 'drivers' ? (
        <div className="space-y-3 animate-in fade-in">
          <div className="flex items-center gap-3 mb-1">
            <button type="button" aria-label={t.back} onClick={() => setRevDrilldown('none')} className="p-1.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50"><ArrowRight size={16} className="rotate-180" /></button>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase">{t.revenue} — {t.byDriver}</h3>
              <p className="text-[10px] text-slate-400 font-bold">{t.todayRevenueByDriver}</p>
            </div>
          </div>
          {todayDriverStats.map(({ driver, driverTxs, driverRev, driverCommission, driverNet }) => (
            <div key={driver.id} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm">{driver.name.charAt(0)}</div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{driver.name}</p>
                    <p className="text-caption font-bold text-slate-400 uppercase">{driver.phone} • {driverTxs.length} {t.collectionsShort}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-amber-600">TZS {driverRev.toLocaleString()}</p>
                  <p className="text-caption font-bold text-slate-400 uppercase">{t.totalRevenue}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center">
                  <p className="text-caption font-black text-slate-400 uppercase">{t.revenue}</p>
                  <p className="text-caption font-black text-slate-800">TZS {driverRev.toLocaleString()}</p>
                </div>
                <div className="bg-amber-50 p-2 rounded-xl border border-amber-100 text-center">
                  <p className="text-caption font-black text-amber-400 uppercase">{t.ownerDivision}</p>
                  <p className="text-caption font-black text-amber-700">TZS {driverCommission.toLocaleString()}</p>
                </div>
                <div className="bg-amber-50 p-2 rounded-xl border border-amber-100 text-center">
                  <p className="text-caption font-black text-amber-400 uppercase">{t.netCash}</p>
                  <p className="text-caption font-black text-amber-700">TZS {driverNet.toLocaleString()}</p>
                </div>
              </div>
              {driverTxs.length > 0 && (
                <div className="space-y-1.5 border-t border-slate-50 pt-2">
                  {driverTxs.map(tx => {
                    const loc = locationMap.get(tx.locationId);
                    return (
                      <div key={tx.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-2">
                          {loc?.machinePhotoUrl ? (
                            <img src={getOptimizedImageUrl(loc.machinePhotoUrl, 100, 100)} alt="machine" className="w-6 h-6 rounded-lg object-cover border border-slate-200" />
                          ) : (
                            <div className="w-6 h-6 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400"><Store size={11} /></div>
                          )}
                          <div>
                            <p className="text-caption font-black text-slate-900">{tx.locationName}</p>
                            <p className="text-caption font-bold text-slate-400 uppercase">{loc?.machineId || '-'} • {new Date(tx.timestamp).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-caption font-black text-slate-900">TZS {tx.revenue.toLocaleString()}</p>
                          <div className="flex gap-1 justify-end mt-0.5">
                            <span className="text-caption font-bold text-amber-500 bg-amber-50 px-1 py-0.5 rounded">div {tx.ownerRetention.toLocaleString()}</span>
                            <span className="text-caption font-bold text-amber-600 bg-amber-50 px-1 py-0.5 rounded">net {tx.netPayable.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default React.memo(OverviewTab);
