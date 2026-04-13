import React, { useEffect, useMemo, useState } from 'react';

import MachineRegistrationForm from '../../components/MachineRegistrationForm';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useAppData } from '../../contexts/DataContext';
import { useMutations } from '../../contexts/MutationContext';
import { useToast } from '../../contexts/ToastContext';
import { Location, CONSTANTS } from '../../types';
import { getTodayLocalDate } from '../../utils/dateUtils';
import { createExpenseTransaction } from '../../utils/transactionBuilder';
import FinanceSummary from '../components/FinanceSummary';
import MachineSelector from '../components/MachineSelector';
import PayoutRequest from '../components/PayoutRequest';
import ReadingCapture from '../components/ReadingCapture';
import ResetRequest from '../components/ResetRequest';
import SubmitReview from '../components/SubmitReview';
import { resolveCurrentDriver } from '../driverShellViewState';
import { useCollectionDraft } from '../hooks/useCollectionDraft';
import { useCollectionFinancePreview } from '../hooks/useCollectionFinancePreview';
import { useDriverSubmissionCompletion } from '../hooks/useDriverSubmissionCompletion';
import { useGpsCapture } from '../hooks/useGpsCapture';
import { useNextQueuedMachine } from '../hooks/useNextQueuedMachine';

interface DriverCollectionFlowProps {
  onRegisterMachine?: (location: Location) => Promise<void>;
  registrationDoneLabel?: string;
}

type FlowStep = 'selection' | 'capture' | 'amounts' | 'confirm';

const DriverCollectionFlow: React.FC<DriverCollectionFlowProps> = ({
  onRegisterMachine,
  registrationDoneLabel,
}) => {
  const { lang, activeDriverId } = useAuth();
  const { filteredLocations, filteredTransactions, isOnline, drivers } = useAppData();
  const { submitTransaction, syncOfflineData, updateLocations } = useMutations();
  const { confirm } = useConfirm();
  const { showToast } = useToast();

  const locations = filteredLocations;
  const allTransactions = filteredTransactions;
  const currentDriver = resolveCurrentDriver(drivers, activeDriverId);
  const currentDriverId = currentDriver?.id ?? null;

  const [step, setStep] = useState<FlowStep>('selection');
  const { draft, updateDraft, resetDraft } = useCollectionDraft();
  const onSubmit = useDriverSubmissionCompletion({
    activeDriverId,
    allTransactions,
    isOnline,
    locations,
    submitTransaction,
    syncOfflineData,
  });

  // Shared GPS hook — request on mount and when reset/payout sub-views activate
  const { coords: gpsCoords, status: gpsStatus, request: requestGps } = useGpsCapture(draft.gpsCoords);

  // Keep draft GPS in sync with hook results
  useEffect(() => {
    if (gpsCoords) updateDraft({ gpsCoords });
  }, [gpsCoords, updateDraft]);
  useEffect(() => {
    if (gpsStatus === 'granted') updateDraft({ gpsPermission: 'granted' });
    else if (gpsStatus === 'denied') updateDraft({ gpsPermission: 'denied' });
  }, [gpsStatus, updateDraft]);

  // Sub-views
  const [isRegistering, setIsRegistering] = useState(false);
  const [resetRequestLocId, setResetRequestLocId] = useState<string | null>(null);
  const [payoutRequestLocId, setPayoutRequestLocId] = useState<string | null>(null);

  const selectedLocation = useMemo(
    () => locations.find(l => l.id === draft.selectedLocId),
    [draft.selectedLocId, locations]
  );
  const todayStr = useMemo(() => getTodayLocalDate(), []);
  const { nextQueuedMachine, remainingPendingStops } = useNextQueuedMachine({
    locations,
    transactions: allTransactions,
    currentDriverId,
    selectedLocationId: draft.selectedLocId,
    todayStr,
  });

  const financeResult = useCollectionFinancePreview({
    selectedLocation,
    currentScore: draft.currentScore,
    expenses: draft.expenses,
    coinExchange: draft.coinExchange,
    ownerRetention: draft.ownerRetention,
    isOwnerRetaining: draft.isOwnerRetaining,
    tip: draft.tip,
    startupDebtDeduction: draft.startupDebtDeduction,
    initialFloat: currentDriver?.dailyFloatingCoins || 0,
  });

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
      const rate = selectedLocation.commissionRate ?? CONSTANTS.DEFAULT_PROFIT_SHARE;
      updateDraft({ ownerRetention: Math.floor(revenue * rate).toString() });
    }
  }, [selectedLocation, draft.currentScore, draft.isOwnerRetaining, draft.ownerRetention, financeResult.commission, updateDraft]);

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
  const handleResumeDraft = async (locId: string) => {
    if (draft.selectedLocId !== locId) {
      if (hasDraftInProgress) {
        const ok = await confirm({
          title: lang === 'zh' ? '切换机器' : 'Switch Machine',
          message:
            lang === 'zh'
              ? '⚠️ 当前有未提交的收款草稿，切换机器将丢失已填数据。确定切换？'
              : '⚠️ You have an unsaved collection draft. Switching machines will discard it. Continue?',
          confirmLabel: lang === 'zh' ? '确认切换' : 'Switch',
          destructive: true,
        });
        if (!ok) return;
      }
      handleSelectMachine(locId);
      return;
    }
    setStep('capture');
  };
  const handleSwitchMachine = async () => {
    if (hasDraftInProgress) {
      const ok = await confirm({
        title: lang === 'zh' ? '切换机器' : 'Switch Machine',
        message:
          lang === 'zh'
            ? '⚠️ 当前有未提交的收款草稿，切换将丢失已填数据。确定切换？'
            : '⚠️ You have an unsaved draft. Switching will discard it. Continue?',
        confirmLabel: lang === 'zh' ? '确认切换' : 'Switch',
        destructive: true,
      });
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

  const handleCreateOfficeLoan = async (locationId: string, amount: number, note: string) => {
    const location = locations.find((item) => item.id === locationId);
    if (!location) {
      throw new Error(`Location not found: ${locationId}`);
    }
    requestGps();
    const transaction = createExpenseTransaction(location, currentDriver, gpsCoords, {
      amount,
      expenseType: 'private',
      expenseCategory: 'office_loan',
      expenseDescription: note || undefined,
      notes: note || undefined,
    });
    await submitTransaction.mutateAsync(transaction);
    showToast(lang === 'zh' ? '办公室借款已提交，等待审批。' : 'Office loan submitted. Waiting for approval.', 'success');
  };

  const handleFullReset = () => {
    setStep('selection');
    resetDraft();
  };

  const handleRegistrationDone = () => {
    setIsRegistering(false);
    handleFullReset();
  };

  // Machine Registration sub-view
  if (isRegistering && onRegisterMachine) {
    return (
      <MachineRegistrationForm
        onSubmit={async (loc) => {
          await onRegisterMachine(loc);
        }}
        onCancel={() => setIsRegistering(false)}
        onSuccessDone={handleRegistrationDone}
        currentDriver={currentDriver}
        lang={lang}
        existingMachineIds={locations.map((location) => location.machineId)}
        successDoneLabel={registrationDoneLabel}
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
            await onSubmit({ source: isOnline ? 'server' : 'offline', transaction: tx });
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
            await onSubmit({ source: isOnline ? 'server' : 'offline', transaction: tx });
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
      <div data-testid="driver-flow-step-selection">
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
          onCreateOfficeLoan={handleCreateOfficeLoan}
          onRegisterMachine={onRegisterMachine}
          onUpdateLocation={handleUpdateLocation}
        />
      </div>
    );
  }

  if (!selectedLocation) {
    handleBackToSelection();
    return null;
  }

  // Step 2: Reading Capture
  if (step === 'capture') {
    return (
      <div data-testid="driver-flow-step-capture">
        <ReadingCapture
          selectedLocation={selectedLocation}
          lang={lang}
          currentScore={draft.currentScore}
          photoData={draft.photoData}
          gpsCoords={draft.gpsCoords}
          gpsStatus={gpsStatus}
          onUpdateScore={(score) => updateDraft({ currentScore: score })}
          onUpdatePhoto={(photo) => updateDraft({ photoData: photo })}
          onUpdateAiReview={(data) => updateDraft({ aiReviewData: data })}
          onRequestGps={requestGps}
          onNext={() => setStep('amounts')}
          onBack={handleBackToSelection}
          onSwitchMachine={handleSwitchMachine}
          nextMachine={nextQueuedMachine}
          pendingCount={remainingPendingStops}
          revenue={financeResult.revenue}
          diff={financeResult.diff}
        />
      </div>
    );
  }

  // Step 3: Finance Summary
  if (step === 'amounts') {
    return (
      <div data-testid="driver-flow-step-amounts">
        <FinanceSummary
          selectedLocation={selectedLocation}
          lang={lang}
          currentScore={draft.currentScore}
          expenses={draft.expenses}
          expenseType={draft.expenseType}
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
          onUpdateExpenseType={(v) => updateDraft({ expenseType: v })}
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
      </div>
    );
  }

  // Step 4: Submit Review
  return (
    <div data-testid="driver-flow-step-confirm">
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
        onReturnHome={handleFullReset}
        onRequestGps={requestGps}
        nextMachine={nextQueuedMachine}
        pendingCount={remainingPendingStops}
        allTransactions={allTransactions}
        todayStr={todayStr}
      />
    </div>
  );
};

export default DriverCollectionFlow;
