import { supabase } from '../supabaseClient';
import { CONSTANTS, Location } from '../types';

export type FinanceCalculationSource = 'local' | 'server';

export interface FinanceCalculationResult {
  diff: number;
  revenue: number;
  commission: number;
  finalRetention: number;
  startupDebtDeduction: number;
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
  startupDebtDeduction: string;
  initialFloat?: number;
}

interface NormalizedFinanceInput {
  currentScore: number;
  expenses: number;
  tip: number;
  startupDebtDeductionRequest: number;
  ownerRetention: number | null;
  initialFloat: number;
  coinExchange: number;
}

type FinanceRpcPayload = Partial<Record<
  'diff' | 'revenue' | 'commission' | 'finalRetention' | 'startupDebtDeduction' | 'netPayable',
  number
>>;

function parseAmount(value: string): number {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return 0;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

const EMPTY_RESULT: FinanceCalculationResult = {
  diff: 0,
  revenue: 0,
  commission: 0,
  finalRetention: 0,
  startupDebtDeduction: 0,
  netPayable: 0,
  remainingCoins: 0,
  isCoinStockNegative: false,
  source: 'local',
};

function normalizeFinanceInput(input: CollectionFinanceInput): NormalizedFinanceInput {
  return {
    currentScore: parseInt(input.currentScore, 10) || 0,
    expenses: parseInt(input.expenses, 10) || 0,
    tip: parseInt(input.tip, 10) || 0,
    startupDebtDeductionRequest: Math.max(0, parseInt(input.startupDebtDeduction, 10) || 0),
    ownerRetention: input.ownerRetention !== '' ? parseAmount(input.ownerRetention) : null,
    initialFloat: input.initialFloat || 0,
    coinExchange: parseInt(input.coinExchange, 10) || 0,
  };
}

function calculateRemainingCoins(initialFloat: number, netPayable: number, coinExchange: number): number {
  return initialFloat + netPayable - coinExchange;
}

function buildServerFinanceResult(
  payload: FinanceRpcPayload,
  fallback: FinanceCalculationResult,
  normalized: NormalizedFinanceInput,
): FinanceCalculationResult {
  const netPayable = Number(payload.netPayable ?? fallback.netPayable);
  const remainingCoins = calculateRemainingCoins(normalized.initialFloat, netPayable, normalized.coinExchange);

  return {
    diff: Number(payload.diff ?? fallback.diff),
    revenue: Number(payload.revenue ?? fallback.revenue),
    commission: Number(payload.commission ?? fallback.commission),
    finalRetention: Number(payload.finalRetention ?? fallback.finalRetention),
    startupDebtDeduction: Number(payload.startupDebtDeduction ?? fallback.startupDebtDeduction),
    netPayable,
    remainingCoins,
    isCoinStockNegative: remainingCoins < 0,
    source: 'server',
  };
}

export function calculateCollectionFinanceLocal(input: CollectionFinanceInput): FinanceCalculationResult {
  const { selectedLocation } = input;
  if (!selectedLocation) return { ...EMPTY_RESULT };
  const normalized = normalizeFinanceInput(input);

  const diff = Math.max(0, normalized.currentScore - selectedLocation.lastScore);
  const revenue = diff * CONSTANTS.COIN_VALUE_TZS;
  const commissionRate = selectedLocation.commissionRate || CONSTANTS.DEFAULT_PROFIT_SHARE;
  const commission = Math.floor(revenue * commissionRate);

  const finalRetention = input.isOwnerRetaining
    ? (normalized.ownerRetention ?? commission)
    : 0;

  const remainingStartupDebt = Math.max(0, selectedLocation.remainingStartupDebt || 0);
  const availableAfterCoreDeductions = Math.max(0, revenue - finalRetention - normalized.expenses - normalized.tip);
  const startupDebtDeduction = Math.min(
    normalized.startupDebtDeductionRequest,
    remainingStartupDebt,
    availableAfterCoreDeductions,
  );
  const netPayable = Math.max(0, availableAfterCoreDeductions - startupDebtDeduction);
  const remainingCoins = calculateRemainingCoins(normalized.initialFloat, netPayable, normalized.coinExchange);

  return {
    diff,
    revenue,
    commission,
    finalRetention,
    startupDebtDeduction,
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
  const normalized = normalizeFinanceInput(input);

  if (!selectedLocation || !input.currentScore.trim()) {
    return fallback;
  }

  try {
    if (!supabase) {
      return fallback;
    }
    const { data, error } = await supabase.rpc('calculate_finance_v2', {
      p_current_score: normalized.currentScore,
      p_previous_score: selectedLocation.lastScore,
      p_commission_rate: selectedLocation.commissionRate || CONSTANTS.DEFAULT_PROFIT_SHARE,
      p_expenses: normalized.expenses,
      p_tip: normalized.tip,
      p_is_owner_retaining: input.isOwnerRetaining,
      p_owner_retention: normalized.ownerRetention,
      p_startup_debt_deduction_request: normalized.startupDebtDeductionRequest,
      p_startup_debt_balance: Math.max(0, selectedLocation.remainingStartupDebt || 0),
    }).abortSignal(AbortSignal.timeout(10_000));

    if (error || !data) {
      return fallback;
    }

    return buildServerFinanceResult(data as FinanceRpcPayload, fallback, normalized);
  } catch (error) {
    console.warn('Failed to calculate finance preview from server RPC.', error);
    return fallback;
  }
}
