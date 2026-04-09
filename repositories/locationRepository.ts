/** Pure functions for reading and writing the `locations` table. */

import { supabase } from '../supabaseClient';

import type { Location } from '../types/models';

const LOCATION_FIELDS = [
  'id', 'name', 'machineId', 'lastScore', 'area', 'assignedDriverId',
  'ownerName', 'shopOwnerPhone', 'ownerPhotoUrl', 'machinePhotoUrl',
  'initialStartupDebt', 'remainingStartupDebt', 'isNewOffice', 'coords',
  'status', 'lastRevenueDate', 'commissionRate', 'resetLocked', 'dividendBalance',
  'createdAt', 'lastRelocatedAt:last_relocated_at',
].join(', ');

function toDbLocation(location: Partial<Location>): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...location };

  delete payload.createdAt;
  delete payload.lastRelocatedAt;

  return payload;
}

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
  const { error } = await supabase.from('locations').upsert(locations.map(toDbLocation));
  if (error) throw error;
}

export async function upsertLocationsWithSignal(locations: Partial<Location>[], signal?: AbortSignal): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const query = supabase.from('locations').upsert(locations.map(toDbLocation));
  if (signal) query.abortSignal(signal);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteLocations(ids: string[]): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { error } = await supabase.from('locations').delete().in('id', ids);
  if (error) throw error;
}
