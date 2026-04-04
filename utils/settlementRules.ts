import type { DailySettlement } from '../types';

export function shouldApplySettlementDriverCoinUpdate(
  status: DailySettlement['status'] | undefined,
): boolean {
  return status === 'confirmed';
}
