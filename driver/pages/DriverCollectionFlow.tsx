import React, { useEffect, useMemo, useState } from 'react';

import MachineRegistrationForm from '../../components/MachineRegistrationForm';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useAppData } from '../../contexts/DataContext';
import { useMutations } from '../../contexts/MutationContext';
import { useToast } from '../../contexts/ToastContext';
import {
  flushDriverFlowEvents,
  recordDriverFlowEvent,
  type DriverFlowEventInput,
} from '../../services/driverFlowTelemetry';
import { Location, CONSTANTS, safeRandomUUID } from '../../types';
import { getTodayLocalDate } from '../../utils/dateUtils';
import { createExpenseTransaction } from '../../utils/transactionBuilder';
import FinanceSummary, { FinanceSummaryContent } from '../components/FinanceSummary';
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
  const flowIdRef = React.useRef(safeRandomUUID());
  const stepStartedAtRef = React.useRef(Date.now());
  const scoreEnteredRef = React.useRef(false);
  const photoMissingReportedRef = React.useRef<string | null>(null);
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

  useEffect(() => {
    if (isOnline) void flushDriverFlowEvents();
  }, [isOnline]);

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
    expenses: '',
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

  const recordFlowEvent = (
    eventName: DriverFlowEventInput['eventName'],
    options: Partial<Omit<DriverFlowEventInput, 'driverId' | 'flowId' | 'step' | 'eventName' | 'onlineStatus'>> & {
      step?: DriverFlowEventInput['step'];
    } = {},
  ) => {
    if (!currentDriver) return;
    recordDriverFlowEvent({
      driverId: currentDriver.id,
      flowId: flowIdRef.current,
      draftTxId: draft.draftTxId || null,
      locationId: draft.selectedLocId || null,
      step,
      eventName,
      onlineStatus: isOnline,
      gpsPermission: gpsStatus === 'idle' || gpsStatus === 'requesting' ? draft.gpsPermission : gpsStatus,
      hasPhoto: !!draft.photoData,
      durationMs: Date.now() - stepStartedAtRef.current,
      ...options,
    });
  };

  useEffect(() => {
    stepStartedAtRef.current = Date.now();
    recordFlowEvent('step_view');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draft.selectedLocId]);

  // Auto-trigger GPS when entering capture step
  useEffect(() => {
    if (step === 'capture' && !draft.gpsCoords && gpsStatus === 'idle') {
      void requestGpsWithTelemetry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (gpsStatus === 'idle' || gpsStatus === 'requesting') return;
    recordFlowEvent('gps_status_changed', {
      payload: { status: gpsStatus },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsStatus]);

  useEffect(() => {
    if (step !== 'confirm' || draft.photoData || !draft.draftTxId) return;
    if (photoMissingReportedRef.current === draft.draftTxId) return;
    photoMissingReportedRef.current = draft.draftTxId;
    recordFlowEvent('photo_missing_after_refresh', {
      step: 'confirm',
      errorCategory: 'photo_missing_after_refresh',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draft.photoData, draft.draftTxId]);

  const requestGpsWithTelemetry = () => {
    recordFlowEvent('gps_retry_requested', {
      payload: { previousStatus: gpsStatus },
    });
    return requestGps();
  };

  if (!currentDriver) return null;

  const handleSelectMachine = (locId: string) => {
    flowIdRef.current = safeRandomUUID();
    stepStartedAtRef.current = Date.now();
    scoreEnteredRef.current = false;
    photoMissingReportedRef.current = null;
    updateDraft({
      selectedLocId: locId,
      draftTxId: `TX-${safeRandomUUID()}`,
      currentScore: '',
      photoData: null,
      aiReviewData: null,
      coinExchange: '',
      ownerRetention: '',
      isOwnerRetaining: false,
      startupDebtDeduction: '',
    });
    recordDriverFlowEvent({
      driverId: currentDriver.id,
      flowId: flowIdRef.current,
      draftTxId: null,
      locationId: locId,
      step: 'selection',
      eventName: 'machine_selected',
      onlineStatus: isOnline,
      gpsPermission: gpsStatus === 'idle' || gpsStatus === 'requesting' ? draft.gpsPermission : gpsStatus,
      hasPhoto: false,
      durationMs: Date.now() - stepStartedAtRef.current,
    });
    setStep('capture');
  };
  const hasDraftInProgress = Boolean(
    draft.selectedLocId &&
      (draft.currentScore ||
        draft.photoData ||
        draft.coinExchange ||
        draft.startupDebtDeduction)
  );
  const handleResumeDraft = async (locId: string) => {
    if (draft.selectedLocId !== locId) {
      if (hasDraftInProgress) {
        recordFlowEvent('machine_switch_requested', { locationId: locId });
        const ok = await confirm({
          title: lang === 'zh' ? '切换机器' : 'Switch Machine',
          message:
            lang === 'zh'
              ? '⚠️ 当前有未提交的收款草稿，切换机器将丢失已填数据。确定切换？'
              : '⚠️ You have an unsaved collection draft. Switching machines will discard it. Continue?',
          confirmLabel: lang === 'zh' ? '确认切换' : 'Switch',
          destructive: true,
        });
        if (!ok) {
          recordFlowEvent('machine_switch_cancelled', { locationId: locId });
          return;
        }
        recordFlowEvent('machine_switch_confirmed', { locationId: locId });
      }
      handleSelectMachine(locId);
      return;
    }
    recordFlowEvent('draft_resumed', { locationId: locId });
    setStep('capture');
  };
  const handleSwitchMachine = async () => {
    if (hasDraftInProgress) {
      recordFlowEvent('machine_switch_requested');
      const ok = await confirm({
        title: lang === 'zh' ? '切换机器' : 'Switch Machine',
        message:
          lang === 'zh'
            ? '⚠️ 当前有未提交的收款草稿，切换将丢失已填数据。确定切换？'
            : '⚠️ You have an unsaved draft. Switching will discard it. Continue?',
        confirmLabel: lang === 'zh' ? '确认切换' : 'Switch',
        destructive: true,
      });
      if (!ok) {
        recordFlowEvent('machine_switch_cancelled');
        return;
      }
      recordFlowEvent('machine_switch_confirmed');
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
    const resolvedGps = await requestGps();
    if (!resolvedGps) {
      throw new Error('GPS location could not be resolved for office loan submission.');
    }
    const transaction = createExpenseTransaction(location, currentDriver, resolvedGps, {
      amount,
      expenseType: 'private',
      expenseCategory: 'office_loan',
      expenseDescription: note || undefined,
      notes: note || undefined,
    });
    await submitTransaction.mutateAsync(transaction);
    recordFlowEvent('office_loan_submitted', {
      step: 'office_loan',
      locationId,
      payload: { amount },
    });
    showToast(lang === 'zh' ? '办公室借款已提交，等待审批。' : 'Office loan submitted. Waiting for approval.', 'success');
  };

  const handleFullReset = () => {
    flowIdRef.current = safeRandomUUID();
    stepStartedAtRef.current = Date.now();
    scoreEnteredRef.current = false;
    photoMissingReportedRef.current = null;
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
          onRequestReset={(locId) => {
            recordFlowEvent('reset_request_opened', { step: 'reset_request', locationId: locId });
            requestGpsWithTelemetry();
            setResetRequestLocId(locId);
          }}
          onRequestPayout={(locId) => {
            recordFlowEvent('payout_request_opened', { step: 'payout_request', locationId: locId });
            requestGpsWithTelemetry();
            setPayoutRequestLocId(locId);
          }}
          onCreateOfficeLoan={handleCreateOfficeLoan}
          onRegisterMachine={onRegisterMachine}
          onUpdateLocation={handleUpdateLocation}
          onTelemetryEvent={(eventName, options) => recordFlowEvent(eventName, options)}
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
    const parsedCaptureScore = parseInt(draft.currentScore, 10);
    const hasValidCaptureScore = draft.currentScore.trim() !== '' && !Number.isNaN(parsedCaptureScore);
    const isCaptureScoreBelowLastReading = hasValidCaptureScore && parsedCaptureScore < (selectedLocation?.lastScore ?? 0);
    const submitBlockers = [
      !hasValidCaptureScore ? (lang === 'zh' ? '缺读数' : 'Missing reading') : null,
      !draft.photoData ? (lang === 'zh' ? '缺照片' : 'Missing photo') : null,
      !draft.gpsCoords ? (lang === 'zh' ? '缺 GPS' : 'Missing GPS') : null,
      isCaptureScoreBelowLastReading ? (lang === 'zh' ? '金额异常' : 'Amount issue') : null,
    ].filter((item): item is string => Boolean(item));

    return (
      <div data-testid="driver-flow-step-capture">
        <ReadingCapture
          selectedLocation={selectedLocation}
          lang={lang}
          currentScore={draft.currentScore}
          photoData={draft.photoData}
          gpsCoords={draft.gpsCoords}
          gpsStatus={gpsStatus}
          onUpdateScore={(score) => {
            updateDraft({ currentScore: score });
            if (!scoreEnteredRef.current && score.trim()) {
              scoreEnteredRef.current = true;
              recordFlowEvent('score_entered', {
                payload: { scoreLength: score.trim().length },
              });
            }
          }}
          onUpdatePhoto={(photo) => {
            updateDraft({ photoData: photo });
            if (photo) recordFlowEvent('photo_attached');
          }}
          onUpdateAiReview={(data) => updateDraft({ aiReviewData: data })}
          onRequestGps={requestGpsWithTelemetry}
          onTelemetryEvent={(eventName, options) => recordFlowEvent(eventName, options)}
          onNext={() => setStep('confirm')}
          onBack={handleBackToSelection}
          onSwitchMachine={handleSwitchMachine}
          nextMachine={nextQueuedMachine}
          pendingCount={remainingPendingStops}
          revenue={financeResult.revenue}
          diff={financeResult.diff}
          hideStepBar
          hideNextButton
        >
          <FinanceSummaryContent
            selectedLocation={selectedLocation}
            lang={lang}
            currentScore={draft.currentScore}
            coinExchange={draft.coinExchange}
            ownerRetention={draft.ownerRetention}
            isOwnerRetaining={draft.isOwnerRetaining}
            tip={draft.tip}
            startupDebtDeduction={draft.startupDebtDeduction}
            calculations={financeResult}
            previewSource={financeResult.source}
            showRevenueSummary={false}
            showMetricGrid={false}
            onUpdateCoinExchange={(v) => updateDraft({ coinExchange: v })}
            onUpdateOwnerRetention={(v) => updateDraft({ ownerRetention: v })}
            onUpdateIsOwnerRetaining={(v) => updateDraft({ isOwnerRetaining: v })}
            onUpdateTip={(v) => updateDraft({ tip: v })}
            onUpdateStartupDebtDeduction={(v) => updateDraft({ startupDebtDeduction: v })}
          />
          <SubmitReview
            selectedLocation={selectedLocation}
            currentDriver={currentDriver}
            lang={lang}
            isOnline={isOnline}
            currentScore={draft.currentScore}
            photoData={draft.photoData}
            aiReviewData={draft.aiReviewData}
            coinExchange={draft.coinExchange}
            tip={draft.tip}
            startupDebtDeduction={draft.startupDebtDeduction}
            draftTxId={draft.draftTxId}
            gpsCoords={draft.gpsCoords}
            gpsPermission={draft.gpsPermission}
            isOwnerRetaining={draft.isOwnerRetaining}
            ownerRetention={draft.ownerRetention}
            calculations={financeResult}
            embedded
            submissionBlockers={submitBlockers}
            onSubmit={async (result) => {
              recordFlowEvent(
                result.source === 'server' ? 'submit_success' : 'submit_offline_queued',
                {
                  step: 'complete',
                  locationId: result.transaction.locationId,
                  payload: { source: result.source },
                },
              );
              await onSubmit(result);
            }}
            onBack={handleBackToSelection}
            onSwitchMachine={handleSwitchMachine}
            onReset={handleFullReset}
            onReturnHome={() => {
              recordFlowEvent('return_home', { step: 'complete' });
              handleFullReset();
            }}
            onRequestGps={requestGpsWithTelemetry}
            onTelemetryEvent={(eventName, options) => recordFlowEvent(eventName, options)}
            nextMachine={nextQueuedMachine}
            pendingCount={remainingPendingStops}
            allTransactions={allTransactions}
            todayStr={todayStr}
          />
        </ReadingCapture>
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
          coinExchange={draft.coinExchange}
          ownerRetention={draft.ownerRetention}
          isOwnerRetaining={draft.isOwnerRetaining}
          tip={draft.tip}
          startupDebtDeduction={draft.startupDebtDeduction}
          calculations={financeResult}
          previewSource={financeResult.source}
          onUpdateCoinExchange={(v) => updateDraft({ coinExchange: v })}
          onUpdateOwnerRetention={(v) => updateDraft({ ownerRetention: v })}
          onUpdateIsOwnerRetaining={(v) => updateDraft({ isOwnerRetaining: v })}
          onUpdateTip={(v) => updateDraft({ tip: v })}
          onUpdateStartupDebtDeduction={(v) => updateDraft({ startupDebtDeduction: v })}
          onNext={() => {
            recordFlowEvent('amounts_next_clicked');
            setStep('confirm');
          }}
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
        coinExchange={draft.coinExchange}
        tip={draft.tip}
        startupDebtDeduction={draft.startupDebtDeduction}
        draftTxId={draft.draftTxId}
        gpsCoords={draft.gpsCoords}
        gpsPermission={draft.gpsPermission}
        isOwnerRetaining={draft.isOwnerRetaining}
        ownerRetention={draft.ownerRetention}
        calculations={financeResult}
        onSubmit={async (result) => {
          recordFlowEvent(
            result.source === 'server' ? 'submit_success' : 'submit_offline_queued',
            {
              step: 'complete',
              locationId: result.transaction.locationId,
              payload: { source: result.source },
            },
          );
          await onSubmit(result);
        }}
        onBack={() => {
          recordFlowEvent('confirm_back_clicked');
          setStep('amounts');
        }}
        onSwitchMachine={handleSwitchMachine}
        onReset={handleFullReset}
        onReturnHome={() => {
          recordFlowEvent('return_home', { step: 'complete' });
          handleFullReset();
        }}
        onRequestGps={requestGpsWithTelemetry}
        onTelemetryEvent={(eventName, options) => recordFlowEvent(eventName, options)}
        nextMachine={nextQueuedMachine}
        pendingCount={remainingPendingStops}
        allTransactions={allTransactions}
        todayStr={todayStr}
      />
    </div>
  );
};

export default DriverCollectionFlow;
