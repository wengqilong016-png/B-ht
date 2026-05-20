jest.mock('../hooks/useCollectionSubmission', () => ({
  useCollectionSubmission: jest.fn(),
}));
jest.mock('../offlineQueue', () => ({
  extractGpsFromExif: jest.fn(),
  estimateLocationFromContext: jest.fn(),
}));
jest.mock('../contexts/ConfirmContext', () => ({
  useConfirm: jest.fn(),
}));
jest.mock('../driver/components/CollectionWorkbenchHeader', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-workbench-header">WorkbenchHeader</div>,
}));
jest.mock('../driver/components/WizardStepBar', () => ({
  __esModule: true,
  default: ({ current, lang }: { current: string; lang: string }) => (
    <div data-testid="mock-wizard-stepbar" data-current={current} data-lang={lang}>WizardStepBar</div>
  ),
}));

/**
 * SubmitReview unit tests — submission confirmation screen (552L component).
 * Covers: render paths (non-embedded / embedded / completion / error),
 *         input validation (empty / below-last-reading),
 *         blocker display, photo-missing warning.
 */
import React from 'react';

import { useCollectionSubmission } from '../hooks/useCollectionSubmission';
import { useConfirm } from '../contexts/ConfirmContext';
import { extractGpsFromExif, estimateLocationFromContext } from '../offlineQueue';

import SubmitReview from '../driver/components/SubmitReview';
import type { CompletionResult } from '../driver/components/SubmitReview';

import { makeDriver, makeLocation, makeTransaction, resetFixtureCounter } from './helpers/fixtures';
import { act, renderWithProviders, screen, waitFor } from './helpers/test-utils';

const mockUseCollectionSubmission = useCollectionSubmission as jest.MockedFunction<typeof useCollectionSubmission>;
const mockUseConfirm = useConfirm as jest.MockedFunction<typeof useConfirm>;
const mockExtractGps = extractGpsFromExif as jest.MockedFunction<typeof extractGpsFromExif>;
const mockEstimateLocation = estimateLocationFromContext as jest.MockedFunction<typeof estimateLocationFromContext>;

function defaultSubmissionState(overrides: Partial<ReturnType<typeof useCollectionSubmission>> = {}) {
  return {
    state: { status: 'idle' as const },
    submit: jest.fn(),
    reset: jest.fn(),
    ...overrides,
  };
}

function defaultCalculations() {
  return {
    diff: 200,
    revenue: 40000,
    commission: 6000,
    finalRetention: 6000,
    startupDebtDeduction: 0,
    netPayable: 34000,
    remainingCoins: 100,
    isCoinStockNegative: false,
  };
}

function renderSR(props: Partial<React.ComponentProps<typeof SubmitReview>> = {}) {
  const loc = props.selectedLocation ?? makeLocation({ lastScore: 1000 });
  const drv = props.currentDriver ?? makeDriver();
  const txn = makeTransaction({ id: 'tx-done', locationId: loc.id, locationName: loc.name });

  return {
    loc,
    drv,
    txn,
    ...renderWithProviders(
      <SubmitReview
        selectedLocation={loc}
        currentDriver={drv}
        lang="zh"
        isOnline={true}
        currentScore="1200"
        photoData={null}
        aiReviewData={null}
        coinExchange="0"
        tip="0"
        startupDebtDeduction="0"
        draftTxId="draft-1"
        gpsCoords={{ lat: -6.8, lng: 39.2 }}
        gpsPermission="granted"
        isOwnerRetaining={false}
        ownerRetention="0"
        calculations={defaultCalculations()}
        onSubmit={jest.fn()}
        onBack={jest.fn()}
        onReset={jest.fn()}
        onRequestGps={jest.fn()}
        allTransactions={[]}
        todayStr="2026-05-20"
        {...props}
      />,
      {
        auth: { userRole: 'driver', activeDriverId: drv.id },
      },
    ),
  };
}

describe('SubmitReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetFixtureCounter();

    mockUseCollectionSubmission.mockReturnValue(defaultSubmissionState());
    mockUseConfirm.mockReturnValue({ confirm: jest.fn().mockResolvedValue(true) });
    mockExtractGps.mockResolvedValue(null);
    mockEstimateLocation.mockReturnValue(null);
  });

  // ─── RENDER PATHS ────────────────────────────────────────────────────────

  it('renders confirmation screen with net payable, GPS status, and submit button (non-embedded)', async () => {
    renderSR();

    expect(screen.getByTestId('mock-wizard-stepbar')).toBeInTheDocument();
    expect(screen.getByTestId('mock-workbench-header')).toBeInTheDocument();
    expect(screen.getByText('TZS 34,000')).toBeInTheDocument();
    expect(screen.getByTestId('driver-submit-button')).toBeInTheDocument();
    expect(screen.getByTestId('driver-submit-button')).not.toBeDisabled();
  });

  it('renders completion screen when completionResult is set (server source)', async () => {
    const txn = makeTransaction({ id: 'tx-done', locationName: 'Site Alpha', currentScore: 1200, netPayable: 34000 });
    mockUseCollectionSubmission.mockReturnValue(
      defaultSubmissionState({
        state: { status: 'success', source: 'server', transaction: txn },
      }),
    );

    renderSR();

    await waitFor(() => {
      expect(screen.getByTestId('driver-submit-complete')).toBeInTheDocument();
    });

    // Completion screen elements
    expect(screen.getByText('任务完成')).toBeInTheDocument();
    expect(screen.getByText('Site Alpha')).toBeInTheDocument();
    expect(screen.getByText('已成功提交到云端。')).toBeInTheDocument();
    expect(screen.getByText('云端已保存')).toBeInTheDocument();

    // Return home button
    expect(screen.getByTestId('driver-return-home')).toBeInTheDocument();
    expect(screen.getByLabelText('返回收款首页')).toBeInTheDocument();

    // No submit button
    expect(screen.queryByTestId('driver-submit-button')).not.toBeInTheDocument();
  });

  it('renders completion screen with offline source labels', async () => {
    const txn = makeTransaction({ id: 'tx-off', locationName: 'Site Beta', currentScore: 1100, netPayable: 30000 });
    mockUseCollectionSubmission.mockReturnValue(
      defaultSubmissionState({
        state: { status: 'success', source: 'offline', transaction: txn },
      }),
    );

    renderSR();

    await waitFor(() => {
      expect(screen.getByTestId('driver-submit-complete')).toBeInTheDocument();
    });

    expect(screen.getByText('已加入待同步队列。')).toBeInTheDocument();
    expect(screen.getByText('待同步')).toBeInTheDocument();
  });

  // ─── INPUT VALIDATION / BLOCKERS ──────────────────────────────────────────

  it('disables submit button when currentScore is empty', () => {
    renderSR({ currentScore: '' });

    const btn = screen.getByTestId('driver-submit-button');
    expect(btn).toBeDisabled();
  });

  it('disables submit button and shows warning when score below last reading', () => {
    const loc = makeLocation({ lastScore: 2000 });
    renderSR({ selectedLocation: loc, currentScore: '1500' });

    const btn = screen.getByTestId('driver-submit-button');
    expect(btn).toBeDisabled();

    expect(screen.getByText(/当前读数低于上次记录/)).toBeInTheDocument();
  });

  it('shows photo-missing warning when draftTxId exists but no photoData', () => {
    renderSR({ photoData: null, draftTxId: 'draft-1' });

    expect(screen.getByText(/照片在刷新后丢失/)).toBeInTheDocument();
  });

  it('hides photo-missing warning when photoData is present', () => {
    renderSR({ photoData: 'data:image/png;base64,abc123', draftTxId: 'draft-1' });

    expect(screen.queryByText(/照片在刷新后丢失/)).not.toBeInTheDocument();
  });

  // ─── EMBEDDED MODE ────────────────────────────────────────────────────────

  it('renders embedded mode without WizardStepBar or CollectionWorkbenchHeader', () => {
    renderSR({ embedded: true, nextMachine: null });

    expect(screen.queryByTestId('mock-wizard-stepbar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-workbench-header')).not.toBeInTheDocument();
    expect(screen.getByText(/提交后由管理员复核入账/)).toBeInTheDocument();
  });

  // ─── SUBMISSION BLOCKERS ──────────────────────────────────────────────────

  it('shows submission blockers and disables submit button', () => {
    renderSR({ submissionBlockers: ['缺少照片', 'GPS未获取'] });

    expect(screen.getByText('提交前需要补充')).toBeInTheDocument();
    expect(screen.getByText('缺少照片')).toBeInTheDocument();
    expect(screen.getByText('GPS未获取')).toBeInTheDocument();

    const btn = screen.getByTestId('driver-submit-button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('资料不完整');
  });

  // ─── ERROR STATE ──────────────────────────────────────────────────────────

  it('renders confirmation screen after error (does not show completion)', async () => {
    mockUseCollectionSubmission.mockReturnValue(
      defaultSubmissionState({
        state: { status: 'error', message: 'Network timeout' },
      }),
    );

    renderSR();

    // Error state should reset back to confirmation screen (not completion)
    await waitFor(() => {
      expect(screen.getByTestId('driver-submit-button')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('driver-submit-complete')).not.toBeInTheDocument();
    expect(screen.queryByText('任务完成')).not.toBeInTheDocument();
  });

  // ─── GPS STATUS DISPLAY ───────────────────────────────────────────────────

  it('shows GPS denied state when gpsPermission is denied', () => {
    const loc = makeLocation();
    // Need to check what t.gpsDenied resolves to — it's from TRANSLATIONS
    renderSR({
      selectedLocation: loc,
      gpsCoords: null,
      gpsPermission: 'denied',
    });

    // The GPS status row should show denied state (rose styling)
    // 拒绝 is the zh translation for GPS denied
    expect(screen.getByText('GPS已拒绝')).toBeInTheDocument();
  });

  // ─── RETURN HOME ──────────────────────────────────────────────────────────

  it('calls onReturnHome when return-home button clicked from completion screen', async () => {
    const onReturnHome = jest.fn();
    const txn = makeTransaction({ id: 'tx-done', locationName: 'Site Gamma', currentScore: 1200, netPayable: 34000 });

    mockUseCollectionSubmission.mockReturnValue(
      defaultSubmissionState({
        state: { status: 'success', source: 'server', transaction: txn },
      }),
    );

    renderSR({ onReturnHome });

    await waitFor(() => {
      expect(screen.getByTestId('driver-return-home')).toBeInTheDocument();
    });

    screen.getByTestId('driver-return-home').click();
    expect(onReturnHome).toHaveBeenCalledTimes(1);
  });
});
