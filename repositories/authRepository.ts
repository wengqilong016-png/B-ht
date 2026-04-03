/** Centralised auth-layer calls — keeps supabase.auth.* out of components. */

import { supabase } from '../supabaseClient';

export async function updatePassword(newPassword: string): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
