import { useMemo } from 'react';
import { Driver, Transaction } from '../../../types';

export interface DriverWithStats extends Driver {
  stats: {
    totalRevenue: number;
    totalNet: number;
    collectionRate: number;
    txCount: number;
  };
}

export interface FleetStats {
  totalRev: number;
  avgCollection: number;
  totalDebt: number;
}

export function useDriverManagement(drivers: Driver[], transactions: Transaction[]) {
  const driversWithStats = useMemo<DriverWithStats[]>(() => {
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
        stats: { totalRevenue, totalNet, collectionRate, txCount: dTx.length }
      };
    });
  }, [drivers, transactions]);

  const fleetStats = useMemo<FleetStats>(() => {
    const totalRev = driversWithStats.reduce((sum, d) => sum + d.stats.totalRevenue, 0);
    const avgCollection = driversWithStats.length > 0
      ? driversWithStats.reduce((sum, d) => sum + d.stats.collectionRate, 0) / driversWithStats.length
      : 0;
    const totalDebt = driversWithStats.reduce((sum, d) => sum + d.remainingDebt, 0);
    return { totalRev, avgCollection, totalDebt };
  }, [driversWithStats]);

  return { driversWithStats, fleetStats };
}
