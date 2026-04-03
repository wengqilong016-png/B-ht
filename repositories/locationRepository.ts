/** Pure functions for reading and writing the `locations` table. */

import { supabase } from '../supabaseClient';
import type { Location } from '../types/models';

const LOCATION_FIELDS = [
  'id', 'name', 'machineId', 'lastScore', 'area', 'assignedDriverId',
  'ownerName', 'shopOwnerPhone', 'ownerPhotoUrl', 'machinePhotoUrl',
  'initialStartupDebt', 'remainingStartupDebt', 'isNewOffice', 'coords',
  'status', 'lastRevenueDate', 'commissionRate', 'resetLocked', 'dividendBalance',
].join(', ');

export async function fetchLocations(signal?: AbortSignal): Promise<Location[]> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const query = supabase.from('locations').select(LOCATION_FIELDS);
  if (signal) query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Location[];
}

export async function upsertLocations(locations: Partial<Location>[]): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { error } = await supabase.from('locations').upsert(locations);
  if (error) throw error;
}

export async function deleteLocations(ids: string[]): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { error } = await supabase.from('locations').delete().in('id', ids);
  if (error) throw error;
}
