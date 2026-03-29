export type SupabaseDataUserRole = 'admin' | 'driver' | null | undefined;

export interface QueryScope {
  cacheScope: string;
  driverIdFilter?: string;
  enabled: boolean;
}

export interface TransactionQueryScope extends QueryScope {
  txLimit: number;
}

export interface SettlementQueryScope extends QueryScope {
  settlementLimit: number;
}

export const TX_LIMIT_ADMIN = 500;
export const TX_LIMIT_DRIVER = 100;

export const SETTLEMENT_LIMIT_ADMIN = 200;
export const SETTLEMENT_LIMIT_DRIVER = 50;

export function getTransactionQueryScope(
  userRole: SupabaseDataUserRole,
  activeDriverId?: string,
): TransactionQueryScope {
  if (userRole === 'driver') {
    return {
      cacheScope: activeDriverId ? `driver:${activeDriverId}` : 'driver:pending',
      driverIdFilter: activeDriverId,
      enabled: !!activeDriverId,
      txLimit: TX_LIMIT_DRIVER,
    };
  }

  return {
    cacheScope: 'admin',
    enabled: true,
    txLimit: TX_LIMIT_ADMIN,
  };
}

export function getSettlementQueryScope(
  userRole: SupabaseDataUserRole,
  activeDriverId?: string,
): SettlementQueryScope {
  if (userRole === 'driver') {
    return {
      cacheScope: activeDriverId ? `driver:${activeDriverId}` : 'driver:pending',
      driverIdFilter: activeDriverId,
      enabled: !!activeDriverId,
      settlementLimit: SETTLEMENT_LIMIT_DRIVER,
    };
  }

  return {
    cacheScope: 'admin',
    enabled: true,
    settlementLimit: SETTLEMENT_LIMIT_ADMIN,
  };
}
