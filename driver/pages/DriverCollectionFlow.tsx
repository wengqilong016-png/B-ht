import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import MachineRegistrationForm from '../../components/MachineRegistrationForm';
import { useAuth } from '../../contexts/AuthContext';
import { useAppData } from '../../contexts/DataContext';
import { useMutations } from '../../contexts/MutationContext';
import { getQueueHealthSummary } from '../../offlineQueue';
import {
  calculateCollectionFinanceLocal,
  calculateCollectionFinancePreview,
  type FinanceCalculationResult,
} from '../../services/financeCalculator';
import { localDB } from '../../services/localDB';
import { Location, Transaction, CONSTANTS } from '../../types';
import { getTodayLocalDate } from '../../utils/dateUtils';
import FinanceSummary from '../components/FinanceSummary';
import MachineSelector from '../components/MachineSelector';
import PayoutRequest from '../components/PayoutRequest';
import ReadingCapture from '../components/ReadingCapture';
import ResetRequest from '../components/ResetRequest';
import SubmitReview from '../components/SubmitReview';
import { resolveCurrentDriver } from '../driverShellViewState';
import { useCollectionDraft } from '../hooks/useCollectionDraft';
import { useGpsCapture } from '../hooks/useGpsCapture';

interface DriverCollectionFlowProps {
  onRegisterMachine?: (location: Location) => Promise<void>;
}

type FlowStep = 'selection' | 'capture' | 'amounts' | 'confirm';

const DriverCollectionFlow: React.FC<DriverCollectionFlowProps> = ({
  onRegisterMachine,
}) => {
  const { lang, activeDriverId } = useAuth();
  const { filteredLocations, filteredTransactions, isOnline, drivers } = useAppData();
  const { logAI, submitTransaction, syncOfflineData, updateLocations } = useMutations();
  const queryClient = useQueryClient();
  const transactionQueryKey = ['transactions', `driver:${activeDriverId}`] as const;
  const transactionStorageKey = `${CONSTANTS.STORAGE_TRANSACTIONS_KEY}:driver:${activeDriverId}`;

  const locations = filteredLocations;
  const allTransactions = filteredTransactions;
  const currentDriver = resolveCurrentDriver(drivers, activeDriverId);
  const currentDriverId = currentDriver?.id ?? null;

  const onLogAI = (log: Parameters<typeof logAI.mutate>[0]) => logAI.mutate(log);
  const onSubmit = async (tx: Transaction) => {
    if (tx.type === 'reset_request' || tx.type === 'payout_request') {
      if (tx.type === 'reset_request') {
        await submitTransaction.mutateAsync(tx);

        const currentLocations =
          queryClient.getQueryData<Location[]>(['locations']) ?? locations;
        const updatedLocations = currentLocations.map(loc =>
          loc.id === tx.locationId ? { ...loc, resetLocked: true } : loc
        );
        queryClient.setQueryData<Location[]>(['locations'], updatedLocations);

        try {
          localStorage.setItem(
            CONSTANTS.STORAGE_LOCATIONS_KEY,
            JSON.stringify(updatedLocations)
          );
        } catch (error) {
          console.warn('Failed to persist reset lock update locally.', error);
        }
        return;
      }

      await submitTransaction.mutateAsync(tx);
      return;
    }

    // Optimistically update the location's lastScore in the cache so the
    // machine card reflects the new reading immediately, before the server
    // refetch triggered by syncOfflineData completes.
    const currentLocations =
      queryClient.getQueryData<Location[]>(['locations']) ?? locations;
    const updatedLocations = currentLocations.map(loc =>
      loc.id === tx.locationId ? { ...loc, lastScore: tx.currentScore } : loc
    );

    queryClient.setQueryData<Location[]>(['locations'], updatedLocations);

    // Only persist lastScore to localStorage when online — the server is the
    // source of truth. When offline the transaction may fail on next sync, and
    // writing an incorrect lastScore here would corrupt the next finance calc.
    if (isOnline) {
      try {
        localStorage.setItem(
          CONSTANTS.STORAGE_LOCATIONS_KEY,
          JSON.stringify(updatedLocations)
        );
      } catch (error) {
        console.warn('Failed to persist optimistic locations update locally.', error);
      }
    }

    queryClient.setQueryData<Transaction[]>(transactionQueryKey, (old: Transaction[] = []) => {
      const withoutExisting = old.filter(existing => existing.id !== tx.id);
      return [{ ...tx }, ...withoutExisting];
    });

    const cachedTransactions =
      (queryClient.getQueryData<Transaction[]>(transactionQueryKey) ?? [{ ...tx }, ...allTransactions.filter(existing => existing.id !== tx.id)]);
    localDB.set(transactionStorageKey, cachedTransactions).catch((error) => {
      console.warn('Failed to persist submitted transaction locally.', error);
    });

    if (isOnline) {
      try {
        const queueHealth = await getQueueHealthSummary();
        if (queueHealth.pending > 0 || queueHealth.retryWaiting > 0 || queueHealth.deadLetter > 0) {
          syncOfflineData.mutate();
        }
      } catch (error) {
        console.warn('Failed to inspect queue health after submission.', error);
      }
    }
  };

  const [step, setStep] = useState<FlowStep>('selection');
  const { draft, updateDraft, resetDraft } = useCollectionDraft();

  // Shared GPS hook — request on mount and when reset/payout sub-views activate
  const { coords: gpsCoords, status: gpsStatus, request: requestGps } = useGpsCapture(draft.gpsCoords);

  // Keep draft GPS in sync with hook results
  useEffect(() => {
    if (gpsCoords) updateDraft({ gpsCoords });
  }, [gpsCoords]);
  useEffect(() => {
    if (gpsStatus === 'granted') updateDraft({ gpsPermission: 'granted' });
    else if (gpsStatus === 'denied') updateDraft({ gpsPermission: 'denied' });
  }, [gpsStatus]);

  // Sub-views
  const [isRegistering, setIsRegistering] = useState(false);
  const [resetRequestLocId, setResetRequestLocId] = useState<string | null>(null);
  const [payoutRequestLocId, setPayoutRequestLocId] = useState<string | null>(null);

  const selectedLocation = useMemo(
    () => locations.find(l => l.id === draft.selectedLocId),
    [draft.selectedLocId, locations]
  );
  const todayStr = useMemo(() => getTodayLocalDate(), []);
  const assignedLocations = useMemo(() => {
    const mine = locations.filter((location) => location.assignedDriverId === currentDriverId);
    return mine.length > 0 ? mine : locations;
  }, [currentDriverId, locations]);
  const visitedLocationIds = useMemo(() => {
    return new Set(
      allTransactions
        .filter((tx) => tx.driverId === currentDriverId && tx.timestamp.startsWith(todayStr) && (tx.type === undefined || tx.type === 'collection'))
        .map((tx) => tx.locationId)
    );
  }, [allTransactions, currentDriverId, todayStr]);
  const nextQueuedMachine = useMemo(() => {
    return assignedLocations
      .filter((location) => location.id !== draft.selectedLocId)
      .map((location) => ({
        location,
        isPending: !visitedLocationIds.has(location.id),
        isUrgent:
          location.status !== 'active' ||
          location.resetLocked === true ||
          (location.lastScore ?? 0) >= 9000,
      }))
      .sort((a, b) => {
        if (Number(b.isPending) !== Number(a.isPending)) return Number(b.isPending) - Number(a.isPending);
        if (Number(b.isUrgent) !== Number(a.isUrgent)) return Number(b.isUrgent) - Number(a.isUrgent);
        return a.location.name.localeCompare(b.location.name);
      })[0]?.location ?? null;
  }, [assignedLocations, draft.selectedLocId, visitedLocationIds]);
  const remainingPendingStops = useMemo(() => {
    return assignedLocations.filter((location) => location.id !== draft.selectedLocId && !visitedLocationIds.has(location.id)).length;
  }, [assignedLocations, draft.selectedLocId, visitedLocationIds]);

  // Finance preview state — starts with local calc, upgrades to server result when available
  const [financeResult, setFinanceResult] = useState<FinanceCalculationResult>(() =>
    calculateCollectionFinanceLocal({
      selectedLocation: null,
      currentScore: '', expenses: '', coinExchange: '',
      ownerRetention: '', isOwnerRetaining: false, tip: '', startupDebtDeduction: '',
      initialFloat: 0,
    })
  );

  const financeInput = useMemo(() => ({
    selectedLocation,
    currentScore: draft.currentScore,
    expenses: draft.expenses,
    coinExchange: draft.coinExchange,
    ownerRetention: draft.ownerRetention,
    isOwnerRetaining: draft.isOwnerRetaining,
    tip: draft.tip,
    startupDebtDeduction: draft.startupDebtDeduction,
    initialFloat: currentDriver?.dailyFloatingCoins || 0,
  }), [selectedLocation, draft.currentScore, draft.expenses, draft.coinExchange, draft.ownerRetention, draft.isOwnerRetaining, draft.tip, draft.startupDebtDeduction, currentDriver?.dailyFloatingCoins]);

  const requestIdRef = useRef<number>(0);
  useEffect(() => {
    // Apply local calc immediately so UI stays responsive
    setFinanceResult(calculateCollectionFinanceLocal(financeInput));

    // Then attempt server preview; fall back silently on failure
    // Use a monotonic request id so that only the most recent async response is applied.
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    calculateCollectionFinancePreview(financeInput).then(result => {
      if (requestId === requestIdRef.current) setFinanceResult(result);
    }).catch(() => {
      // Server preview failed — local calc already applied above, no action needed
    });
  }, [financeInput]);

  // Auto-fill retention when conditions met
  useEffect(() => {
    if (
      selectedLocation &&
      draft.currentScore &&
      draft.isOwnerRetaining &&
      (draft.ownerRetention === '' || (draft.ownerRetention === '0' && financeResult.commission > 0))
    ) {
      const score = parseInt(draft.currentScore) || 0;
      const diff = Math.max(0, score - selectedLocation.lastScore);
      const revenue = diff * CONSTANTS.COIN_VALUE_TZS;
      const rate = selectedLocation.commissionRate || CONSTANTS.DEFAULT_PROFIT_SHARE;
      updateDraft({ ownerRetention: Math.floor(revenue * rate).toString() });
    }
  }, [selectedLocation, draft.currentScore, draft.isOwnerRetaining, draft.ownerRetention, financeResult.commission]);

  if (!currentDriver) return null;

  const handleSelectMachine = (locId: string) => {
    updateDraft({
      selectedLocId: locId,
      draftTxId: `TX-${Date.now()}`,
      currentScore: '',
      photoData: null,
      aiReviewData: null,
      expenses: '',
      expenseType: 'public',
      expenseCategory: 'tip',
      coinExchange: '',
      ownerRetention: '',
      isOwnerRetaining: true,
      tip: '',
      startupDebtDeduction: '',
    });
    setStep('capture');
  };
  const hasDraftInProgress = Boolean(
    draft.selectedLocId &&
      (draft.currentScore ||
        draft.photoData ||
        draft.expenses ||
        draft.tip ||
        draft.coinExchange ||
        draft.startupDebtDeduction)
  );
  const handleResumeDraft = (locId: string) => {
    if (draft.selectedLocId !== locId) {
      if (hasDraftInProgress) {
        const ok = window.confirm(
          lang === 'zh'
            ? '⚠️ 当前有未提交的收款草稿，切换机器将丢失已填数据。确定切换？'
            : '⚠️ You have an unsaved collection draft. Switching machines will discard it. Continue?',
        );
        if (!ok) return;
      }
      handleSelectMachine(locId);
      return;
    }
    setStep('capture');
  };
  const handleContinueToNextMachine = (locId: string) => {
    // "Continue to next" is called after a successful submission — draft is already
    // cleared at this point, so no confirmation needed.
    handleSelectMachine(locId);
  };
  const handleSwitchMachine = () => {
    if (hasDraftInProgress) {
      const ok = window.confirm(
        lang === 'zh'
          ? '⚠️ 当前有未提交的收款草稿，切换将丢失已填数据。确定切换？'
          : '⚠️ You have an unsaved draft. Switching will discard it. Continue?',
      );
      if (!ok) return;
    }
    setStep('selection');
    resetDraft();
  };

  const handleBackToSelection = () => {
    setStep('selection');
    resetDraft();
  };

  const handleUpdateLocation = async (locationId: string, updates: Partial<Location>) => {
    const currentLocations = locations;
    const target = currentLocations.find(l => l.id === locationId);
    if (!target) return;
    await updateLocations.mutateAsync([{ ...target, ...updates }]);
  };

  const handleFullReset = () => {
    setStep('selection');
    resetDraft();
  };

  // Machine Registration sub-view
  if (isRegistering && onRegisterMachine) {
    return (
      <MachineRegistrationForm
        onSubmit={async (loc) => {
          await onRegisterMachine(loc);
          setIsRegistering(false);
        }}
        onCancel={() => setIsRegistering(false)}
        currentDriver={currentDriver}
        lang={lang}
        existingMachineIds={locations.map((location) => location.machineId)}
      />
    );
  }

  // Reset Request sub-view
  if (resetRequestLocId) {
    const resetLoc = locations.find(l => l.id === resetRequestLocId);
    if (resetLoc) {
      return (
        <ResetRequest
          location={resetLoc}
          currentDriver={currentDriver}
          lang={lang}
          isOnline={isOnline}
          gpsCoords={draft.gpsCoords}
          onSubmit={async (tx) => {
            await onSubmit(tx);
            setResetRequestLocId(null);
          }}
          onCancel={() => setResetRequestLocId(null)}
        />
      );
    }
  }

  // Payout Request sub-view
  if (payoutRequestLocId) {
    const payoutLoc = locations.find(l => l.id === payoutRequestLocId);
    if (payoutLoc) {
      return (
        <PayoutRequest
          location={payoutLoc}
          currentDriver={currentDriver}
          lang={lang}
          isOnline={isOnline}
          gpsCoords={draft.gpsCoords}
          onSubmit={async (tx) => {
            await onSubmit(tx);
            setPayoutRequestLocId(null);
          }}
          onCancel={() => setPayoutRequestLocId(null)}
        />
      );
    }
  }

  // Step 1: Machine Selection
  if (step === 'selection') {
    return (
      <MachineSelector
        locations={locations}
        currentDriver={currentDriver}
        allTransactions={allTransactions}
        lang={lang}
        isOnline={isOnline}
        gpsCoords={draft.gpsCoords}
        currentDraftLocation={selectedLocation ?? null}
        hasDraftInProgress={hasDraftInProgress}
        onSelectMachine={handleSelectMachine}
        onResumeDraft={handleResumeDraft}
        onStartRegister={() => setIsRegistering(true)}
        onRequestReset={(locId) => { requestGps(); setResetRequestLocId(locId); }}
        onRequestPayout={(locId) => { requestGps(); setPayoutRequestLocId(locId); }}
        onRegisterMachine={onRegisterMachine}
        onUpdateLocation={handleUpdateLocation}
      />
    );
  }

  if (!selectedLocation) {
    handleBackToSelection();
    return null;
  }

  // Step 2: Reading Capture
  if (step === 'capture') {
    return (
      <ReadingCapture
        selectedLocation={selectedLocation}
        currentDriver={currentDriver}
        lang={lang}
        currentScore={draft.currentScore}
        photoData={draft.photoData}
        aiReviewData={draft.aiReviewData}
        gpsCoords={draft.gpsCoords}
        gpsPermission={draft.gpsPermission}
        draftTxId={draft.draftTxId}
        onLogAI={onLogAI}
        onUpdateScore={(score) => updateDraft({ currentScore: score })}
        onUpdatePhoto={(photo) => updateDraft({ photoData: photo })}
        onUpdateAiReview={(data) => updateDraft({ aiReviewData: data })}
        onUpdateGps={(coords) => updateDraft({ gpsCoords: coords })}
        onUpdateGpsPermission={(perm) => updateDraft({ gpsPermission: perm })}
        onNext={() => setStep('amounts')}
        onBack={handleBackToSelection}
        onSwitchMachine={handleSwitchMachine}
        nextMachine={nextQueuedMachine}
        pendingCount={remainingPendingStops}
        revenue={financeResult.revenue}
        diff={financeResult.diff}
      />
    );
  }

  // Step 3: Finance Summary
  if (step === 'amounts') {
    return (
      <FinanceSummary
        selectedLocation={selectedLocation}
        lang={lang}
        currentScore={draft.currentScore}
        expenses={draft.expenses}
        expenseCategory={draft.expenseCategory}
        expenseDescription={draft.expenseDescription}
        coinExchange={draft.coinExchange}
        ownerRetention={draft.ownerRetention}
        isOwnerRetaining={draft.isOwnerRetaining}
        tip={draft.tip}
        startupDebtDeduction={draft.startupDebtDeduction}
        calculations={financeResult}
        previewSource={financeResult.source}
        onUpdateExpenses={(v) => updateDraft({ expenses: v })}
        onUpdateExpenseCategory={(v) => updateDraft({ expenseCategory: v })}
        onUpdateExpenseDescription={(v) => updateDraft({ expenseDescription: v })}
        onUpdateCoinExchange={(v) => updateDraft({ coinExchange: v })}
        onUpdateOwnerRetention={(v) => updateDraft({ ownerRetention: v })}
        onUpdateIsOwnerRetaining={(v) => updateDraft({ isOwnerRetaining: v })}
        onUpdateTip={(v) => updateDraft({ tip: v })}
        onUpdateStartupDebtDeduction={(v) => updateDraft({ startupDebtDeduction: v })}
        onNext={() => setStep('confirm')}
        onBack={() => setStep('capture')}
        onSwitchMachine={handleSwitchMachine}
        nextMachine={nextQueuedMachine}
        pendingCount={remainingPendingStops}
      />
    );
  }

  // Step 4: Submit Review
  return (
    <SubmitReview
      selectedLocation={selectedLocation}
      currentDriver={currentDriver}
      lang={lang}
      isOnline={isOnline}
      currentScore={draft.currentScore}
      photoData={draft.photoData}
      aiReviewData={draft.aiReviewData}
      expenses={draft.expenses}
      expenseType={draft.expenseType}
      expenseCategory={draft.expenseCategory}
      expenseDescription={draft.expenseDescription}
      coinExchange={draft.coinExchange}
      tip={draft.tip}
      startupDebtDeduction={draft.startupDebtDeduction}
      draftTxId={draft.draftTxId}
      gpsCoords={draft.gpsCoords}
      gpsPermission={draft.gpsPermission}
      isOwnerRetaining={draft.isOwnerRetaining}
      ownerRetention={draft.ownerRetention}
      calculations={financeResult}
      onSubmit={onSubmit}
      onBack={() => setStep('amounts')}
      onSwitchMachine={handleSwitchMachine}
      onReset={handleFullReset}
      onContinueNext={handleContinueToNextMachine}
      onUpdateGps={(coords) => updateDraft({ gpsCoords: coords })}
      onUpdateGpsPermission={(perm) => updateDraft({ gpsPermission: perm })}
      nextMachine={nextQueuedMachine}
      pendingCount={remainingPendingStops}
      allTransactions={allTransactions}
      todayStr={todayStr}
    />
  );
};

export default DriverCollectionFlow;
