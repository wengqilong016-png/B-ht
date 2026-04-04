import type { Driver, Location, Transaction } from '../types';
import { enqueueTransaction } from '../offlineQueue';
import { createCollectionTransaction } from '../utils/transactionBuilder';
import {
  submitCollectionV2,
  type CollectionSubmissionInput,
  type CollectionSubmissionResult,
} from './collectionSubmissionService';

export type SubmissionGpsSource = 'live' | 'exif' | 'estimated' | 'none';

export interface CollectionSubmissionCalculations {
  diff: number;
  revenue: number;
  commission: number;
  finalRetention: number;
  startupDebtDeduction: number;
  netPayable: number;
  remainingCoins: number;
  isCoinStockNegative: boolean;
}

export interface CollectionSubmissionAiReview {
  score?: string | null;
  condition?: string | null;
  notes?: string | null;
}

export interface OrchestrateCollectionSubmissionInput {
  selectedLocation: Location;
  currentDriver: Driver;
  isOnline: boolean;
  currentScore: string;
  photoData: string | null;
  aiReviewData: CollectionSubmissionAiReview | null;
  expenses: string;
  expenseType: 'public' | 'private';
  expenseCategory: Transaction['expenseCategory'];
  coinExchange: string;
  tip: string;
  draftTxId: string;
  isOwnerRetaining: boolean;
  ownerRetention: string;
  calculations: CollectionSubmissionCalculations;
  resolvedGps: { lat: number; lng: number };
  gpsSourceType: SubmissionGpsSource;
}

export type OrchestratedCollectionSubmissionResult =
  | { source: 'server'; transaction: Transaction; fallbackReason: null }
  | { source: 'offline'; transaction: Transaction; fallbackReason: string | null };

export interface CollectionSubmissionOrchestratorDeps {
  submitCollectionV2: (input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>;
  createCollectionTransaction: typeof createCollectionTransaction;
  enqueueTransaction: typeof enqueueTransaction;
  logger: Pick<Console, 'warn'>;
}

const defaultDeps: CollectionSubmissionOrchestratorDeps = {
  submitCollectionV2,
  createCollectionTransaction,
  enqueueTransaction,
  logger: console,
};

function parseInteger(value: string): number {
  return parseInt(value, 10) || 0;
}

function normalizeReportedStatus(
  condition: string | null | undefined,
  fallbackStatus: Location['status'] | undefined,
): 'active' | 'maintenance' | 'broken' {
  const normalizedCondition = condition?.trim().toLowerCase();

  if (normalizedCondition) {
    if (['damaged', 'issue', 'broken', 'fault', 'error'].includes(normalizedCondition)) {
      return 'broken';
    }
    if (['maintenance', 'repair', 'servicing'].includes(normalizedCondition)) {
      return 'maintenance';
    }
    if (['normal', 'active', 'ok', 'healthy'].includes(normalizedCondition)) {
      return 'active';
    }
  }

  if (fallbackStatus === 'maintenance' || fallbackStatus === 'broken') {
    return fallbackStatus;
  }

  return 'active';
}

export function buildCollectionSubmissionInput(
  input: OrchestrateCollectionSubmissionInput,
): CollectionSubmissionInput {
  const expenseValue = parseInteger(input.expenses);
  const userScore = parseInteger(input.currentScore) || (input.selectedLocation?.lastScore || 0);
  const recognizedScore = input.aiReviewData?.score ? parseInt(input.aiReviewData.score, 10) : undefined;
  const isAnomaly = recognizedScore !== undefined ? Math.abs(userScore - recognizedScore) > 50 : false;
  const reportedStatus = normalizeReportedStatus(
    input.aiReviewData?.condition,
    input.selectedLocation?.status,
  );

  const notes = [
    input.aiReviewData?.notes,
    parseInteger(input.tip) > 0 ? `[Tip: TZS ${parseInteger(input.tip).toLocaleString()}]` : null,
    input.gpsSourceType !== 'live' ? `[GPS: ${input.gpsSourceType}]` : null,
  ].filter(Boolean).join(' ') || null;

  return {
    txId:            input.draftTxId,
    locationId:      input.selectedLocation.id,
    driverId:        input.currentDriver.id,
    currentScore:    userScore,
    expenses:        expenseValue,
    tip:             parseInteger(input.tip),
    startupDebtDeduction: input.calculations.startupDebtDeduction,
    isOwnerRetaining: input.isOwnerRetaining,
    ownerRetention:  input.isOwnerRetaining && input.ownerRetention !== ''
      ? ((value) => (isNaN(value) ? null : value))(parseInt(input.ownerRetention, 10))
      : null,
    coinExchange:    parseInteger(input.coinExchange),
    gps:             input.resolvedGps.lat === 0 && input.resolvedGps.lng === 0 ? null : input.resolvedGps,
    photoUrl:        input.photoData || null,
    aiScore:         recognizedScore ?? null,
    anomalyFlag:     isAnomaly,
    notes,
    expenseType:     expenseValue > 0 ? input.expenseType : null,
    expenseCategory: expenseValue > 0 ? input.expenseCategory : null,
    reportedStatus,
  };
}

export async function orchestrateCollectionSubmission(
  input: OrchestrateCollectionSubmissionInput,
  deps: CollectionSubmissionOrchestratorDeps = defaultDeps,
): Promise<OrchestratedCollectionSubmissionResult> {
  const rawInput = buildCollectionSubmissionInput(input);

  if (input.isOnline) {
    const result = await deps.submitCollectionV2(rawInput);
    if (result.success) {
      return {
        source: 'server',
        transaction: result.transaction,
        fallbackReason: null,
      };
    }

    deps.logger.warn(
      '[collectionSubmissionOrchestrator] submit_collection_v2 failed, falling back to local path:',
      // Cast to narrow the union: TypeScript's control flow narrowing is not
      // reliably applied to discriminated unions in this project's tsconfig.
      (result as { success: false; error: string }).error,
    );

    const offlineTransaction = deps.createCollectionTransaction(
      input.selectedLocation,
      input.currentDriver,
      input.resolvedGps,
      rawInput.currentScore,
      {
        txId: input.draftTxId,
        revenue: input.calculations.revenue,
        commission: input.calculations.commission,
        ownerRetention: input.calculations.finalRetention,
        startupDebtDeduction: input.calculations.startupDebtDeduction,
        expenses: rawInput.expenses,
        coinExchange: rawInput.coinExchange,
        netPayable: input.calculations.netPayable,
        photoUrl: input.photoData || undefined,
        dataUsageKB: 120,
        notes: rawInput.notes || undefined,
        anomalyFlag: rawInput.anomalyFlag,
      },
    );

    offlineTransaction.expenseType = rawInput.expenseType ?? undefined;
    offlineTransaction.expenseCategory = rawInput.expenseCategory ?? undefined;
    offlineTransaction.expenseStatus = rawInput.expenseType ? 'pending' : undefined;
    offlineTransaction.paymentStatus = 'pending';
    offlineTransaction.aiScore = rawInput.aiScore ?? undefined;
    offlineTransaction.reportedStatus = rawInput.reportedStatus;

    try {
      await deps.enqueueTransaction(offlineTransaction, rawInput);
    } catch (error) {
      deps.logger.warn('[collectionSubmissionOrchestrator] IDB enqueue failed:', error);
    }

    return {
      source: 'offline',
      transaction: offlineTransaction,
      // Cast to narrow the union: TypeScript's control flow narrowing is not
      // reliably applied to discriminated unions in this project's tsconfig.
      fallbackReason: (result as { success: false; error: string }).error,
    };
  }

  const offlineTransaction = deps.createCollectionTransaction(
    input.selectedLocation,
    input.currentDriver,
    input.resolvedGps,
    rawInput.currentScore,
    {
      txId: input.draftTxId,
      revenue: input.calculations.revenue,
      commission: input.calculations.commission,
      ownerRetention: input.calculations.finalRetention,
      startupDebtDeduction: input.calculations.startupDebtDeduction,
      expenses: rawInput.expenses,
      coinExchange: rawInput.coinExchange,
      netPayable: input.calculations.netPayable,
      photoUrl: input.photoData || undefined,
      dataUsageKB: 120,
      notes: rawInput.notes || undefined,
      anomalyFlag: rawInput.anomalyFlag,
    },
  );

  offlineTransaction.expenseType = rawInput.expenseType ?? undefined;
  offlineTransaction.expenseCategory = rawInput.expenseCategory ?? undefined;
  offlineTransaction.expenseStatus = rawInput.expenseType ? 'pending' : undefined;
  offlineTransaction.paymentStatus = 'pending';
  offlineTransaction.aiScore = rawInput.aiScore ?? undefined;
  offlineTransaction.reportedStatus = rawInput.reportedStatus;

  try {
    await deps.enqueueTransaction(offlineTransaction, rawInput);
  } catch (error) {
    deps.logger.warn('[collectionSubmissionOrchestrator] IDB enqueue failed:', error);
  }

  return {
    source: 'offline',
    transaction: offlineTransaction,
    fallbackReason: null,
  };
}
