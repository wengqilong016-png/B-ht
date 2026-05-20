jest.mock('../supabaseClient', () => ({ supabase: null }));
jest.mock('../services/driverFlowTelemetry', () => ({
  recordDriverFlowEvent: jest.fn(),
  flushDriverFlowEvents: jest.fn(),
}));
jest.mock('../services/financeCalculator', () => ({
  calculateCollectionFinanceLocal: jest.fn(() => ({
    diff: 200, revenue: 40000, commission: 6000, finalRetention: 6000,
    startupDebtDeduction: 0, netPayable: 34000, remainingCoins: 100,
    isCoinStockNegative: false, source: 'local',
  })),
  calculateCollectionFinancePreview: jest.fn(() =>
    Promise.resolve({
      diff: 200, revenue: 40000, commission: 6000, finalRetention: 6000,
      startupDebtDeduction: 0, netPayable: 34000, remainingCoins: 100,
      isCoinStockNegative: false, source: 'rpc',
    }),
  ),
}));
jest.mock('../driver/hooks/useGpsCapture', () => ({
  useGpsCapture: jest.fn((_existingCoords: any) => ({
    coords: null,
    status: 'idle' as const,
    request: jest.fn().mockResolvedValue(null),
  })),
}));

// Mock child components to isolate DriverCollectionFlow routing logic
const React = require('react');

jest.mock('../driver/components/MachineSelector', () => ({
  __esModule: true,
  default: (props: any) =>
    React.createElement('div', { 'data-testid': 'machine-selector' },
      React.createElement('button', {
        'data-testid': 'select-machine-btn',
        onClick: () => props.onSelectMachine('loc-1'),
      }, 'Select'),
      React.createElement('button', {
        'data-testid': 'register-btn',
        onClick: props.onStartRegister,
      }, 'Register'),
      React.createElement('button', {
        'data-testid': 'reset-request-btn',
        onClick: () => props.onRequestReset('loc-1'),
      }, 'ResetRequest'),
      React.createElement('button', {
        'data-testid': 'payout-request-btn',
        onClick: () => props.onRequestPayout('loc-1'),
      }, 'PayoutRequest'),
      props.currentDraftLocation
        ? React.createElement('button', {
            'data-testid': 'resume-draft-btn',
            onClick: () => props.onResumeDraft?.('loc-1'),
          }, 'Resume')
        : null,
    ),
}));

jest.mock('../driver/components/ReadingCapture', () => ({
  __esModule: true,
  default: (props: any) =>
    React.createElement('div', { 'data-testid': 'reading-capture' },
      React.createElement('button', {
        'data-testid': 'capture-next-btn',
        onClick: props.onNext,
      }, 'Next'),
      React.createElement('button', {
        'data-testid': 'capture-back-btn',
        onClick: props.onBack,
      }, 'Back'),
      React.createElement('button', {
        'data-testid': 'capture-switch-btn',
        onClick: props.onSwitchMachine,
      }, 'Switch'),
    ),
}));

jest.mock('../driver/components/FinanceSummary', () => ({
  __esModule: true,
  default: (props: any) =>
    React.createElement('div', { 'data-testid': 'finance-summary' },
      React.createElement('button', {
        'data-testid': 'amounts-next-btn',
        onClick: props.onNext,
      }, 'Next'),
      React.createElement('button', {
        'data-testid': 'amounts-back-btn',
        onClick: props.onBack,
      }, 'Back'),
      React.createElement('button', {
        'data-testid': 'amounts-switch-btn',
        onClick: props.onSwitchMachine,
      }, 'Switch'),
    ),
}));

jest.mock('../driver/components/SubmitReview', () => ({
  __esModule: true,
  default: (props: any) =>
    React.createElement('div', { 'data-testid': 'submit-review' },
      React.createElement('button', {
        'data-testid': 'confirm-back-btn',
        onClick: props.onBack,
      }, 'Back'),
      React.createElement('button', {
        'data-testid': 'confirm-reset-btn',
        onClick: props.onReset,
      }, 'Reset'),
      React.createElement('button', {
        'data-testid': 'confirm-switch-btn',
        onClick: props.onSwitchMachine,
      }, 'Switch'),
    ),
}));

jest.mock('../components/MachineRegistrationForm', () => ({
  __esModule: true,
  default: (props: any) =>
    React.createElement('div', { 'data-testid': 'machine-registration-form' },
      React.createElement('button', {
        'data-testid': 'registration-cancel-btn',
        onClick: props.onCancel,
      }, 'Cancel'),
    ),
}));

jest.mock('../driver/components/ResetRequest', () => ({
  __esModule: true,
  default: (props: any) =>
    React.createElement('div', { 'data-testid': 'reset-request' },
      React.createElement('button', {
        'data-testid': 'reset-cancel-btn',
        onClick: props.onCancel,
      }, 'Cancel'),
    ),
}));

jest.mock('../driver/components/PayoutRequest', () => ({
  __esModule: true,
  default: (props: any) =>
    React.createElement('div', { 'data-testid': 'payout-request' },
      React.createElement('button', {
        'data-testid': 'payout-cancel-btn',
        onClick: props.onCancel,
      }, 'Cancel'),
    ),
}));

import { QueryClient } from '@tanstack/react-query';
import { fireEvent, screen } from '@testing-library/react';

import { ConfirmProvider } from '../contexts/ConfirmContext';
import { MutationProvider } from '../contexts/MutationContext';
import DriverCollectionFlow from '../driver/pages/DriverCollectionFlow';

import { makeDriver, makeLocation } from './helpers/fixtures';
import { renderWithProviders } from './helpers/test-utils';

// ─── Helpers ─────────────────────────────────────────────────────────────

const driver = makeDriver({ id: 'drv-1', name: 'Tester', dailyFloatingCoins: 100 });
const loc1 = makeLocation({ id: 'loc-1', name: 'Machine A', lastScore: 1000, assignedDriverId: 'drv-1' });
const loc2 = makeLocation({ id: 'loc-2', name: 'Machine B', lastScore: 2000, assignedDriverId: 'drv-1' });

function noopMutation() {
  return { mutateAsync: jest.fn().mockResolvedValue(undefined), mutate: jest.fn() } as any;
}

function renderFlow(options: {
  auth?: Record<string, any>;
  data?: Record<string, any>;
  queryClient?: QueryClient;
  flowProps?: {
    onRegisterMachine?: (loc: any) => Promise<void>;
    registrationDoneLabel?: string;
  };
} = {}) {
  const mutationValue = {
    submitTransaction: noopMutation(),
    syncOfflineData: noopMutation(),
    updateLocations: noopMutation(),
    updateDrivers: noopMutation(),
    registerLocation: noopMutation(),
    deleteLocations: noopMutation(),
    deleteDrivers: noopMutation(),
    updateTransaction: noopMutation(),
    createSettlement: noopMutation(),
    reviewSettlement: noopMutation(),
    approveExpenseRequest: noopMutation(),
    reviewAnomalyTransaction: noopMutation(),
    approveResetRequest: noopMutation(),
    approvePayoutRequest: noopMutation(),
    logAI: noopMutation(),
  };

  return renderWithProviders(
    React.createElement(
      MutationProvider,
      { value: mutationValue },
      React.createElement(ConfirmProvider, null, React.createElement(DriverCollectionFlow, options.flowProps)),
    ),
    {
      auth: {
        currentUser: { id: 'u1', role: 'driver', name: 'T', driverId: 'drv-1' } as any,
        userRole: 'driver',
        activeDriverId: 'drv-1',
        lang: 'sw' as const,
        setLang: jest.fn(),
        handleLogout: jest.fn(),
        ...options.auth,
      },
      data: {
        drivers: [driver],
        filteredLocations: [loc1, loc2],
        filteredTransactions: [],
        isOnline: true,
        ...options.data,
      },
      queryClient: options.queryClient,
    },
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('DriverCollectionFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the machine selection step by default', async () => {
    renderFlow();
    expect(await screen.findByTestId('machine-selector')).toBeInTheDocument();
  });

  it('returns null when no currentDriver is resolved (empty drivers)', () => {
    const { container } = renderFlow({
      data: { drivers: [], filteredLocations: [loc1] },
      auth: { activeDriverId: undefined },
    });
    // DriverCollectionFlow returns null, so no step wrapper should exist
    expect(container.querySelector('[data-testid^="driver-flow-step"]')).toBeNull();
    expect(container.querySelector('[data-testid="machine-selector"]')).toBeNull();
  });

  it('renders the MachineRegistrationForm sub-view when registration is triggered', async () => {
    renderFlow({ flowProps: { onRegisterMachine: jest.fn().mockResolvedValue(undefined) } });
    fireEvent.click(await screen.findByTestId('register-btn'));
    expect(await screen.findByTestId('machine-registration-form')).toBeInTheDocument();
    // MachineSelector should no longer be visible
    expect(screen.queryByTestId('machine-selector')).toBeNull();
  });

  it('renders ResetRequest sub-view when reset is requested', async () => {
    renderFlow();
    fireEvent.click(await screen.findByTestId('reset-request-btn'));
    expect(await screen.findByTestId('reset-request')).toBeInTheDocument();
  });

  it('renders PayoutRequest sub-view when payout is requested', async () => {
    renderFlow();
    fireEvent.click(await screen.findByTestId('payout-request-btn'));
    expect(await screen.findByTestId('payout-request')).toBeInTheDocument();
  });

  it('transitions from selection → capture when machine is selected', async () => {
    renderFlow();
    fireEvent.click(await screen.findByTestId('select-machine-btn'));
    expect(await screen.findByTestId('reading-capture')).toBeInTheDocument();
    expect(screen.queryByTestId('machine-selector')).toBeNull();
  });

  it('transitions capture → amounts when Next is clicked', async () => {
    renderFlow();
    // Select machine → in capture step
    fireEvent.click(await screen.findByTestId('select-machine-btn'));
    await screen.findByTestId('reading-capture');
    // Click Next → amounts step
    fireEvent.click(screen.getByTestId('capture-next-btn'));
    expect(await screen.findByTestId('finance-summary')).toBeInTheDocument();
  });

  it('transitions amounts → confirm when Next is clicked', async () => {
    renderFlow();
    // Navigate to amounts
    fireEvent.click(await screen.findByTestId('select-machine-btn'));
    await screen.findByTestId('reading-capture');
    fireEvent.click(screen.getByTestId('capture-next-btn'));
    await screen.findByTestId('finance-summary');
    // Click Next → confirm step
    fireEvent.click(screen.getByTestId('amounts-next-btn'));
    expect(await screen.findByTestId('submit-review')).toBeInTheDocument();
  });

  it('transitions back from capture → selection', async () => {
    renderFlow();
    // Enter capture then go back
    fireEvent.click(await screen.findByTestId('select-machine-btn'));
    await screen.findByTestId('reading-capture');
    fireEvent.click(screen.getByTestId('capture-back-btn'));
    // Should be back at selection
    expect(await screen.findByTestId('machine-selector')).toBeInTheDocument();
    expect(screen.queryByTestId('reading-capture')).toBeNull();
  });

  it('transitions back from amounts → capture', async () => {
    renderFlow();
    // Navigate to amounts
    fireEvent.click(await screen.findByTestId('select-machine-btn'));
    await screen.findByTestId('reading-capture');
    fireEvent.click(screen.getByTestId('capture-next-btn'));
    await screen.findByTestId('finance-summary');
    // Go back
    fireEvent.click(screen.getByTestId('amounts-back-btn'));
    expect(await screen.findByTestId('reading-capture')).toBeInTheDocument();
    expect(screen.queryByTestId('finance-summary')).toBeNull();
  });

  it('transitions back from confirm → amounts', async () => {
    renderFlow();
    // Navigate to confirm
    fireEvent.click(await screen.findByTestId('select-machine-btn'));
    await screen.findByTestId('reading-capture');
    fireEvent.click(screen.getByTestId('capture-next-btn'));
    await screen.findByTestId('finance-summary');
    fireEvent.click(screen.getByTestId('amounts-next-btn'));
    await screen.findByTestId('submit-review');
    // Go back
    fireEvent.click(screen.getByTestId('confirm-back-btn'));
    expect(await screen.findByTestId('finance-summary')).toBeInTheDocument();
    expect(screen.queryByTestId('submit-review')).toBeNull();
  });

  it('full reset returns to selection step', async () => {
    renderFlow();
    // Navigate to confirm
    fireEvent.click(await screen.findByTestId('select-machine-btn'));
    await screen.findByTestId('reading-capture');
    fireEvent.click(screen.getByTestId('capture-next-btn'));
    await screen.findByTestId('finance-summary');
    fireEvent.click(screen.getByTestId('amounts-next-btn'));
    await screen.findByTestId('submit-review');
    // Click Reset → back to selection
    fireEvent.click(screen.getByTestId('confirm-reset-btn'));
    expect(await screen.findByTestId('machine-selector')).toBeInTheDocument();
    expect(screen.queryByTestId('submit-review')).toBeNull();
  });
});
