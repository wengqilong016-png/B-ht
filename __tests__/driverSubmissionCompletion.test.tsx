import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { ConfirmProvider } from '../contexts/ConfirmContext';
import { ToastProvider } from '../contexts/ToastContext';
import SubmitReview, { type CompletionResult } from '../driver/components/SubmitReview';
import { orchestrateCollectionSubmission } from '../services/collectionSubmissionOrchestrator';

import type { Transaction } from '../types';

jest.mock('../services/collectionSubmissionOrchestrator', () => ({
  orchestrateCollectionSubmission: jest.fn(),
}));

const mockedOrchestrateCollectionSubmission =
  orchestrateCollectionSubmission as unknown as jest.MockedFunction<typeof orchestrateCollectionSubmission>;

function withProviders(ui: React.ReactElement) {
  return (
    <ToastProvider>
      <ConfirmProvider>{ui}</ConfirmProvider>
    </ToastProvider>
  );
}

const baseLocation = {
  id: 'loc-1',
  name: 'Bahati Shop',
  machineId: 'M-100',
  area: 'Kariakoo',
  lastScore: 1000,
  coords: { lat: -6.8, lng: 39.2 },
};

const baseDriver = {
  id: 'drv-1',
  name: 'Driver One',
};

const baseCalculations = {
  diff: 200,
  revenue: 200,
  commission: 60,
  finalRetention: 140,
  startupDebtDeduction: 0,
  netPayable: 140,
  remainingCoins: 100,
  isCoinStockNegative: false,
};

const baseTransaction: Transaction = {
  id: 'tx-success',
  timestamp: '2026-04-10T10:00:00.000Z',
  locationId: 'loc-1',
  locationName: 'Bahati Shop',
  driverId: 'drv-1',
  currentScore: 1200,
  netPayable: 140,
  isSynced: true,
  type: 'collection',
} as Transaction;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('driver submission completion', () => {
  it('shows a completion screen after successful submit and returns home on button click', async () => {
    mockedOrchestrateCollectionSubmission.mockResolvedValue({
      source: 'server',
      transaction: baseTransaction,
      fallbackReason: null,
    });

    const onSubmit = jest.fn((_result: CompletionResult) => undefined);
    const onReset = jest.fn();
    const onReturnHome = jest.fn();

    render(
      withProviders(
        <SubmitReview
          selectedLocation={baseLocation as any}
          currentDriver={baseDriver as any}
          lang="zh"
          isOnline={true}
          currentScore="1200"
          photoData="data:image/jpeg;base64,abc"
          aiReviewData={null}
          expenses="0"
          expenseType="public"
          expenseCategory="tip"
          expenseDescription=""
          coinExchange="0"
          tip="0"
          startupDebtDeduction="0"
          draftTxId="draft-1"
          gpsCoords={{ lat: -6.8, lng: 39.2 }}
          gpsPermission="granted"
          isOwnerRetaining={true}
          ownerRetention=""
          calculations={baseCalculations}
          onSubmit={onSubmit}
          onBack={jest.fn()}
          onSwitchMachine={jest.fn()}
          onReset={onReset}
          onReturnHome={onReturnHome}
          onRequestGps={jest.fn()}
          nextMachine={null}
          pendingCount={0}
          allTransactions={[]}
          todayStr="2026-04-10"
        />,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: '提交报告' }));

    await waitFor(() => expect(screen.getByText('任务完成')).toBeTruthy());
    expect(screen.getByText('Bahati Shop')).toBeTruthy();
    expect(screen.getByText('1,200')).toBeTruthy();
    expect(screen.getByText('TZS 140')).toBeTruthy();
    expect(screen.getByText('云端已保存')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '返回收款首页' }));
    expect(onReturnHome).toHaveBeenCalledTimes(1);
    expect(onReset).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith({ source: 'server', transaction: baseTransaction });
  });

  it('shows offline completion state when submission falls back locally', async () => {
    mockedOrchestrateCollectionSubmission.mockResolvedValue({
      source: 'offline',
      transaction: { ...baseTransaction, isSynced: false, id: 'tx-offline' } as Transaction,
      fallbackReason: 'network down',
    });

    render(
      withProviders(
        <SubmitReview
          selectedLocation={baseLocation as any}
          currentDriver={baseDriver as any}
          lang="zh"
          isOnline={false}
          currentScore="1200"
          photoData="data:image/jpeg;base64,abc"
          aiReviewData={null}
          expenses="0"
          expenseType="public"
          expenseCategory="tip"
          expenseDescription=""
          coinExchange="0"
          tip="0"
          startupDebtDeduction="0"
          draftTxId="draft-2"
          gpsCoords={{ lat: -6.8, lng: 39.2 }}
          gpsPermission="granted"
          isOwnerRetaining={true}
          ownerRetention=""
          calculations={baseCalculations}
          onSubmit={jest.fn(() => undefined)}
          onBack={jest.fn()}
          onSwitchMachine={jest.fn()}
          onReset={jest.fn()}
          onRequestGps={jest.fn()}
          nextMachine={null}
          pendingCount={0}
          allTransactions={[]}
          todayStr="2026-04-10"
        />,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: '提交报告' }));

    await waitFor(() => expect(screen.getByText('待同步')).toBeTruthy());
    expect(screen.getByText('已加入待同步队列。')).toBeTruthy();
  });

  it('consumes a successful submission once even when completion handling rerenders the parent', async () => {
    mockedOrchestrateCollectionSubmission.mockResolvedValue({
      source: 'server',
      transaction: baseTransaction,
      fallbackReason: null,
    });

    const onSubmitSpy = jest.fn((_result: CompletionResult) => undefined);

    function RerenderingHarness() {
      const [completionCount, setCompletionCount] = React.useState(0);

      return (
        <>
          <span data-testid="parent-completion-count">{completionCount}</span>
          <SubmitReview
            selectedLocation={baseLocation as any}
            currentDriver={baseDriver as any}
            lang="zh"
            isOnline={true}
            currentScore="1200"
            photoData="data:image/jpeg;base64,abc"
            aiReviewData={null}
            expenses="0"
            expenseType="public"
            expenseCategory="tip"
            expenseDescription=""
            coinExchange="0"
            tip="0"
            startupDebtDeduction="0"
            draftTxId="draft-rerender"
            gpsCoords={{ lat: -6.8, lng: 39.2 }}
            gpsPermission="granted"
            isOwnerRetaining={true}
            ownerRetention=""
            calculations={baseCalculations}
            onSubmit={async (result) => {
              onSubmitSpy(result);
              setCompletionCount((count) => count + 1);
              await Promise.resolve();
            }}
            onBack={jest.fn()}
            onSwitchMachine={jest.fn()}
            onReset={jest.fn()}
            onRequestGps={jest.fn()}
            nextMachine={null}
            pendingCount={0}
            allTransactions={[]}
            todayStr="2026-04-10"
          />
        </>
      );
    }

    render(<React.StrictMode>{withProviders(<RerenderingHarness />)}</React.StrictMode>);

    fireEvent.click(screen.getByRole('button', { name: '提交报告' }));

    await waitFor(() => expect(screen.getByText('任务完成')).toBeTruthy());
    expect(onSubmitSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('parent-completion-count').textContent).toBe('1');
  });

  it('blocks duplicate same-day submission when user cancels at confirm modal', async () => {
    mockedOrchestrateCollectionSubmission.mockResolvedValue({
      source: 'server',
      transaction: baseTransaction,
      fallbackReason: null,
    });

    const onSubmit = jest.fn((_result: CompletionResult) => undefined);

    render(
      withProviders(
        <SubmitReview
          selectedLocation={baseLocation as any}
          currentDriver={baseDriver as any}
          lang="zh"
          isOnline={true}
          currentScore="1200"
          photoData={null}
          aiReviewData={null}
          expenses="0"
          expenseType="public"
          expenseCategory="tip"
          expenseDescription=""
          coinExchange="0"
          tip="0"
          startupDebtDeduction="0"
          draftTxId="draft-dup-1"
          gpsCoords={{ lat: -6.8, lng: 39.2 }}
          gpsPermission="granted"
          isOwnerRetaining={true}
          ownerRetention=""
          calculations={baseCalculations}
          onSubmit={onSubmit}
          onBack={jest.fn()}
          onSwitchMachine={jest.fn()}
          onReset={jest.fn()}
          onRequestGps={jest.fn()}
          nextMachine={null}
          pendingCount={0}
          allTransactions={[
            {
              ...baseTransaction,
              id: 'tx-existing-same-day',
              locationId: 'loc-1',
              type: 'collection',
              timestamp: '2026-04-10T08:00:00.000Z',
            } as Transaction,
          ]}
          todayStr="2026-04-10"
        />,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: '提交报告' }));

    await waitFor(() => expect(screen.getByText(/未附加照片/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '继续提交' }));

    await waitFor(() => expect(screen.getByText(/已对此机器提交过一次收款记录/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '取消 / Cancel' }));

    await waitFor(() => expect(screen.queryByText('任务完成')).toBeNull());
    expect(mockedOrchestrateCollectionSubmission).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
