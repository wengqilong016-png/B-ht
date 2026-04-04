import { supabase } from '../supabaseClient';

export interface ResetApprovalResult {
  txId: string;
  approvalStatus: 'approved' | 'rejected';
  locationId: string;
  lastScore: number;
  resetLocked: boolean;
}

export interface PayoutApprovalResult {
  txId: string;
  approvalStatus: 'approved' | 'rejected';
  locationId: string;
  dividendBalance: number;
}

export async function approveResetRequest(txId: string, approve: boolean): Promise<ResetApprovalResult> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { data, error } = await supabase.rpc('approve_reset_request_v1', {
    p_tx_id: txId,
    p_approve: approve,
  });
  if (error) throw error;
  return data as ResetApprovalResult;
}

export async function approvePayoutRequest(txId: string, approve: boolean): Promise<PayoutApprovalResult> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { data, error } = await supabase.rpc('approve_payout_request_v1', {
    p_tx_id: txId,
    p_approve: approve,
  });
  if (error) throw error;
  return data as PayoutApprovalResult;
}
