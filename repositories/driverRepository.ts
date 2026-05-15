/** Pure functions for reading and writing the `drivers` table. */

import { supabase } from '../supabaseClient';

import type { Driver } from '../types/models';

const DRIVER_FIELDS = [
  'id', 'name', 'username', 'phone', 'backgroundPhotoUrl', 'initialDebt', 'remainingDebt',
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

type DriverUpdate = Partial<Pick<
  Driver,
  | 'name'
  | 'username'
  | 'phone'
  | 'backgroundPhotoUrl'
  | 'initialDebt'
  | 'remainingDebt'
  | 'dailyFloatingCoins'
  | 'vehicleInfo'
  | 'currentGps'
  | 'lastActive'
  | 'status'
  | 'baseSalary'
  | 'commissionRate'
>>;

function toDriverUpdatePayload(driver: Partial<Driver>): DriverUpdate {
  const payload: DriverUpdate = {};
  const assign = <K extends keyof DriverUpdate>(key: K, value: DriverUpdate[K] | undefined) => {
    if (value !== undefined) payload[key] = value;
  };

  assign('name', driver.name);
  assign('username', driver.username);
  assign('phone', driver.phone);
  assign('backgroundPhotoUrl', driver.backgroundPhotoUrl);
  assign('initialDebt', driver.initialDebt);
  assign('remainingDebt', driver.remainingDebt);
  assign('dailyFloatingCoins', driver.dailyFloatingCoins);
  assign('vehicleInfo', driver.vehicleInfo);
  assign('currentGps', driver.currentGps);
  assign('lastActive', driver.lastActive);
  assign('status', driver.status);
  assign('baseSalary', driver.baseSalary);
  assign('commissionRate', driver.commissionRate);

  return payload;
}

export async function updateDrivers(drivers: Array<Partial<Driver> & { id: string }>): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  for (const driver of drivers) {
    const { error } = await supabase
      .from('drivers')
      .update(toDriverUpdatePayload(driver))
      .eq('id', driver.id);
    if (error) throw error;
  }
}

export async function updateDriverProfile(
  driverId: string,
  updates: Pick<Partial<Driver>, 'phone' | 'backgroundPhotoUrl'>,
): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { error } = await supabase
    .from('drivers')
    .update(updates)
    .eq('id', driverId);
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
