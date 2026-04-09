/** Pure functions for reading and writing the `daily_settlements` table. */

import { supabase } from '../supabaseClient';

import type { DailySettlement } from '../types/models';

const SETTLEMENT_FIELDS = [
  'id', 'date', 'adminId', 'adminName', 'driverId', 'driverName',
  'totalRevenue', 'totalNetPayable', 'totalExpenses', 'driverFloat',
  'expectedTotal', 'actualCash', 'actualCoins', 'shortage', 'note',
  'timestamp', 'transferProofUrl', 'checkInAt', 'checkOutAt',
  'checkInGps', 'checkOutGps', 'hasCheckedIn', 'hasCheckedOut', 'status',
].join(', ');

export interface FetchSettlementsOptions {
  driverIdFilter?: string;
  limit?: number;
  signal?: AbortSignal;
}

export async function fetchSettlements(opts: FetchSettlementsOptions = {}): Promise<DailySettlement[]> {
  if (!supabase) throw new Error('Supabase client unavailable');
  let query = supabase
    .from('daily_settlements')
    .select(SETTLEMENT_FIELDS)
    .order('timestamp', { ascending: false });
  if (opts.driverIdFilter) query = query.eq('driverId', opts.driverIdFilter);
  if (opts.limit) query = query.limit(opts.limit);
  if (opts.signal) query.abortSignal(opts.signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as DailySettlement[];
}

export async function upsertSettlement(settlement: Partial<DailySettlement>): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { error } = await supabase.from('daily_settlements').upsert(settlement);
  if (error) throw error;
}

export async function createSettlement(settlement: DailySettlement): Promise<DailySettlement> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { data, error } = await supabase.rpc('create_daily_settlement_v1', {
    p_id: settlement.id,
    p_date: settlement.date,
    p_driver_id: settlement.driverId,
    p_total_revenue: settlement.totalRevenue,
    p_total_net_payable: settlement.totalNetPayable,
    p_total_expenses: settlement.totalExpenses,
    p_driver_float: settlement.driverFloat,
    p_expected_total: settlement.expectedTotal,
    p_actual_cash: settlement.actualCash,
    p_actual_coins: settlement.actualCoins,
    p_shortage: settlement.shortage,
    p_note: settlement.note ?? null,
    p_transfer_proof_url: settlement.transferProofUrl ?? null,
  });
  if (error) throw error;
  return data as DailySettlement;
}

export async function reviewSettlement(
  settlementId: string,
  status: 'confirmed' | 'rejected',
  note?: string,
): Promise<DailySettlement> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { data, error } = await supabase.rpc('review_daily_settlement_v1', {
    p_settlement_id: settlementId,
    p_status: status,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data as DailySettlement;
}
