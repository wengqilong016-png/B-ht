import { describe, it, expect } from '@jest/globals';

import { shouldApplySettlementDriverCoinUpdate } from '../utils/settlementRules';

describe('shouldApplySettlementDriverCoinUpdate', () => {
  it('returns true only for confirmed settlements', () => {
    expect(shouldApplySettlementDriverCoinUpdate('confirmed')).toBe(true);
    expect(shouldApplySettlementDriverCoinUpdate('pending')).toBe(false);
    expect(shouldApplySettlementDriverCoinUpdate('rejected')).toBe(false);
  });
});
