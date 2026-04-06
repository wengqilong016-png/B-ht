/**
 * collectionSubmissionService.ts
 *
 * Stage-2 server-authoritative collection submission.
 *
 * When online, the client sends raw collection inputs to `submit_collection_v2`
 * on the server. The server recomputes all finance fields and returns the
 * persisted, normalized transaction. The client never acts as the final
 * authority for finance totals on the write path.
 *
 * When offline (or Supabase is not configured), the caller is expected to
 * build a local transaction via `createCollectionTransaction` and enqueue it
 * for later sync. This service only handles the online path.
 */

import { Transaction } from '../types';
import { supabase } from '../supabaseClient';
import { persistEvidencePhotoUrl } from './evidenceStorage';

/**
 * Raw inputs accepted by the server write entrypoint.
 * These mirror the driver's form data — no pre-computed finance totals.
 */
export interface CollectionSubmissionInput {
  /** Client-generated draft ID used for idempotency. */
  txId: string;
  locationId: string;
  driverId: string;
  currentScore: number;
  expenses: number;
  /** Tip / gratuity paid out by the driver at the machine site (deducted from net payable). */
  tip: number;
  /** Manual merchant/site debt deduction for this collection. */
  startupDebtDeduction: number;
  isOwnerRetaining: boolean;
  /** Explicit owner amount; null means "use system commission result". */
  ownerRetention: number | null;
  coinExchange: number;
  gps: { lat: number; lng: number } | null;
  photoUrl: string | null;
  aiScore: number | null;
  anomalyFlag: boolean;
  notes: string | null;
  expenseType: 'public' | 'private' | null;
  expenseCategory: Transaction['expenseCategory'] | null;
  expenseDescription?: string;
  reportedStatus: 'active' | 'maintenance' | 'broken';
}

/** Discriminated result so callers can branch on success / source. */
export type CollectionSubmissionResult =
  | { success: true; transaction: Transaction; source: 'server' }
  | { success: false; error: string };

/**
 * Submit a collection to the server-authoritative write entrypoint.
 *
 * On success the returned transaction uses server-computed finance values
 * and is already persisted (`isSynced: true`).
 *
 * Returns `{ success: false }` when Supabase is not configured, which the
 * caller should treat as "proceed with offline path".
 */
export async function submitCollectionV2(
  input: CollectionSubmissionInput,
): Promise<CollectionSubmissionResult> {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  // persistEvidencePhotoUrl is non-blocking: on upload failure it logs a warning
  // and returns null instead of throwing, so a Storage outage cannot block submission.
  const persistedPhotoUrl = await persistEvidencePhotoUrl(input.photoUrl, {
    category: 'collection',
    entityId: input.txId,
    driverId: input.driverId,
  });

  let data: unknown;
  let error: { message: string } | null;
  try {
    const result = await supabase.rpc('submit_collection_v2', {
      p_tx_id:             input.txId,
      p_location_id:       input.locationId,
      p_driver_id:         input.driverId,
      p_current_score:     input.currentScore,
      p_expenses:          input.expenses,
      p_tip:               input.tip,
      p_startup_debt_deduction: input.startupDebtDeduction,
      p_is_owner_retaining: input.isOwnerRetaining,
      p_owner_retention:   input.ownerRetention,
      p_coin_exchange:     input.coinExchange,
      p_gps:               input.gps,
      p_photo_url:         persistedPhotoUrl,
      p_ai_score:          input.aiScore,
      p_anomaly_flag:      input.anomalyFlag,
      p_notes:             input.notes,
      p_expense_type:      input.expenseType,
      p_expense_category:  input.expenseCategory,
      p_reported_status:   input.reportedStatus,
      p_expense_description: input.expenseDescription ?? null,
    });
    data = result.data;
    error = result.error as { message: string } | null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error calling submit_collection_v2';
    return { success: false, error: msg };
  }

  if (error || !data) {
    return {
      success: false,
      error: (error as { message?: string } | null)?.message || 'submit_collection_v2 returned no data',
    };
  }

  // Normalize the server JSON payload to the Transaction shape used by the
  // frontend. The server is the authority; we trust its computed values.
  const row = data as Record<string, unknown>;
  const transaction: Transaction = {
    id:                    String(row['id'] ?? input.txId),
    timestamp:             String(row['timestamp'] ?? new Date().toISOString()),
    uploadTimestamp:       String(row['timestamp'] ?? new Date().toISOString()),
    locationId:            String(row['locationId'] ?? input.locationId),
    locationName:          String(row['locationName'] ?? ''),
    driverId:              String(row['driverId'] ?? input.driverId),
    driverName:            row['driverName'] != null ? String(row['driverName']) : undefined,
    previousScore:         Number(row['previousScore'] ?? 0),
    currentScore:          Number(row['currentScore'] ?? input.currentScore),
    revenue:               Number(row['revenue'] ?? 0),
    commission:            Number(row['commission'] ?? 0),
    ownerRetention:        Number(row['ownerRetention'] ?? 0),
    debtDeduction:         Number(row['debtDeduction'] ?? 0),
    startupDebtDeduction:  Number(row['startupDebtDeduction'] ?? 0),
    expenses:              Number(row['expenses'] ?? input.expenses),
    coinExchange:          Number(row['coinExchange'] ?? input.coinExchange),
    extraIncome:           Number(row['extraIncome'] ?? 0),
    netPayable:            Number(row['netPayable'] ?? 0),
    gps:                   (row['gps'] as { lat: number; lng: number }) ?? input.gps ?? { lat: 0, lng: 0 },
    photoUrl:              row['photoUrl'] != null ? String(row['photoUrl']) : persistedPhotoUrl ?? undefined,
    dataUsageKB:           Number(row['dataUsageKB'] ?? 120),
    aiScore:               row['aiScore'] != null ? Number(row['aiScore']) : undefined,
    isAnomaly:             Boolean(row['isAnomaly']),
    anomalyFlag:           Boolean(row['anomalyFlag'] ?? row['isAnomaly']),
    isSynced:              true,
    type:                  'collection',
    approvalStatus:        'approved',
    paymentStatus:         (row['paymentStatus'] as Transaction['paymentStatus']) ?? 'pending',
    reportedStatus:        (row['reportedStatus'] as Transaction['reportedStatus']) ?? 'active',
    notes:                 row['notes'] != null ? String(row['notes']) : undefined,
    expenseType:           row['expenseType'] != null
                             ? (row['expenseType'] as Transaction['expenseType'])
                             : undefined,
    expenseCategory:       row['expenseCategory'] != null
                             ? (row['expenseCategory'] as Transaction['expenseCategory'])
                             : undefined,
    expenseStatus:         row['expenseStatus'] != null
                             ? (row['expenseStatus'] as Transaction['expenseStatus'])
                             : undefined,
    expenseDescription:    row['expenseDescription'] != null
                             ? String(row['expenseDescription'])
                             : undefined,
  };

  return { success: true, transaction, source: 'server' };
}
