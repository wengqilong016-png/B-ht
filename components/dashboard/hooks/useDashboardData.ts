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
    () => myTransactions.filter(t => t.timestamp.startsWith(todayStr)),
    [myTransactions, todayStr]
  );

  const myProfile = useMemo(
    () => drivers.find(d => d.id === (isAdmin ? drivers[0]?.id : activeDriverId)),
    [activeDriverId, drivers, isAdmin]
  );

  const totalArrears = useMemo(
    () => myTransactions.filter(tx => tx.paymentStatus === 'unpaid').reduce((sum, tx) => sum + tx.netPayable, 0),
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

  const anomalyTransactions = useMemo(
    () => transactions.filter(tx => tx.isAnomaly === true && tx.approvalStatus !== 'approved' && tx.approvalStatus !== 'rejected'),
    [transactions]
  );

  const pendingResetRequests = useMemo(
    () => transactions.filter(tx => tx.type === 'reset_request' && tx.approvalStatus === 'pending'),
    [transactions]
  );

  const pendingPayoutRequests = useMemo(
    () => transactions.filter(tx => tx.type === 'payout_request' && tx.approvalStatus === 'pending'),
    [transactions]
  );

  // Revenue drill-down: per-driver today stats
  const todayDriverStats = useMemo(() => {
    const txByDriver = new Map<string, Transaction[]>();
    for (const t of transactions) {
      if (!t.timestamp.startsWith(todayStr)) continue;
      const arr = txByDriver.get(t.driverId);
      if (arr) arr.push(t);
      else txByDriver.set(t.driverId, [t]);
    }
    return drivers.map(driver => {
      const driverTxs = txByDriver.get(driver.id) ?? [];
      const driverRev = driverTxs.reduce((s, t) => s + t.revenue, 0);
      const driverCommission = driverTxs.reduce((s, t) => s + t.ownerRetention, 0);
      const driverNet = driverTxs.reduce((s, t) => s + t.netPayable, 0);
      return { driver, driverTxs, driverRev, driverCommission, driverNet };
    });
  }, [drivers, transactions, todayStr]);

  // Payroll System
  const payrollStats = useMemo(() => {
    const months = Array.from(new Set(transactions.map(t => t.timestamp.substring(0, 7)))).sort().reverse();
    const txByDriver = new Map<string, Transaction[]>();
    transactions.forEach(t => {
      const arr = txByDriver.get(t.driverId);
      if (arr) arr.push(t);
      else txByDriver.set(t.driverId, [t]);
    });
    const settlementByDriver = new Map<string, DailySettlement[]>();
    dailySettlements.filter(s => s.status === 'confirmed').forEach(s => {
      const arr = settlementByDriver.get(s.driverId);
      if (arr) arr.push(s);
      else settlementByDriver.set(s.driverId, [s]);
    });
    return drivers.filter(d => d.status === 'active').map(driver => {
      const driverTxs = txByDriver.get(driver.id) ?? [];
      const driverSettlements = settlementByDriver.get(driver.id) ?? [];
      const monthlyBreakdown = (months as string[]).map((month: string) => {
        const monthTxs = driverTxs.filter(t => t.timestamp.startsWith(month));
        const monthSettlements = driverSettlements.filter(s => s.date.startsWith(month));
        const totalRevenue = monthTxs.reduce((sum, t) => sum + t.revenue, 0);
        const commission = Math.floor(totalRevenue * (driver.commissionRate || 0.05));
        const loans = monthTxs.filter(t => t.expenseType === 'private').reduce((sum, t) => sum + t.expenses, 0);
        const shortage = monthSettlements.reduce((sum, s) => sum + (s.shortage < 0 ? Math.abs(s.shortage) : 0), 0);
        const netPayout = (driver.baseSalary || 0) + commission - loans - shortage;
        return { month, totalRevenue, commission, loans, shortage, netPayout };
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

  const filteredAiLogs = useMemo(() => {
    let result = aiLogs;
    if (aiLogSearch) {
      const q = aiLogSearch.toLowerCase();
      result = result.filter(log => log.driverName.toLowerCase().includes(q) || log.query.toLowerCase().includes(q) || log.response.toLowerCase().includes(q));
    }
    if (aiLogTypeFilter === 'image') result = result.filter(log => !!log.imageUrl);
    return result;
  }, [aiLogs, aiLogSearch, aiLogTypeFilter]);

  const bossStats = useMemo(() => {
    const todayRev = transactions.filter(t => t.timestamp.startsWith(todayStr)).reduce((sum, t) => sum + t.revenue, 0);
    const riskyDrivers = drivers.filter(d => d.remainingDebt > 100000);
    return { todayRev, riskyDrivers, stagnantMachines: locations.filter(l => l.status === 'broken') };
  }, [transactions, drivers, locations, todayStr]);

  const trackingDriverCards = useMemo(() => {
    const todayCollections = transactions.filter(
      t => t.timestamp.startsWith(todayStr) && (t.type === undefined || t.type === 'collection')
    );

    return drivers
      .map(driver => {
        const driverLocs = locations.filter(l => l.assignedDriverId === driver.id);
        const driverTxsToday = todayCollections.filter(t => t.driverId === driver.id);
        const todayRevenue = driverTxsToday.reduce((sum, tx) => sum + tx.netPayable, 0);
        const attentionLocations = driverLocs.filter(
          l => l.status !== 'active' || l.resetLocked || l.lastScore >= 9000
        );
        const lastActiveMinutes = driver.lastActive
          ? Math.floor((Date.now() - new Date(driver.lastActive).getTime()) / 60000)
          : null;
        const hasStaleGps = driver.status === 'active' && (lastActiveMinutes === null || lastActiveMinutes > 30);
        const searchBlob = [
          driver.name,
          driver.phone,
          driver.vehicleInfo?.plate,
          ...driverLocs.map(l => `${l.name} ${l.area} ${l.machineId}`),
        ].join(' ').toLowerCase();

        return { driver, driverLocs, driverTxsToday, todayRevenue, attentionLocations, lastActiveMinutes, hasStaleGps, searchBlob };
      })
      .filter(item => {
        const matchSearch = !trackingSearch || item.searchBlob.includes(trackingSearch.toLowerCase());
        const matchFilter =
          trackingStatusFilter === 'all' ||
          (trackingStatusFilter === 'attention' && item.attentionLocations.length > 0) ||
          (trackingStatusFilter === 'active' && item.driver.status === 'active' && !item.hasStaleGps) ||
          (trackingStatusFilter === 'stale' && item.hasStaleGps);
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

  const trackingOverview = useMemo(() => ({
    liveDrivers: trackingDriverCards.filter(item => item.driver.status === 'active' && !item.hasStaleGps).length,
    staleDrivers: trackingDriverCards.filter(item => item.hasStaleGps).length,
    todayCollections: trackingDriverCards.reduce((sum, item) => sum + item.driverTxsToday.length, 0),
    attentionSites: trackingDriverCards.reduce((sum, item) => sum + item.attentionLocations.length, 0),
  }), [trackingDriverCards]);

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
