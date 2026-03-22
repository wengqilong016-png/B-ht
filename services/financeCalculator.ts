import { CONSTANTS, Location } from '../types';
import { supabase } from '../supabaseClient';

export type FinanceCalculationSource = 'local' | 'server';

export interface FinanceCalculationResult {
  diff: number;
  revenue: number;
  commission: number;
  finalRetention: number;
  netPayable: number;
  remainingCoins: number;
  isCoinStockNegative: boolean;
  source: FinanceCalculationSource;
}

export interface CollectionFinanceInput {
  selectedLocation: Location | null | undefined;
  currentScore: string;
  expenses: string;
  coinExchange: string;
  ownerRetention: string;
  isOwnerRetaining: boolean;
  tip: string;
  initialFloat?: number;
}

const EMPTY_RESULT: FinanceCalculationResult = {
  diff: 0,
  revenue: 0,
  commission: 0,
  finalRetention: 0,
  netPayable: 0,
  remainingCoins: 0,
  isCoinStockNegative: false,
  source: 'local',
};

export function calculateCollectionFinanceLocal(input: CollectionFinanceInput): FinanceCalculationResult {
  const { selectedLocation } = input;
  if (!selectedLocation) return { ...EMPTY_RESULT };

  const score = parseInt(input.currentScore, 10) || 0;
  const diff = Math.max(0, score - selectedLocation.lastScore);
  const revenue = diff * CONSTANTS.COIN_VALUE_TZS;
  const commissionRate = selectedLocation.commissionRate || CONSTANTS.DEFAULT_PROFIT_SHARE;
  const commission = Math.floor(revenue * commissionRate);

  let finalRetention = 0;
  if (input.isOwnerRetaining) {
    finalRetention = input.ownerRetention !== '' ? parseInt(input.ownerRetention, 10) || 0 : commission;
  }

  const expenseValue = parseInt(input.expenses, 10) || 0;
  const tipValue = parseInt(input.tip, 10) || 0;
  const netPayable = Math.max(0, revenue - finalRetention - expenseValue - tipValue);
  const exchangeValue = parseInt(input.coinExchange, 10) || 0;
  const initialFloat = input.initialFloat || 0;
  const remainingCoins = initialFloat + netPayable - exchangeValue;

  return {
    diff,
    revenue,
    commission,
    finalRetention,
    netPayable,
    remainingCoins,
    isCoinStockNegative: remainingCoins < 0,
    source: 'local',
  };
}

export async function calculateCollectionFinancePreview(
  input: CollectionFinanceInput,
): Promise<FinanceCalculationResult> {
  const fallback = calculateCollectionFinanceLocal(input);
  const { selectedLocation } = input;

  if (!selectedLocation || !input.currentScore.trim()) {
    return fallback;
  }

  try {
    const { data, error } = await supabase.rpc('calculate_finance_v2', {
      p_current_score: parseInt(input.currentScore, 10) || 0,
      p_previous_score: selectedLocation.lastScore,
      p_commission_rate: selectedLocation.commissionRate || CONSTANTS.DEFAULT_PROFIT_SHARE,
      p_expenses: parseInt(input.expenses, 10) || 0,
      p_tip: parseInt(input.tip, 10) || 0,
      p_is_owner_retaining: input.isOwnerRetaining,
      p_owner_retention: input.isOwnerRetaining && input.ownerRetention !== ''
        ? parseInt(input.ownerRetention, 10) || 0
        : null,
    });

    if (error || !data) {
      return fallback;
    }

    const payload = data as Partial<Record<'diff' | 'revenue' | 'commission' | 'finalRetention' | 'netPayable', number>>;
    const exchangeValue = parseInt(input.coinExchange, 10) || 0;
    const initialFloat = input.initialFloat || 0;
    const netPayable = Number(payload.netPayable ?? fallback.netPayable);
    const remainingCoins = initialFloat + netPayable - exchangeValue;

    return {
      diff: Number(payload.diff ?? fallback.diff),
      revenue: Number(payload.revenue ?? fallback.revenue),
      commission: Number(payload.commission ?? fallback.commission),
      finalRetention: Number(payload.finalRetention ?? fallback.finalRetention),
      netPayable,
      remainingCoins,
      isCoinStockNegative: remainingCoins < 0,
      source: 'server',
    };
  } catch {
    return fallback;
  }
}
