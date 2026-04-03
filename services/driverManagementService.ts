/**
 * Driver provisioning service.
 * Wraps the create-driver Edge Function + post-create business field persistence.
 * Component code should call these functions instead of invoking Supabase directly.
 */

import { supabase } from '../supabaseClient';
import type { Driver } from '../types/models';

export type CreateDriverResult =
  | { success: true; driverId: string }
  | { success: false; code: string; message: string };

/**
 * Invoke the `create-driver` Edge Function to create a Supabase Auth user,
 * a `public.drivers` row, and a `public.profiles` row in a single call.
 */
export async function createDriverAccount(params: {
  email: string;
  password: string;
  username: string;
  name: string;
}): Promise<CreateDriverResult> {
  if (!supabase) return { success: false, code: 'CLIENT_UNAVAILABLE', message: 'Supabase client unavailable' };

  const { data, error } = await supabase.functions.invoke('create-driver', {
    body: {
      email: params.email,
      password: params.password,
      driver_id: params.username,
      display_name: params.name,
      username: params.username,
    },
  });

  if (error || !data?.success) {
    const message = data?.error ?? error?.message ?? 'Unknown error';
    const code = data?.code ?? 'UNKNOWN';
    return { success: false, code, message };
  }

  return { success: true, driverId: data.driver_id as string };
}

/**
 * Persist business fields onto a drivers row after the Edge Function has
 * already created the Auth user + row skeleton.
 */
export async function persistDriverBusinessFields(
  driverId: string,
  fields: Pick<Driver, 'phone' | 'vehicleInfo' | 'dailyFloatingCoins' | 'baseSalary' | 'commissionRate' | 'initialDebt'> & { remainingDebt?: number },
): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { error } = await supabase
    .from('drivers')
    .update({
      phone: fields.phone,
      vehicleInfo: fields.vehicleInfo,
      dailyFloatingCoins: fields.dailyFloatingCoins,
      baseSalary: fields.baseSalary,
      commissionRate: fields.commissionRate,
      initialDebt: fields.initialDebt,
      remainingDebt: fields.remainingDebt ?? fields.initialDebt,
    })
    .eq('id', driverId);

  if (error) throw error;
}
