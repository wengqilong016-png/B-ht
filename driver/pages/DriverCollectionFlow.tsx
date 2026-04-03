import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Location, Driver, Transaction, CONSTANTS, AILog } from '../../types';
import {
  calculateCollectionFinanceLocal,
  calculateCollectionFinancePreview,
  type FinanceCalculationResult,
} from '../../services/financeCalculator';
import { useCollectionDraft } from '../hooks/useCollectionDraft';
import { useGpsCapture } from '../hooks/useGpsCapture';
import MachineSelector from '../components/MachineSelector';
import ReadingCapture from '../components/ReadingCapture';
import FinanceSummary from '../components/FinanceSummary';
import SubmitReview from '../components/SubmitReview';
import ResetRequest from '../components/ResetRequest';
import PayoutRequest from '../components/PayoutRequest';
import MachineRegistrationForm from '../../components/MachineRegistrationForm';

interface DriverCollectionFlowProps {
  locations: Location[];
  currentDriver: Driver;
  onSubmit: (tx: Transaction) => void;
  lang: 'zh' | 'sw';
  onLogAI: (log: AILog) => void;
  onRegisterMachine?: (location: Location) => void;
  isOnline?: boolean;
  allTransactions?: Transaction[];
}

type FlowStep = 'selection' | 'capture' | 'amounts' | 'confirm';

const DriverCollectionFlow: React.FC<DriverCollectionFlowProps> = ({
  locations, currentDriver, onSubmit, lang, onLogAI, onRegisterMachine, isOnline = true, allTransactions = [],
}) => {
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

  // Finance preview state — starts with local calc, upgrades to server result when available
  const [financeResult, setFinanceResult] = useState<FinanceCalculationResult>(() =>
    calculateCollectionFinanceLocal({
      selectedLocation: null,
      currentScore: '', expenses: '', coinExchange: '',
      ownerRetention: '', isOwnerRetaining: false, tip: '',
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
    initialFloat: currentDriver?.dailyFloatingCoins || 0,
  }), [selectedLocation, draft.currentScore, draft.expenses, draft.coinExchange, draft.ownerRetention, draft.isOwnerRetaining, draft.tip, currentDriver?.dailyFloatingCoins]);

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
    });
  }, [financeInput]);

  // Auto-fill retention when conditions met
  useEffect(() => {
    if (selectedLocation && draft.currentScore && draft.isOwnerRetaining && draft.ownerRetention === '') {
      const score = parseInt(draft.currentScore) || 0;
      const diff = Math.max(0, score - selectedLocation.lastScore);
      const revenue = diff * CONSTANTS.COIN_VALUE_TZS;
      const rate = selectedLocation.commissionRate || CONSTANTS.DEFAULT_PROFIT_SHARE;
      updateDraft({ ownerRetention: Math.floor(revenue * rate).toString() });
    }
  }, [selectedLocation, draft.currentScore, draft.isOwnerRetaining]);

  const handleSelectMachine = (locId: string) => {
    updateDraft({ selectedLocId: locId, draftTxId: `TX-${Date.now()}` });
    setStep('capture');
  };

  const handleBackToSelection = () => {
    setStep('selection');
    resetDraft();
  };

  const handleFullReset = () => {
    setStep('selection');
    resetDraft();
  };

  // Machine Registration sub-view
  if (isRegistering && onRegisterMachine) {
    return (
      <MachineRegistrationForm
        onSubmit={(loc) => { onRegisterMachine(loc); setIsRegistering(false); }}
        onCancel={() => setIsRegistering(false)}
        currentDriver={currentDriver}
        lang={lang}
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
          gpsCoords={draft.gpsCoords}
          onSubmit={(tx) => { onSubmit(tx); setResetRequestLocId(null); }}
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
          gpsCoords={draft.gpsCoords}
          onSubmit={(tx) => { onSubmit(tx); setPayoutRequestLocId(null); }}
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
        onSelectMachine={handleSelectMachine}
        onStartRegister={() => setIsRegistering(true)}
        onRequestReset={(locId) => { requestGps(); setResetRequestLocId(locId); }}
        onRequestPayout={(locId) => { requestGps(); setPayoutRequestLocId(locId); }}
        onRegisterMachine={onRegisterMachine}
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
        expenseType={draft.expenseType}
        expenseCategory={draft.expenseCategory}
        coinExchange={draft.coinExchange}
        ownerRetention={draft.ownerRetention}
        isOwnerRetaining={draft.isOwnerRetaining}
        tip={draft.tip}
        calculations={financeResult}
        previewSource={financeResult.source}
        onUpdateExpenses={(v) => updateDraft({ expenses: v })}
        onUpdateExpenseType={(v) => updateDraft({ expenseType: v })}
        onUpdateExpenseCategory={(v) => updateDraft({ expenseCategory: v })}
        onUpdateCoinExchange={(v) => updateDraft({ coinExchange: v })}
        onUpdateOwnerRetention={(v) => updateDraft({ ownerRetention: v })}
        onUpdateIsOwnerRetaining={(v) => updateDraft({ isOwnerRetaining: v })}
        onUpdateTip={(v) => updateDraft({ tip: v })}
        onNext={() => setStep('confirm')}
        onBack={() => setStep('capture')}
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
      coinExchange={draft.coinExchange}
      tip={draft.tip}
      draftTxId={draft.draftTxId}
      gpsCoords={draft.gpsCoords}
      gpsPermission={draft.gpsPermission}
      isOwnerRetaining={draft.isOwnerRetaining}
      ownerRetention={draft.ownerRetention}
      calculations={financeResult}
      onSubmit={onSubmit}
      onBack={() => setStep('amounts')}
      onReset={handleFullReset}
      onUpdateGps={(coords) => updateDraft({ gpsCoords: coords })}
      onUpdateGpsPermission={(perm) => updateDraft({ gpsPermission: perm })}
    />
  );
};

export default DriverCollectionFlow;
