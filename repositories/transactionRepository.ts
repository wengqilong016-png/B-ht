/** Pure functions for reading and writing the `transactions` table. */

import { supabase } from '../supabaseClient';
import type { Transaction } from '../types/models';

const DRIVER_TX_FIELDS = [
  'id', 'timestamp', 'uploadTimestamp', 'locationId', 'locationName',
  'driverId', 'driverName', 'previousScore', 'currentScore', 'revenue',
  'commission', 'ownerRetention', 'debtDeduction', 'startupDebtDeduction',
  'expenses', 'coinExchange', 'extraIncome', 'netPayable', 'gps', 'gpsDeviation',
  'photoUrl', 'dataUsageKB', 'aiScore', 'isAnomaly', 'notes', 'isClearance',
  'isSynced', 'reportedStatus', 'paymentStatus', 'type', 'approvalStatus',
  'expenseType', 'expenseCategory', 'expenseStatus', 'expenseDescription',
  'payoutAmount',
].join(', ');

const ADMIN_TX_FIELDS = [
  'id', 'timestamp', 'uploadTimestamp', 'locationId', 'locationName',
  'driverId', 'driverName', 'previousScore', 'currentScore', 'revenue',
  'commission', 'ownerRetention', 'debtDeduction', 'startupDebtDeduction',
  'expenses', 'coinExchange', 'extraIncome', 'netPayable', 'gps', 'gpsDeviation',
  'photoUrl', 'dataUsageKB', 'aiScore', 'isAnomaly', 'notes', 'isClearance',
  'isSynced', 'reportedStatus', 'paymentStatus', 'type', 'approvalStatus',
  'expenseType', 'expenseCategory', 'expenseStatus', 'expenseDescription',
  'payoutAmount',
].join(', ');

export interface FetchTransactionsOptions {
  isDriver: boolean;
  driverIdFilter?: string;
  limit?: number;
  signal?: AbortSignal;
}

export async function fetchTransactions(opts: FetchTransactionsOptions): Promise<Transaction[]> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const fields = opts.isDriver ? DRIVER_TX_FIELDS : ADMIN_TX_FIELDS;
  let query = supabase
    .from('transactions')
    .select(fields)
    .order('timestamp', { ascending: false });
  if (opts.driverIdFilter) query = query.eq('driverId', opts.driverIdFilter);
  if (opts.limit) query = query.limit(opts.limit);
  if (opts.signal) query.abortSignal(opts.signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Transaction[];
}

export async function upsertTransaction(tx: Partial<Transaction>): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { error } = await supabase.from('transactions').upsert(tx);
  if (error) throw error;
}
