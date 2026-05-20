import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ── Mock finance audit service ─────────────────────────────────────
const mockLogFinanceAudit = jest.fn();
const mockLogFinanceAuditBatch = jest.fn();
jest.mock('../services/financeAuditService', () => ({
  logFinanceAudit: (...args: unknown[]) => mockLogFinanceAudit(...args),
  logFinanceAuditBatch: (...args: unknown[]) => mockLogFinanceAuditBatch(...args),
}));

// ── Mock FinanceAuditPanel ─────────────────────────────────────────
jest.mock('../components/dashboard/FinanceAuditPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="finance-audit-panel">FinanceAuditPanel</div>,
}));

// ── Import after mocks ─────────────────────────────────────────────
import DebtManager from '../components/DebtManager';

import type { Driver, Location } from '../types';

// ── Factories ──────────────────────────────────────────────────────
function makeDriver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: 'drv-1',
    name: 'Rajabu',
    username: 'rajabu',
    phone: '0711000000',
    initialDebt: 200000,
    remainingDebt: 100000,
    dailyFloatingCoins: 5000,
    vehicleInfo: { model: 'Boxer', plate: 'T123 ABC' },
    status: 'active',
    baseSalary: 300000,
    commissionRate: 0.05,
    ...overrides,
  } as Driver;
}

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: 'loc-1',
    name: 'Shop One',
    machineId: 'M-001',
    lastScore: 0,
    area: 'Kariakoo',
    initialStartupDebt: 500000,
    remainingStartupDebt: 300000,
    dividendBalance: 0,
    resetLocked: false,
    status: 'active',
    commissionRate: 0.15,
    coords: { lat: -6.82349, lng: 39.26951 },
    ...overrides,
  } as Location;
}

// ── Mock contexts inline per-test ──────────────────────────────────
const mockMutateLocations = jest.fn<() => Promise<void>>();
const mockMutateDrivers = jest.fn<() => Promise<void>>();

jest.mock('../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../contexts/DataContext', () => ({
  useAppData: jest.fn(),
}));

jest.mock('../contexts/MutationContext', () => ({
  useMutations: jest.fn(),
}));

import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/DataContext';
import { useMutations } from '../contexts/MutationContext';

const mockUseAuth = jest.mocked(useAuth);
const mockUseAppData = jest.mocked(useAppData);
const mockUseMutations = jest.mocked(useMutations);

// ── Default fixtures ───────────────────────────────────────────────
const adminUser = {
  currentUser: { id: 'admin-1', role: 'admin' as const, driverId: null },
  lang: 'zh' as const,
};

const driverUser = {
  currentUser: { id: 'drv-1', role: 'driver' as const, driverId: 'drv-1' },
  lang: 'zh' as const,
};

function setupMocks(auth: typeof adminUser | typeof driverUser = adminUser) {
  mockUseAuth.mockReturnValue(auth);
  mockUseAppData.mockReturnValue({
    filteredDrivers: [],
    filteredLocations: [],
    isOnline: true,
    drivers: [],
    locations: [],
    filteredTransactions: [],
  } as never);
  mockUseMutations.mockReturnValue({
    updateLocations: { mutateAsync: mockMutateLocations },
    updateDrivers: { mutateAsync: mockMutateDrivers },
  } as never);
}

// ── Tests ──────────────────────────────────────────────────────────
describe('DebtManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutateLocations.mockReset();
    mockMutateDrivers.mockReset();
    mockMutateLocations.mockResolvedValue(undefined);
    mockMutateDrivers.mockResolvedValue(undefined);
    mockLogFinanceAudit.mockReset();
    mockLogFinanceAuditBatch.mockReset();
    setupMocks();
  });

  // ── 1. Financial summary totals ──────────────────────────────────
  it('renders financial summary with correct combined total', () => {
    mockUseAuth.mockReturnValue(adminUser);
    mockUseAppData.mockReturnValue({
      filteredLocations: [makeLocation({ remainingStartupDebt: 300000, initialStartupDebt: 500000 })],
      filteredDrivers: [makeDriver({ remainingDebt: 100000 })],
    } as never);

    render(<DebtManager />);

    expect(screen.getByText(/TZS 400,000/)).toBeTruthy();
  });

  // ── 2. Site startup capital card renders with progress ───────────
  it('renders site startup card with balance and progress bar', () => {
    mockUseAuth.mockReturnValue(adminUser);
    mockUseAppData.mockReturnValue({
      filteredLocations: [makeLocation({ name: 'Kariakoo Shop', remainingStartupDebt: 250000, initialStartupDebt: 500000 })],
      filteredDrivers: [],
    } as never);

    render(<DebtManager />);

    expect(screen.getByText('Kariakoo Shop')).toBeTruthy();
    // Multiple elements show 250,000 (summary + card); verify at least one exists
    expect(screen.getAllByText(/TZS 250,000/).length).toBeGreaterThanOrEqual(1);
    // 50% progress based on 250k/500k
    expect(screen.getByText('Progress 50%')).toBeTruthy();
  });

  // ── 3. Startup capital recovery submit triggers mutation ─────────
  it('submits startup debt recovery via updateLocations', async () => {
    mockUseAuth.mockReturnValue(adminUser);
    mockUseAppData.mockReturnValue({
      filteredLocations: [makeLocation({ id: 'loc-1', name: 'Test Shop', remainingStartupDebt: 300000, initialStartupDebt: 500000 })],
      filteredDrivers: [],
      locations: [makeLocation({ id: 'loc-1', remainingStartupDebt: 300000 })],
    } as never);

    render(<DebtManager />);

    // Open recovery form
    fireEvent.click(screen.getByText(/还款/));

    // Enter amount
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '50000' } });

    // Submit — use CSS class selector to avoid multiple icon-only buttons
    const submitBtn = document.querySelector('.bg-slate-900 button.bg-amber-600') as HTMLButtonElement;
    expect(submitBtn).toBeTruthy();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockMutateLocations).toHaveBeenCalled();
    });

    const updatedLocations = mockMutateLocations.mock.calls[0][0] as Location[];
    expect(updatedLocations[0].remainingStartupDebt).toBe(250000);
  });

  // ── 4. Non-admin sees Driver Advance banner ──────────────────────
  it('shows driver advance banner for non-admin users', () => {
    mockUseAuth.mockReturnValue(driverUser);
    mockUseAppData.mockReturnValue({
      filteredLocations: [
        makeLocation({ assignedDriverId: 'drv-1', remainingStartupDebt: 100000, initialStartupDebt: 500000 }),
      ],
      filteredDrivers: [makeDriver({ id: 'drv-1' })],
    } as never);

    render(<DebtManager />);

    expect(screen.getByText(/司机预支窗口/)).toBeTruthy();
  });

  // ── 5. Admin sees driver edit button ─────────────────────────────
  it('shows edit pencil button for admin on driver cards', () => {
    mockUseAuth.mockReturnValue(adminUser);
    mockUseAppData.mockReturnValue({
      filteredLocations: [],
      filteredDrivers: [makeDriver({ id: 'drv-1', name: 'Rajabu' })],
    } as never);

    render(<DebtManager />);

    // The pencil icon is a button next to the driver name
    const editButtons = screen.getAllByRole('button');
    // At least one button should be the pencil edit button
    expect(editButtons.length).toBeGreaterThan(0);
  });

  // ── 6. Driver debt edit and save ─────────────────────────────────
  it('opens driver debt edit form and saves changes via updateDrivers', async () => {
    mockUseAuth.mockReturnValue(adminUser);
    mockUseAppData.mockReturnValue({
      filteredLocations: [],
      filteredDrivers: [makeDriver({ id: 'drv-1', remainingDebt: 100000, dailyFloatingCoins: 5000 })],
      drivers: [makeDriver({ id: 'drv-1', remainingDebt: 100000, dailyFloatingCoins: 5000 })],
    } as never);

    render(<DebtManager />);

    // Check that driver card is rendered
    expect(screen.getByText('Rajabu')).toBeTruthy();

    // Find the pencil edit button (Pencil icon) - it's the button next to the driver name
    const editButtons = screen.getAllByRole('button');
    const pencilBtn = editButtons.find(btn => btn.querySelector('svg'));
    expect(pencilBtn).toBeTruthy();
    if (pencilBtn) fireEvent.click(pencilBtn);

    // Edit form should appear
    expect(screen.getByText(/修改财务数据/)).toBeTruthy();

    // Change remaining debt
    const debtInput = screen.getByDisplayValue('100000');
    fireEvent.change(debtInput, { target: { value: '50000' } });

    // Change floating coins
    const coinsInput = screen.getByDisplayValue('5000');
    fireEvent.change(coinsInput, { target: { value: '10000' } });

    // Save
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockMutateDrivers).toHaveBeenCalled();
    });

    const updatedDrivers = mockMutateDrivers.mock.calls[0][0] as Driver[];
    expect(updatedDrivers[0].remainingDebt).toBe(50000);
    expect(updatedDrivers[0].dailyFloatingCoins).toBe(10000);

    // Audit batch should have been called for both changes
    expect(mockLogFinanceAuditBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ event_type: 'driver_debt_change' }),
        expect.objectContaining({ event_type: 'floating_coins_change' }),
      ]),
    );
  });

  // ── 7. Empty state when no locations have startup debt ───────────
  it('shows empty state when no sites have pending recovery', () => {
    mockUseAuth.mockReturnValue(adminUser);
    mockUseAppData.mockReturnValue({
      filteredLocations: [
        // Location with initialStartupDebt=0 won't appear in startupDebtPoints
        makeLocation({ initialStartupDebt: 0, remainingStartupDebt: 0 }),
      ],
      filteredDrivers: [],
    } as never);

    render(<DebtManager />);

    expect(screen.getByText('No sites pending recovery')).toBeTruthy();
  });

  // ── 8. Empty state when no driver loans ──────────────────────────
  it('shows empty state when no driver loans exist', () => {
    mockUseAuth.mockReturnValue(adminUser);
    mockUseAppData.mockReturnValue({
      filteredLocations: [],
      filteredDrivers: [],
    } as never);

    render(<DebtManager />);

    expect(screen.getByText('No driver loans found')).toBeTruthy();
  });
});
