
import { describe, it, expect } from 'vitest';
import { CONSTANTS } from './types';

// Mock calculation logic similar to CollectionForm.tsx
function calculateRevenue(currentScore: number, lastScore: number, commissionRate: number, remainingDebt: number) {
    const diff = Math.max(0, currentScore - lastScore);
    const revenue = diff * CONSTANTS.COIN_VALUE_TZS; 
    const commission = Math.floor(revenue * commissionRate);
    
    // Auto-recovery logic: 10% of revenue or remaining debt, whichever is smaller
    const startupDeduction = remainingDebt > 0 
      ? Math.min(remainingDebt, Math.floor(revenue * CONSTANTS.DEBT_RECOVERY_RATE))
      : 0;
      
    const netPayable = revenue - commission - startupDeduction;
    
    return { revenue, commission, startupDeduction, netPayable };
}

describe('Business Revenue Logic', () => {
  it('should calculate revenue correctly (1 coin = 200 TZS)', () => {
    const result = calculateRevenue(100, 0, 0.15, 0);
    expect(result.revenue).toBe(20000);
  });

  it('should calculate commission correctly (15% by default)', () => {
    const result = calculateRevenue(100, 0, 0.15, 0);
    expect(result.commission).toBe(3000);
  });

  it('should auto-deduct startup debt correctly (10% of revenue)', () => {
    // If debt is 5000 and revenue is 20000, 10% of 20000 is 2000.
    const result = calculateRevenue(100, 0, 0.15, 5000);
    expect(result.startupDeduction).toBe(2000);
    expect(result.netPayable).toBe(20000 - 3000 - 2000);
  });

  it('should not deduct more than the remaining debt', () => {
    // If debt is 500 and 10% of revenue is 2000, it should only deduct 500.
    const result = calculateRevenue(100, 0, 0.15, 500);
    expect(result.startupDeduction).toBe(500);
    expect(result.netPayable).toBe(20000 - 3000 - 500);
  });
});
