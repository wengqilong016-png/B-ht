import React, { useState, useMemo, useEffect } from 'react';
import { Location, Driver, Transaction, CONSTANTS, TRANSLATIONS, AILog } from '../../types';
import { useCollectionDraft } from '../hooks/useCollectionDraft';
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

  // Sub-views
  const [isRegistering, setIsRegistering] = useState(false);
  const [resetRequestLocId, setResetRequestLocId] = useState<string | null>(null);
  const [payoutRequestLocId, setPayoutRequestLocId] = useState<string | null>(null);

  const selectedLocation = useMemo(
    () => locations.find(l => l.id === draft.selectedLocId),
    [draft.selectedLocId, locations]
  );

  // Calculations (single source of truth)
  const calculations = useMemo(() => {
    if (!selectedLocation) return { diff: 0, revenue: 0, commission: 0, finalRetention: 0, netPayable: 0, remainingCoins: 0, isCoinStockNegative: false };

    const score = parseInt(draft.currentScore) || 0;
    const diff = Math.max(0, score - selectedLocation.lastScore);
    const revenue = diff * CONSTANTS.COIN_VALUE_TZS;
    const rate = selectedLocation.commissionRate || CONSTANTS.DEFAULT_PROFIT_SHARE;
    const autoCommission = Math.floor(revenue * rate);

    let finalRetention = 0;
    if (draft.isOwnerRetaining) {
      finalRetention = draft.ownerRetention !== '' ? parseInt(draft.ownerRetention) : autoCommission;
    }

    const expenseVal = parseInt(draft.expenses) || 0;
    const tipVal = parseInt(draft.tip) || 0;
    const netPayable = Math.max(0, revenue - finalRetention - expenseVal - tipVal);
    const exchangeVal = parseInt(draft.coinExchange) || 0;
    const initialFloat = currentDriver?.dailyFloatingCoins || 0;
    const remainingCoins = initialFloat + netPayable - exchangeVal;

    return { diff, revenue, commission: autoCommission, finalRetention, netPayable, remainingCoins, isCoinStockNegative: remainingCoins < 0 };
  }, [selectedLocation, draft.currentScore, draft.coinExchange, draft.expenses, draft.tip, draft.ownerRetention, draft.isOwnerRetaining, currentDriver?.dailyFloatingCoins]);

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

  // Request GPS helper
  const requestGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateDraft({ gpsCoords: { lat: pos.coords.latitude, lng: pos.coords.longitude }, gpsPermission: 'granted' });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) updateDraft({ gpsPermission: 'denied' });
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
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
        revenue={calculations.revenue}
        diff={calculations.diff}
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
        calculations={calculations}
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
      calculations={calculations}
      onSubmit={onSubmit}
      onBack={() => setStep('amounts')}
      onReset={handleFullReset}
      onUpdateGps={(coords) => updateDraft({ gpsCoords: coords })}
      onUpdateGpsPermission={(perm) => updateDraft({ gpsPermission: perm })}
    />
  );
};

export default DriverCollectionFlow;
