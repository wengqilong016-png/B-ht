import { useState, useCallback, useMemo } from 'react';
import type { Location, Driver, Transaction, DailySettlement } from '../types';
import { getTodayLocalDate } from '../utils/dateUtils';
import type { AdminAIMessage, SystemSnapshot } from '../api/admin-ai';

export type { AdminAIMessage };

export interface AdminAIAlert {
  id: string;
  level: 'urgent' | 'warning' | 'info';
  title: string;
  body: string;
  action?: string;
}

export interface UseAdminAIReturn {
  alerts: AdminAIAlert[];
  alertCount: number;
  messages: AdminAIMessage[];
  isLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearHistory: () => void;
  snapshot: SystemSnapshot;
}

function buildSnapshot(
  locations: Location[],
  drivers: Driver[],
  transactions: Transaction[],
  settlements: DailySettlement[],
): SystemSnapshot {
  const today = getTodayLocalDate();

  const todayTxns = transactions.filter(
    (t) => t.timestamp.startsWith(today) && t.type !== 'expense',
  );
  const todayRevenue = todayTxns.reduce((s, t) => s + (t.revenue ?? 0), 0);
  const anomalyCount = todayTxns.filter((t) => t.isAnomaly).length;

  const pendingSettlements = settlements.filter((s) => s.status === 'pending').length;
  const pendingApprovals = settlements
    .filter((s) => s.status === 'pending')
    .slice(0, 5)
    .map((s) => ({
      driver: s.driverName ?? s.driverId ?? '—',
      date: s.date,
      amount: s.totalNetPayable,
    }));

  const activeLocations = locations.filter((l) => l.status === 'active');
  const activeDrivers = drivers.filter((d) => d.status !== 'inactive');

  // Machines not collected today
  const collectedLocationIds = new Set(todayTxns.map((t) => t.locationId));
  const locationsNotCollectedToday = activeLocations
    .filter((l) => !collectedLocationIds.has(l.id))
    .map((l) => l.machineId || l.name)
    .slice(0, 20);

  // Drivers with no collections today
  const activeDriverIds = new Set(todayTxns.map((t) => t.driverId));
  const driversWithNoCollectionToday = activeDrivers
    .filter((d) => !activeDriverIds.has(d.id))
    .map((d) => d.name);

  // Debt summary
  const debtLocations = locations.filter((l) => l.remainingStartupDebt > 0);
  const totalDebt = debtLocations.reduce((s, l) => s + l.remainingStartupDebt, 0);

  // Top anomalies (today)
  const topAnomalies = todayTxns
    .filter((t) => t.isAnomaly)
    .slice(0, 5)
    .map((t) => ({
      machine: locations.find((l) => l.id === t.locationId)?.machineId || t.locationName,
      driver: t.driverName ?? '—',
      revenue: t.revenue,
      note: t.notes ?? (t.aiScore !== undefined ? `AI评分: ${t.aiScore}` : ''),
    }));

  // Recent trend: compare last 7 days revenue vs prior 7 days
  const day7ago = new Date();
  day7ago.setDate(day7ago.getDate() - 7);
  const day14ago = new Date();
  day14ago.setDate(day14ago.getDate() - 14);
  const recent7 = transactions.filter(
    (t) =>
      t.timestamp >= day7ago.toISOString() &&
      t.timestamp <= new Date().toISOString() &&
      t.type !== 'expense',
  );
  const prior7 = transactions.filter(
    (t) =>
      t.timestamp >= day14ago.toISOString() &&
      t.timestamp < day7ago.toISOString() &&
      t.type !== 'expense',
  );
  const r7 = recent7.reduce((s, t) => s + t.revenue, 0);
  const p7 = prior7.reduce((s, t) => s + t.revenue, 0);
  let recentTrend = '';
  if (p7 > 0) {
    const pct = Math.round(((r7 - p7) / p7) * 100);
    recentTrend =
      pct >= 0
        ? `近7天营业额 TZS ${r7.toLocaleString()}，比前7天 ↑${pct}%`
        : `近7天营业额 TZS ${r7.toLocaleString()}，比前7天 ↓${Math.abs(pct)}%`;
  }

  return {
    today,
    totalLocations: locations.length,
    activeLocations: activeLocations.length,
    totalDrivers: drivers.length,
    activeDrivers: activeDrivers.length,
    todayCollections: todayTxns.length,
    todayRevenue,
    pendingSettlements,
    anomalyCount,
    unsyncedCount: transactions.filter((t) => !t.isSynced).length,
    debtLocations: debtLocations.length,
    totalDebt,
    locationsNotCollectedToday,
    driversWithNoCollectionToday,
    topAnomalies,
    pendingApprovals,
    recentTrend,
  };
}

function buildAlerts(snapshot: SystemSnapshot): AdminAIAlert[] {
  const alerts: AdminAIAlert[] = [];

  if (snapshot.pendingSettlements > 0) {
    alerts.push({
      id: 'pending-settlements',
      level: 'urgent',
      title: `${snapshot.pendingSettlements} 笔结算待审批`,
      body: snapshot.pendingApprovals
        .map((a) => `${a.driver} ${a.date} TZS ${a.amount.toLocaleString()}`)
        .join('；'),
      action: '前往审批中心',
    });
  }

  if (snapshot.anomalyCount > 0) {
    alerts.push({
      id: 'anomalies',
      level: 'warning',
      title: `今日 ${snapshot.anomalyCount} 笔异常交易`,
      body:
        snapshot.topAnomalies.length > 0
          ? snapshot.topAnomalies.map((a) => `${a.machine}（${a.driver}）`).join('、')
          : '请到收款审批查看详情',
      action: '查看异常交易',
    });
  }

  if (snapshot.locationsNotCollectedToday.length > 0) {
    alerts.push({
      id: 'missing-collections',
      level: snapshot.locationsNotCollectedToday.length >= 3 ? 'warning' : 'info',
      title: `${snapshot.locationsNotCollectedToday.length} 台机器今日未收款`,
      body: snapshot.locationsNotCollectedToday.slice(0, 5).join('、') + (snapshot.locationsNotCollectedToday.length > 5 ? ' 等' : ''),
    });
  }

  if (snapshot.driversWithNoCollectionToday.length > 0) {
    alerts.push({
      id: 'inactive-drivers',
      level: 'info',
      title: `${snapshot.driversWithNoCollectionToday.length} 位司机今日无出勤`,
      body: snapshot.driversWithNoCollectionToday.join('、'),
    });
  }

  if (snapshot.unsyncedCount > 5) {
    alerts.push({
      id: 'unsynced',
      level: 'warning',
      title: `${snapshot.unsyncedCount} 条数据未同步`,
      body: '部分数据可能尚未上传到云端，请确保网络连接正常。',
    });
  }

  if (snapshot.debtLocations > 0) {
    alerts.push({
      id: 'debt',
      level: 'info',
      title: `${snapshot.debtLocations} 台机器有启动债务`,
      body: `未还总额 TZS ${snapshot.totalDebt.toLocaleString()}`,
      action: '查看债务管理',
    });
  }

  return alerts;
}

export function useAdminAI(
  locations: Location[],
  drivers: Driver[],
  transactions: Transaction[],
  settlements: DailySettlement[],
): UseAdminAIReturn {
  const [messages, setMessages] = useState<AdminAIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const snapshot = useMemo(
    () => buildSnapshot(locations, drivers, transactions, settlements),
    // Recompute when data changes (throttle: only on length/key field changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      locations.length,
      drivers.length,
      transactions.length,
      settlements.length,
    ],
  );

  const alerts = useMemo(() => buildAlerts(snapshot), [snapshot]);
  const alertCount = alerts.filter((a) => a.level === 'urgent' || a.level === 'warning').length;

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: AdminAIMessage = { role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const res = await fetch('/api/admin-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: messages,
            snapshot,
          }),
        });

        const data = (await res.json()) as { reply?: string; error?: string };
        const reply = data.reply ?? data.error ?? '（无响应）';
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : '网络错误';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `请求失败：${errMsg}` },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, snapshot],
  );

  const clearHistory = useCallback(() => setMessages([]), []);

  return { alerts, alertCount, messages, isLoading, sendMessage, clearHistory, snapshot };
}
