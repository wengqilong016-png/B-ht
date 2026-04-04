import type { Transaction } from '../types/models';
import { supabase } from '../supabaseClient';
import { persistEvidencePhotoUrl } from '../services/evidenceStorage';

export async function createResetRequest(tx: Transaction): Promise<Transaction> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const persistedPhotoUrl = await persistEvidencePhotoUrl(tx.photoUrl ?? null, {
    category: 'reset-request',
    entityId: tx.id,
    driverId: tx.driverId,
  });
  const { data, error } = await supabase.rpc('create_reset_request_v1', {
    p_tx_id: tx.id,
    p_location_id: tx.locationId,
    p_driver_id: tx.driverId,
    p_gps: tx.gps,
    p_photo_url: persistedPhotoUrl,
    p_notes: tx.notes ?? null,
  });
  if (error) throw error;
  return data as Transaction;
}

export async function createPayoutRequest(tx: Transaction): Promise<Transaction> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { data, error } = await supabase.rpc('create_payout_request_v1', {
    p_tx_id: tx.id,
    p_location_id: tx.locationId,
    p_driver_id: tx.driverId,
    p_gps: tx.gps,
    p_payout_amount: tx.payoutAmount ?? 0,
    p_notes: tx.notes ?? null,
  });
  if (error) throw error;
  return data as Transaction;
}
