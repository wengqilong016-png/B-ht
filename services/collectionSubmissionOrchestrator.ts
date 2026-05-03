import { enqueueTransaction } from '../offlineQueue';
import { CONSTANTS } from '../types';
import { createCollectionTransaction } from '../utils/transactionBuilder';

import { appendCollectionSubmissionAudit } from './collectionSubmissionAudit';
import {
  isFailure,
  submitCollectionV2,
  type CollectionSubmissionInput,
  type CollectionSubmissionResult,
} from './collectionSubmissionService';

import type { Driver, Location, Transaction } from '../types';

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
  expenseDescription?: string;
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

function parseAmount(value: string): number {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return 0;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
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

function buildOfflineTransaction(
  input: OrchestrateCollectionSubmissionInput,
  rawInput: CollectionSubmissionInput,
  deps: CollectionSubmissionOrchestratorDeps,
): Transaction {
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
      tip: rawInput.tip,
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
  offlineTransaction.expenseDescription = rawInput.expenseDescription;
  offlineTransaction.expenseStatus = rawInput.expenseType ? 'pending' : undefined;
  offlineTransaction.paymentStatus = 'pending';
  offlineTransaction.aiScore = rawInput.aiScore ?? undefined;
  offlineTransaction.reportedStatus = rawInput.reportedStatus;

  return offlineTransaction;
}

async function enqueueOfflineTransaction(
  offlineTransaction: Transaction,
  rawInput: CollectionSubmissionInput,
  input: OrchestrateCollectionSubmissionInput,
  reason: string,
  deps: CollectionSubmissionOrchestratorDeps,
): Promise<void> {
  try {
    await deps.enqueueTransaction(offlineTransaction, rawInput);
    appendCollectionSubmissionAudit({
      timestamp: new Date().toISOString(),
      event: 'submit_offline_enqueued',
      txId: offlineTransaction.id,
      locationId: offlineTransaction.locationId,
      locationName: offlineTransaction.locationName,
      driverId: offlineTransaction.driverId,
      currentScoreRaw: input.currentScore,
      resolvedScore: offlineTransaction.currentScore,
      previousScore: offlineTransaction.previousScore,
      source: 'offline',
      reason,
    });
  } catch (error) {
    deps.logger.warn('[collectionSubmissionOrchestrator] IDB enqueue failed:', error);
    throw new Error(
      `采集数据暂存失败，请截图并联系管理员。/ Collection could not be saved locally. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function buildCollectionSubmissionInput(
  input: OrchestrateCollectionSubmissionInput,
): CollectionSubmissionInput {
  // Expenses are intentionally 0 for collection transactions.
  // Expenses incurred during collections (office loans, private loans, etc.)
  // are recorded as separate type='expense' transactions via
  // createExpenseTransaction(). This keeps the collection transaction's
  // financial calculation clean and expense tracking auditable via
  // independent transaction records with expenseStatus/approvalStatus.
  const expenseValue = 0;
  const tipValue = parseAmount(input.tip);
  const trimmedScore = input.currentScore.trim();
  const parsedScore = Number.parseInt(trimmedScore, 10);
  if (trimmedScore === '' || Number.isNaN(parsedScore)) {
    appendCollectionSubmissionAudit({
      timestamp: new Date().toISOString(),
      event: 'submit_invalid_score',
      txId: input.draftTxId,
      locationId: input.selectedLocation.id,
      locationName: input.selectedLocation.name,
      driverId: input.currentDriver.id,
      currentScoreRaw: input.currentScore,
      previousScore: input.selectedLocation.lastScore,
      reason: 'Current score was empty or non-numeric before submission',
    });
    throw new Error('Invalid current score');
  }
  const userScore = parsedScore;
  const recognizedScore = input.aiReviewData?.score ? parseInt(input.aiReviewData.score, 10) : undefined;
  const isAnomaly = recognizedScore !== undefined ? Math.abs(userScore - recognizedScore) > CONSTANTS.ANOMALY_SCORE_DIFF_THRESHOLD : false;
  const reportedStatus = normalizeReportedStatus(
    input.aiReviewData?.condition,
    input.selectedLocation?.status,
  );

  const notes = [
    input.aiReviewData?.notes,
    input.gpsSourceType !== 'live' ? `[GPS: ${input.gpsSourceType}]` : null,
  ].filter(Boolean).join(' ') || null;

  return {
    txId:            input.draftTxId,
    locationId:      input.selectedLocation.id,
    driverId:        input.currentDriver.id,
    currentScore:    userScore,
    expenses:        expenseValue,
    tip:             tipValue,
    startupDebtDeduction: input.calculations.startupDebtDeduction,
    isOwnerRetaining: input.isOwnerRetaining,
    ownerRetention:  input.ownerRetention !== ''
      ? parseAmount(input.ownerRetention)
      : null,
    coinExchange:    parseInteger(input.coinExchange),
    gps:             input.resolvedGps.lat === 0 && input.resolvedGps.lng === 0 ? null : input.resolvedGps,
    photoUrl:        input.photoData || null,
    aiScore:         recognizedScore ?? null,
    anomalyFlag:     isAnomaly,
    notes,
    expenseType:        null,
    expenseCategory:    null,
    expenseDescription: undefined,
    reportedStatus,
  };
}

async function fallbackToOffline(
  input: OrchestrateCollectionSubmissionInput,
  rawInput: CollectionSubmissionInput,
  deps: CollectionSubmissionOrchestratorDeps,
  reason: string | null,
): Promise<OrchestratedCollectionSubmissionResult> {
  const offlineTransaction = buildOfflineTransaction(input, rawInput, deps);
  await enqueueOfflineTransaction(offlineTransaction, rawInput, input, reason ?? 'Offline fallback', deps);
  return { source: 'offline', transaction: offlineTransaction, fallbackReason: reason };
}

export async function orchestrateCollectionSubmission(
  input: OrchestrateCollectionSubmissionInput,
  deps: CollectionSubmissionOrchestratorDeps = defaultDeps,
): Promise<OrchestratedCollectionSubmissionResult> {
  const rawInput = buildCollectionSubmissionInput(input);

  appendCollectionSubmissionAudit({
    timestamp: new Date().toISOString(),
    event: 'submit_attempt',
    txId: input.draftTxId,
    locationId: input.selectedLocation.id,
    locationName: input.selectedLocation.name,
    driverId: input.currentDriver.id,
    currentScoreRaw: input.currentScore,
    resolvedScore: rawInput.currentScore,
    previousScore: input.selectedLocation.lastScore,
    metadata: {
      isOnline: input.isOnline,
      gpsSourceType: input.gpsSourceType,
      reportedStatus: rawInput.reportedStatus,
    },
  });

  if (input.isOnline) {
    const result = await deps.submitCollectionV2(rawInput);
    if (result.success) {
      appendCollectionSubmissionAudit({
        timestamp: new Date().toISOString(),
        event: 'submit_server_success',
        txId: result.transaction.id,
        locationId: result.transaction.locationId,
        locationName: result.transaction.locationName,
        driverId: result.transaction.driverId,
        currentScoreRaw: input.currentScore,
        resolvedScore: result.transaction.currentScore,
        previousScore: result.transaction.previousScore,
        source: 'server',
        metadata: {
          paymentStatus: result.transaction.paymentStatus,
          approvalStatus: result.transaction.approvalStatus,
        },
      });
      return {
        source: 'server',
        transaction: result.transaction,
        fallbackReason: null,
      };
    }

    const fallbackError = isFailure(result) ? result.error : 'Unknown submission failure';
    deps.logger.warn(
      isFailure(result) && result.kind === 'evidence'
        ? '[collectionSubmissionOrchestrator] submit_collection_v2 failed with evidence error:'
        : '[collectionSubmissionOrchestrator] submit_collection_v2 failed, falling back to local path:',
      fallbackError,
    );
    appendCollectionSubmissionAudit({
      timestamp: new Date().toISOString(),
      event: 'submit_server_failure',
      txId: input.draftTxId,
      locationId: input.selectedLocation.id,
      locationName: input.selectedLocation.name,
      driverId: input.currentDriver.id,
      currentScoreRaw: input.currentScore,
      resolvedScore: rawInput.currentScore,
      previousScore: input.selectedLocation.lastScore,
      reason: fallbackError,
      metadata: {
        fallback: isFailure(result) && result.kind === 'evidence' ? 'blocked_evidence' : 'offline_queue',
        kind: isFailure(result) ? result.kind : undefined,
      },
    });

    if (isFailure(result) && result.kind === 'evidence') {
      throw new Error(fallbackError);
    }

    return await fallbackToOffline(input, rawInput, deps, fallbackError);
  }

  return await fallbackToOffline(input, rawInput, deps, null);
}
