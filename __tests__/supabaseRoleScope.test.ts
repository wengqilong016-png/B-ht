import { describe, expect, it } from '@jest/globals';

import {
  TX_LIMIT_ADMIN,
  TX_LIMIT_DRIVER,
  SETTLEMENT_LIMIT_ADMIN,
  SETTLEMENT_LIMIT_DRIVER,
  getSettlementQueryScope,
  getTransactionQueryScope,
} from '../services/supabaseRoleScope';

describe('supabaseRoleScope', () => {
  it('uses admin transaction scope by default', () => {
    expect(getTransactionQueryScope('admin')).toEqual({
      cacheScope: 'admin',
      enabled: true,
      txLimit: TX_LIMIT_ADMIN,
    });
  });

  it('uses driver-scoped transaction filters when driverId is available', () => {
    expect(getTransactionQueryScope('driver', 'drv-1')).toEqual({
      cacheScope: 'driver:drv-1',
      driverIdFilter: 'drv-1',
      enabled: true,
      txLimit: TX_LIMIT_DRIVER,
    });
  });

  it('disables driver transaction fetch until driver context is ready', () => {
    expect(getTransactionQueryScope('driver')).toEqual({
      cacheScope: 'driver:pending',
      driverIdFilter: undefined,
      enabled: false,
      txLimit: TX_LIMIT_DRIVER,
    });
  });

  it('uses driver-scoped settlement filters when driverId is available', () => {
    expect(getSettlementQueryScope('driver', 'drv-7')).toEqual({
      cacheScope: 'driver:drv-7',
      driverIdFilter: 'drv-7',
      enabled: true,
      settlementLimit: SETTLEMENT_LIMIT_DRIVER,
    });
  });

  it('disables driver settlement fetch until driver context is ready', () => {
    expect(getSettlementQueryScope('driver')).toEqual({
      cacheScope: 'driver:pending',
      driverIdFilter: undefined,
      enabled: false,
      settlementLimit: SETTLEMENT_LIMIT_DRIVER,
    });
  });

  it('treats null role as admin scope for transactions', () => {
    expect(getTransactionQueryScope(null)).toEqual({
      cacheScope: 'admin',
      enabled: true,
      txLimit: TX_LIMIT_ADMIN,
    });
  });

  it('treats undefined role as admin scope for transactions', () => {
    expect(getTransactionQueryScope(undefined)).toEqual({
      cacheScope: 'admin',
      enabled: true,
      txLimit: TX_LIMIT_ADMIN,
    });
  });

  it('treats null role as admin scope for settlements', () => {
    expect(getSettlementQueryScope(null)).toEqual({
      cacheScope: 'admin',
      enabled: true,
      settlementLimit: SETTLEMENT_LIMIT_ADMIN,
    });
  });

  it('treats undefined role as admin scope for settlements', () => {
    expect(getSettlementQueryScope(undefined)).toEqual({
      cacheScope: 'admin',
      enabled: true,
      settlementLimit: SETTLEMENT_LIMIT_ADMIN,
    });
  });
});
