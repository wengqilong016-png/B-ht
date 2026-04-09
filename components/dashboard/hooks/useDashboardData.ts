import { useMemo } from 'react';

import { Transaction, Driver, Location, DailySettlement, AILog, User as UserType } from '../../../types';

interface UseDashboardDataParams {
  transactions: Transaction[];
  drivers: Driver[];
  locations: Location[];
  dailySettlements: DailySettlement[];
  aiLogs: AILog[];
  currentUser: UserType;
  todayStr: string;
  trackingSearch: string;
  trackingStatusFilter: 'all' | 'attention' | 'active' | 'stale';
  siteSearch: string;
  siteFilterArea: string;
  siteSort: { key: 'name' | 'status' | 'lastScore' | 'commission'; direction: 'asc' | 'desc' };
  aiLogSearch: string;
  aiLogTypeFilter: 'all' | 'image' | 'text';
}

function groupByKey<T>(items: T[], getKey: (item: T) => string | null | undefined): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    const existing = grouped.get(key);
    if (existing) existing.push(item);
    else grouped.set(key, [item]);
  }
  return grouped;
}

function sumTransactions(
  transactions: Transaction[],
  selector: (transaction: Transaction) => number,
): number {
  let total = 0;
  for (const transaction of transactions) {
    total += selector(transaction);
  }
  return total;
}

function buildSearchBlob(driver: Driver, locations: Location[]): string {
  return [
    driver.name,
    driver.phone,
    driver.vehicleInfo?.plate,
    ...locations.map((location) => `${location.name} ${location.area} ${location.machineId}`),
  ].join(' ').toLowerCase();
}

function matchesTrackingFilter(
  trackingStatusFilter: UseDashboardDataParams['trackingStatusFilter'],
  item: {
    attentionLocations: Location[];
    hasStaleGps: boolean;
    driver: Driver;
  },
): boolean {
  return trackingStatusFilter === 'all'
    || (trackingStatusFilter === 'attention' && item.attentionLocations.length > 0)
    || (trackingStatusFilter === 'active' && item.driver.status === 'active' && !item.hasStaleGps)
    || (trackingStatusFilter === 'stale' && item.hasStaleGps);
}

export function useDashboardData({
  transactions,
  drivers,
  locations,
  dailySettlements,
  aiLogs,
  currentUser,
  todayStr,
  trackingSearch,
  trackingStatusFilter,
  siteSearch,
  siteFilterArea,
  siteSort,
  aiLogSearch,
  aiLogTypeFilter,
}: UseDashboardDataParams) {
  const isAdmin = currentUser.role === 'admin';
  const activeDriverId = currentUser.driverId ?? currentUser.id;

  // O(1) lookup maps
  const driverMap = useMemo(() => new Map(drivers.map(d => [d.id, d])), [drivers]);
  const locationMap = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);

  const myTransactions = useMemo(
    () => (isAdmin ? transactions : transactions.filter(t => t.driverId === activeDriverId)),
    [activeDriverId, transactions, isAdmin]
  );

  const todayDriverTxs = useMemo(
    () => myTransactions.filter(t => t.type === 'collection' && t.timestamp.startsWith(todayStr)),
    [myTransactions, todayStr]
  );

  const myProfile = useMemo(
    () => drivers.find(d => d.id === (isAdmin ? drivers[0]?.id : activeDriverId)),
    [activeDriverId, drivers, isAdmin]
  );

  const totalArrears = useMemo(
    () => myTransactions
      .filter(tx => tx.type === 'collection' && tx.paymentStatus === 'unpaid')
      .reduce((sum, tx) => sum + tx.netPayable, 0),
    [myTransactions]
  );

  const pendingExpenses = useMemo(
    () => transactions.filter(tx => tx.expenses > 0 && tx.expenseStatus === 'pending'),
    [transactions]
  );

  const pendingSettlements = useMemo(
    () => dailySettlements.filter(s => s.status === 'pending'),
    [dailySettlements]
  );

  // Single pass over transactions to populate three separate filtered lists,
  // replacing three independent O(n) filter calls with one O(n) loop.
  const { anomalyTransactions, pendingResetRequests, pendingPayoutRequests } = useMemo(() => {
    const anomaly: Transaction[] = [];
    const resets: Transaction[] = [];
    const payouts: Transaction[] = [];
    for (const tx of transactions) {
      if (tx.isAnomaly === true && tx.approvalStatus !== 'approved' && tx.approvalStatus !== 'rejected') {
        anomaly.push(tx);
      }
      if (tx.type === 'reset_request' && tx.approvalStatus === 'pending') {
        resets.push(tx);
      }
      if (tx.type === 'payout_request' && tx.approvalStatus === 'pending') {
        payouts.push(tx);
      }
    }
    return { anomalyTransactions: anomaly, pendingResetRequests: resets, pendingPayoutRequests: payouts };
  }, [transactions]);

  // Revenue drill-down: per-driver today stats
  const todayDriverStats = useMemo(() => {
    const txByDriver = new Map<string, Transaction[]>();
    for (const t of transactions) {
      if (!t.timestamp.startsWith(todayStr) || t.type !== 'collection') continue;
      const arr = txByDriver.get(t.driverId);
      if (arr) arr.push(t);
      else txByDriver.set(t.driverId, [t]);
    }
    return drivers.map(driver => {
      const driverTxs = txByDriver.get(driver.id) ?? [];
      // Single pass instead of three separate reduce() calls
      let driverRev = 0, driverCommission = 0, driverNet = 0;
      for (const t of driverTxs) {
        driverRev += t.revenue;
        driverCommission += t.ownerRetention;
        driverNet += t.netPayable;
      }
      return { driver, driverTxs, driverRev, driverCommission, driverNet };
    });
  }, [drivers, transactions, todayStr]);

  // Payroll System
  const payrollStats = useMemo(() => {
    const confirmedSettlements = dailySettlements.filter(s => s.status === 'confirmed');
    const paidCollections = transactions.filter(t => t.type === 'collection' && t.paymentStatus === 'paid');
    const months = Array.from(new Set([
      ...confirmedSettlements.map(s => s.date.substring(0, 7)),
      ...paidCollections.map(t => t.timestamp.substring(0, 7)),
    ])).sort().reverse();
    const txByDriver = groupByKey(paidCollections, (transaction) => transaction.driverId);
    const settlementByDriver = groupByKey(confirmedSettlements, (settlement) => settlement.driverId);
    return drivers.filter(d => d.status === 'active').map(driver => {
      const driverTxs = txByDriver.get(driver.id) ?? [];
      const driverSettlements = settlementByDriver.get(driver.id) ?? [];

      const txByMonth = groupByKey(driverTxs, (transaction) => transaction.timestamp.substring(0, 7));
      const settlByMonth = groupByKey(driverSettlements, (settlement) => settlement.date.substring(0, 7));

      const monthlyBreakdown = (months as string[]).map((month: string) => {
        const monthTxs = txByMonth.get(month) ?? [];
        const monthSettlements = settlByMonth.get(month) ?? [];
        const loans = sumTransactions(
          monthTxs,
          (transaction) => transaction.expenseType === 'private' ? transaction.expenses : 0,
        );
        const totalRevenue = monthSettlements.reduce((sum, settlement) => sum + settlement.totalRevenue, 0);
        const commission = Math.floor(totalRevenue * (driver.commissionRate || 0.05));
        const shortage = monthSettlements.reduce(
          (sum, settlement) => sum + (settlement.shortage < 0 ? Math.abs(settlement.shortage) : 0),
          0,
        );
        const netPayout = (driver.baseSalary || 0) + commission - loans - shortage;
        return { month, totalRevenue, commission, loans, shortage, netPayout, collectionCount: monthTxs.length };
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
      const valA = a[siteSort.key as keyof Location] as string | number;
      const valB = b[siteSort.key as keyof Location] as string | number;
      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });
  }, [locations, siteSearch, siteFilterArea, siteSort]);

  // Single filter pass avoids an intermediate array when both search and
  // type-filter conditions are active simultaneously.
  const filteredAiLogs = useMemo(() => {
    const q = aiLogSearch ? aiLogSearch.toLowerCase() : null;
    const imageOnly = aiLogTypeFilter === 'image';
    if (!q && !imageOnly) return aiLogs;
    return aiLogs.filter(log => {
      if (q && !(log.driverName.toLowerCase().includes(q) || log.query.toLowerCase().includes(q) || log.response.toLowerCase().includes(q))) return false;
      if (imageOnly && !log.imageUrl) return false;
      return true;
    });
  }, [aiLogs, aiLogSearch, aiLogTypeFilter]);

  const bossStats = useMemo(() => {
    // Single pass replaces .filter().reduce() (two iterations → one)
    let todayRev = 0;
    for (const t of transactions) {
      if (t.type === 'collection' && t.timestamp.startsWith(todayStr)) todayRev += t.revenue;
    }
    const riskyDrivers = drivers.filter(d => d.remainingDebt > 100000);
    return { todayRev, riskyDrivers, stagnantMachines: locations.filter(l => l.status === 'broken') };
  }, [transactions, drivers, locations, todayStr]);

  const trackingDriverCards = useMemo(() => {
    const locsByDriver = groupByKey(locations, (location) => location.assignedDriverId);
    const txTodayByDriver = groupByKey(
      transactions.filter((transaction) => transaction.timestamp.startsWith(todayStr) && (transaction.type === undefined || transaction.type === 'collection')),
      (transaction) => transaction.driverId,
    );

    return drivers
      .map(driver => {
        const driverLocs = locsByDriver.get(driver.id) ?? [];
        const driverTxsToday = txTodayByDriver.get(driver.id) ?? [];
        const todayRevenue = sumTransactions(driverTxsToday, (transaction) => transaction.netPayable);
        const attentionLocations = driverLocs.filter(
          l => l.status !== 'active' || l.resetLocked || l.lastScore >= 9000
        );
        const lastActiveMinutes = driver.lastActive
          ? Math.floor((Date.now() - new Date(driver.lastActive).getTime()) / 60000)
          : null;
        const hasStaleGps = driver.status === 'active' && (lastActiveMinutes === null || lastActiveMinutes > 30);
        const searchBlob = buildSearchBlob(driver, driverLocs);

        return { driver, driverLocs, driverTxsToday, todayRevenue, attentionLocations, lastActiveMinutes, hasStaleGps, searchBlob };
      })
      .filter(item => {
        const matchSearch = !trackingSearch || item.searchBlob.includes(trackingSearch.toLowerCase());
        const matchFilter = matchesTrackingFilter(trackingStatusFilter, item);
        return matchSearch && matchFilter;
      })
      .sort((a, b) => {
        if (b.hasStaleGps && !a.hasStaleGps) return 1;
        if (!b.hasStaleGps && a.hasStaleGps) return -1;
        if (b.attentionLocations.length !== a.attentionLocations.length) return b.attentionLocations.length - a.attentionLocations.length;
        if (b.driverTxsToday.length !== a.driverTxsToday.length) return b.driverTxsToday.length - a.driverTxsToday.length;
        return a.driver.name.localeCompare(b.driver.name);
      });
  }, [drivers, locations, transactions, todayStr, trackingSearch, trackingStatusFilter]);

  const trackingOverview = useMemo(() => {
    // Single pass instead of four separate filter()/reduce() calls
    let liveDrivers = 0, staleDrivers = 0, todayCollections = 0, attentionSites = 0;
    for (const item of trackingDriverCards) {
      if (item.hasStaleGps) staleDrivers++;
      else if (item.driver.status === 'active') liveDrivers++;
      todayCollections += item.driverTxsToday.length;
      attentionSites += item.attentionLocations.length;
    }
    return { liveDrivers, staleDrivers, todayCollections, attentionSites };
  }, [trackingDriverCards]);

  const trackingVisibleDriverIds = useMemo(() => new Set(trackingDriverCards.map(item => item.driver.id)), [trackingDriverCards]);

  const trackingVisibleLocations = useMemo(
    () => locations.filter(l => l.assignedDriverId && trackingVisibleDriverIds.has(l.assignedDriverId)),
    [locations, trackingVisibleDriverIds]
  );

  const trackingVisibleTransactions = useMemo(
    () => transactions.filter(t => trackingVisibleDriverIds.has(t.driverId)),
    [transactions, trackingVisibleDriverIds]
  );

  return {
    driverMap,
    locationMap,
    myTransactions,
    todayDriverTxs,
    myProfile,
    totalArrears,
    pendingExpenses,
    pendingSettlements,
    anomalyTransactions,
    pendingResetRequests,
    pendingPayoutRequests,
    todayDriverStats,
    payrollStats,
    allAreas,
    managedLocations,
    filteredAiLogs,
    bossStats,
    trackingDriverCards,
    trackingOverview,
    trackingVisibleLocations,
    trackingVisibleTransactions,
  };
}
