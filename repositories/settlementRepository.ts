/** Pure functions for reading and writing the `daily_settlements` table. */

import { supabase } from '../supabaseClient';
import type { DailySettlement } from '../types/models';

const SETTLEMENT_FIELDS = [
  'id', 'date', 'adminId', 'adminName', 'driverId', 'driverName',
  'totalRevenue', 'totalNetPayable', 'totalExpenses', 'driverFloat',
  'expectedTotal', 'actualCash', 'actualCoins', 'shortage', 'note',
  'timestamp', 'status',
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
