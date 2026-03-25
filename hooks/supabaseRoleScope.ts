export type SupabaseDataUserRole = 'admin' | 'driver' | null | undefined;

export interface QueryScope {
  cacheScope: string;
  driverIdFilter?: string;
  enabled: boolean;
}

export interface TransactionQueryScope extends QueryScope {
  txLimit: number;
}

export const TX_LIMIT_ADMIN = 2000;
export const TX_LIMIT_DRIVER = 500;

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
): QueryScope {
  if (userRole === 'driver') {
    return {
      cacheScope: activeDriverId ? `driver:${activeDriverId}` : 'driver:pending',
      driverIdFilter: activeDriverId,
      enabled: !!activeDriverId,
    };
  }

  return {
    cacheScope: 'admin',
    enabled: true,
  };
}
