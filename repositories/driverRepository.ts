/** Pure functions for reading and writing the `drivers` table. */

import { supabase } from '../supabaseClient';
import type { Driver } from '../types/models';

const DRIVER_FIELDS = [
  'id', 'name', 'username', 'phone', 'initialDebt', 'remainingDebt',
  'dailyFloatingCoins', 'vehicleInfo', 'currentGps', 'lastActive',
  'status', 'baseSalary', 'commissionRate',
].join(', ');

export async function fetchDrivers(signal?: AbortSignal): Promise<Driver[]> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const query = supabase.from('drivers').select(DRIVER_FIELDS);
  if (signal) query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Driver[];
}

export async function upsertDrivers(drivers: Partial<Driver>[]): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { error } = await supabase.from('drivers').upsert(drivers);
  if (error) throw error;
}

export async function deleteDrivers(ids: string[]): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { error } = await supabase.from('drivers').delete().in('id', ids);
  if (error) throw error;
}

export async function updateDriverPhone(driverId: string, phone: string): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { error } = await supabase
    .from('drivers')
    .update({ phone: phone.trim() })
    .eq('id', driverId);
  if (error) throw error;
}

export async function updateDriverCoins(driverId: string, coins: number): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { error } = await supabase
    .from('drivers')
    .update({ dailyFloatingCoins: coins })
    .eq('id', driverId);
  if (error) throw error;
}
