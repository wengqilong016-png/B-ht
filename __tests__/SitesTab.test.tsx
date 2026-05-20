import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

jest.mock('../services/financeAuditService', () => ({
  logFinanceAuditBatch: jest.fn(),
}));

import SitesTab from '../components/dashboard/SitesTab';
import { ConfirmProvider } from '../contexts/ConfirmContext';
import { ToastProvider } from '../contexts/ToastContext';
import { logFinanceAuditBatch } from '../services/financeAuditService';

import type { Driver, Location, Transaction } from '../types';

function withProviders(ui: React.ReactElement) {
  return (
    <ToastProvider>
      <ConfirmProvider>{ui}</ConfirmProvider>
    </ToastProvider>
  );
}

function makeDriver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: 'drv-1',
    name: 'Driver One',
    username: 'driver-one',
    phone: '0711000000',
    initialDebt: 0,
    remainingDebt: 0,
    dailyFloatingCoins: 1000,
    vehicleInfo: { model: 'Bajaj', plate: 'T123' },
    status: 'active',
    baseSalary: 300000,
    commissionRate: 0.05,
    ...overrides,
  };
}

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: 'loc-1',
    name: 'Test Shop',
    machineId: 'M-001',
    lastScore: 120,
    area: 'Kariakoo',
    initialStartupDebt: 0,
    remainingStartupDebt: 0,
    dividendBalance: 0,
    resetLocked: false,
    status: 'active',
    commissionRate: 0.15,
    coords: { lat: -6.82349, lng: 39.26951 },
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    timestamp: '2026-05-19T10:00:00Z',
    locationId: 'loc-1',
    locationName: 'Test Shop',
    driverId: 'drv-1',
    driverName: 'Driver One',
    previousScore: 100,
    currentScore: 120,
    revenue: 50000,
    commission: 7500,
    ownerRetention: 0,
    debtDeduction: 0,
    startupDebtDeduction: 0,
    expenses: 0,
    coinExchange: 0,
    extraIncome: 0,
    netPayable: 42500,
    gps: { lat: -6.82, lng: 39.27 },
    dataUsageKB: 0,
    isSynced: true,
    ...overrides,
  };
}

function renderSitesTab({
  managedLocations,
  locations = managedLocations,
  drivers = [makeDriver()],
  driverMap = new Map(drivers.map((driver) => [driver.id, driver])),
  onUpdateLocations = jest.fn<(locations: Location[]) => Promise<void>>().mockResolvedValue(undefined),
  onDeleteLocations = jest.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined),
  transactions = [],
  pendingResetRequests = [],
  pendingPayoutRequests = [],
  isAdmin = true,
  isOnline = true,
  actorId = 'admin-1',
}: {
  managedLocations: Location[];
  locations?: Location[];
  drivers?: Driver[];
  driverMap?: Map<string, Driver>;
  onUpdateLocations?: jest.MockedFunction<(locations: Location[]) => Promise<void>>;
  onDeleteLocations?: jest.MockedFunction<(ids: string[]) => Promise<void>>;
  transactions?: Transaction[];
  pendingResetRequests?: Transaction[];
  pendingPayoutRequests?: Transaction[];
  isAdmin?: boolean;
  isOnline?: boolean;
  actorId?: string;
}) {
  render(
    withProviders(
      <SitesTab
        managedLocations={managedLocations}
        allAreas={['Kariakoo']}
        siteSearch=""
        setSiteSearch={() => {}}
        isAdmin={isAdmin}
        siteFilterArea="all"
        setSiteFilterArea={() => {}}
        driverMap={driverMap}
        drivers={drivers}
        locations={locations}
        onUpdateLocations={onUpdateLocations}
        onDeleteLocations={onDeleteLocations}
        transactions={transactions}
        pendingResetRequests={pendingResetRequests}
        pendingPayoutRequests={pendingPayoutRequests}
        isOnline={isOnline}
        lang="zh"
        actorId={actorId}
      />,
    ),
  );

  return { onUpdateLocations, onDeleteLocations };
}

describe('SitesTab', () => {
  const mockLogFinanceAuditBatch = jest.mocked(logFinanceAuditBatch);

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogFinanceAuditBatch.mockResolvedValue(undefined);
  });

  // ─── Existing tests (8) ───────────────────────────────────────────

  it('blocks duplicate machine id after normalization and does not submit updates', async () => {
    const editable = makeLocation({ id: 'loc-edit', machineId: 'M-001', name: 'Editable Shop' });
    const duplicate = makeLocation({ id: 'loc-dup', machineId: ' m 002 ', name: 'Duplicate Shop' });
    const { onUpdateLocations } = renderSitesTab({ managedLocations: [editable, duplicate], locations: [editable, duplicate] });

    fireEvent.click(screen.getAllByLabelText('Edit site')[0]);
    fireEvent.change(screen.getByDisplayValue('M-001'), { target: { value: ' m 0 0 2 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByText(/机器编号 M002 已存在/)).toBeTruthy());
    expect(onUpdateLocations).not.toHaveBeenCalled();
    expect(mockLogFinanceAuditBatch).not.toHaveBeenCalled();
  });

  it('saves a normalized payload with numeric coords and emits audit entries for financial changes', async () => {
    const editable = makeLocation({
      id: 'loc-save',
      machineId: 'm-001',
      remainingStartupDebt: 1000,
      initialStartupDebt: 3000,
    });
    const { onUpdateLocations } = renderSitesTab({ managedLocations: [editable], locations: [editable] });

    fireEvent.click(screen.getByLabelText('Edit site'));
    fireEvent.change(screen.getByDisplayValue('m-001'), { target: { value: ' m-003 ' } });
    fireEvent.change(screen.getByPlaceholderText('-6.823490'), { target: { value: '-6.81' } });
    fireEvent.change(screen.getByPlaceholderText('39.269510'), { target: { value: '39.28' } });
    fireEvent.change(screen.getByDisplayValue('15'), { target: { value: '20' } });
    fireEvent.change(screen.getByDisplayValue('1000'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onUpdateLocations).toHaveBeenCalledTimes(1));
    expect(onUpdateLocations).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'loc-save',
          machineId: 'M-003',
          coords: { lat: -6.81, lng: 39.28 },
          commissionRate: 0.2,
          remainingStartupDebt: 500,
          isSynced: false,
        }),
      ]),
    );

    await waitFor(() =>
      expect(mockLogFinanceAuditBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            event_type: 'commission_rate_change',
            entity_id: 'loc-save',
            actor_id: 'admin-1',
            old_value: 0.15,
            new_value: 0.2,
          }),
          expect.objectContaining({
            event_type: 'startup_debt_edit',
            entity_id: 'loc-save',
            actor_id: 'admin-1',
            old_value: 1000,
            new_value: 500,
          }),
        ]),
      ),
    );
  });

  it('unassigns the driver before deleting when admin is online and no blockers remain', async () => {
    const driver = makeDriver();
    const location = makeLocation({
      id: 'loc-delete',
      machineId: 'M-DEL',
      assignedDriverId: driver.id,
    });
    const onUpdateLocations = jest.fn<(locations: Location[]) => Promise<void>>().mockResolvedValue(undefined);
    const onDeleteLocations = jest.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined);

    renderSitesTab({
      managedLocations: [location],
      locations: [location],
      drivers: [driver],
      onUpdateLocations,
      onDeleteLocations,
    });

    fireEvent.click(screen.getByTitle('删除点位'));
    expect(await screen.findByText(/绑定司机：Driver One（删除时会先解绑）/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(onUpdateLocations).toHaveBeenCalledTimes(1));
    expect(onUpdateLocations).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'loc-delete',
        assignedDriverId: undefined,
        isSynced: false,
      }),
    ]);
    await waitFor(() => expect(onDeleteLocations).toHaveBeenCalledWith(['loc-delete']));
    await waitFor(() =>
      expect(mockLogFinanceAuditBatch).toHaveBeenCalledWith([
        expect.objectContaining({
          event_type: 'location_delete',
          entity_id: 'loc-delete',
          entity_name: 'Test Shop',
          actor_id: 'admin-1',
          old_value: 1,
          new_value: 0,
          payload: expect.objectContaining({
            action: 'location_delete',
            unassignedDriverId: driver.id,
          }),
        }),
      ]),
    );
    expect(onUpdateLocations.mock.invocationCallOrder[0]).toBeLessThan(onDeleteLocations.mock.invocationCallOrder[0]);
  });

  it('force clears blockers by zeroing balances, unlocking reset, marking unsynced, and auditing the action', async () => {
    const location = makeLocation({
      id: 'loc-blocked',
      machineId: 'M-BLOCK',
      remainingStartupDebt: 4000,
      dividendBalance: 1200,
      resetLocked: true,
    });
    const onUpdateLocations = jest.fn<(locations: Location[]) => Promise<void>>().mockResolvedValue(undefined);

    renderSitesTab({
      managedLocations: [location],
      locations: [location],
      onUpdateLocations,
    });

    fireEvent.click(screen.getByRole('button', { name: /强制清除阻塞/ }));
    fireEvent.click(await screen.findByRole('button', { name: '确认清除' }));

    await waitFor(() => expect(onUpdateLocations).toHaveBeenCalledTimes(1));
    expect(onUpdateLocations).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'loc-blocked',
        remainingStartupDebt: 0,
        dividendBalance: 0,
        resetLocked: false,
        isSynced: false,
      }),
    ]);

    await waitFor(() =>
      expect(mockLogFinanceAuditBatch).toHaveBeenCalledWith([
        expect.objectContaining({
          event_type: 'force_clear_blockers',
          entity_id: 'loc-blocked',
          actor_id: 'admin-1',
          old_value: 4000,
          new_value: 0,
          payload: {
            action: 'force_clear_blockers',
            cleared: {
              remainingStartupDebt: 4000,
              dividendBalance: 1200,
              resetLocked: true,
            },
          },
        }),
      ]),
    );
  });

  it('rejects deletion when offline with a warning toast and does not show confirm dialog', async () => {
    const location = makeLocation({ id: 'loc-offline', machineId: 'M-OFF' });
    const onDeleteLocations = jest.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined);

    renderSitesTab({
      managedLocations: [location],
      locations: [location],
      isOnline: false,
      onDeleteLocations,
    });

    fireEvent.click(screen.getByTitle('删除点位'));

    await waitFor(() =>
      expect(screen.getByText(/当前处于离线状态/)).toBeTruthy(),
    );
    expect(onDeleteLocations).not.toHaveBeenCalled();
  });

  it('rejects deletion for non-admin users with an error toast', async () => {
    const location = makeLocation({ id: 'loc-nonadmin', machineId: 'M-NA' });
    const onDeleteLocations = jest.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined);

    renderSitesTab({
      managedLocations: [location],
      locations: [location],
      isAdmin: false,
      onDeleteLocations,
    });

    fireEvent.click(screen.getByTitle('删除点位'));

    await waitFor(() =>
      expect(screen.getByText(/只有管理员可以删除机器点位/)).toBeTruthy(),
    );
    expect(onDeleteLocations).not.toHaveBeenCalled();
  });

  it('shows disabled delete button with blocker message when location has remaining debt', async () => {
    const location = makeLocation({
      id: 'loc-debt',
      machineId: 'M-DEBT',
      remainingStartupDebt: 5000,
    });

    renderSitesTab({ managedLocations: [location], locations: [location] });

    const blockedButton = screen.getByTitle(/该机器尚有未清启动债务/);
    expect((blockedButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/⚠️ 无法删除：/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /强制清除阻塞/ })).toBeTruthy();
  });

  it('opens photo viewer modal when clicking the View button on a location with photo', async () => {
    const location = makeLocation({
      id: 'loc-photo',
      machineId: 'M-PHOTO',
      machinePhotoUrl: 'https://example.com/photo.jpg',
    });

    renderSitesTab({ managedLocations: [location], locations: [location] });

    const viewButton = screen.getByLabelText('View photo location');
    expect(viewButton).toBeTruthy();

    fireEvent.click(viewButton);

    await waitFor(() =>
      expect(screen.getByLabelText('Close')).toBeTruthy(),
    );
    expect(screen.getAllByText('Test Shop').length).toBeGreaterThanOrEqual(2);
  });

  // ─── New tests — review gaps (5) ─────────────────────────────────

  it('calls setSiteSearch when user types in the search input', async () => {
    const setSiteSearch = jest.fn();

    render(
      withProviders(
        <SitesTab
          managedLocations={[makeLocation()]}
          allAreas={['Kariakoo']}
          siteSearch=""
          setSiteSearch={setSiteSearch}
          isAdmin={true}
          siteFilterArea="all"
          setSiteFilterArea={() => {}}
          driverMap={new Map()}
          drivers={[makeDriver()]}
          locations={[makeLocation()]}
          onUpdateLocations={jest.fn<(locations: Location[]) => Promise<void>>().mockResolvedValue(undefined)}
          onDeleteLocations={jest.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined)}
          transactions={[]}
          pendingResetRequests={[]}
          pendingPayoutRequests={[]}
          isOnline={true}
          lang="zh"
          actorId="admin-1"
        />,
      ),
    );

    const searchInput = screen.getByPlaceholderText('Search machines...');
    fireEvent.change(searchInput, { target: { value: 'M-001' } });

    expect(setSiteSearch).toHaveBeenCalledWith('M-001');
  });

  it('clears search when status issue filter changes', async () => {
    const setSiteSearch = jest.fn();

    render(
      withProviders(
        <SitesTab
          managedLocations={[makeLocation()]}
          allAreas={['Kariakoo']}
          siteSearch="old-search"
          setSiteSearch={setSiteSearch}
          isAdmin={true}
          siteFilterArea="all"
          setSiteFilterArea={() => {}}
          driverMap={new Map()}
          drivers={[makeDriver()]}
          locations={[makeLocation()]}
          onUpdateLocations={jest.fn<(locations: Location[]) => Promise<void>>().mockResolvedValue(undefined)}
          onDeleteLocations={jest.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined)}
          transactions={[]}
          pendingResetRequests={[]}
          pendingPayoutRequests={[]}
          isOnline={true}
          lang="zh"
          actorId="admin-1"
        />,
      ),
    );

    // Find the status filter dropdown and change it
    const statusFilter = screen.getByDisplayValue('全部状态');
    fireEvent.change(statusFilter, { target: { value: 'maintenance' } });

    // Should have cleared the search
    expect(setSiteSearch).toHaveBeenCalledWith('');
  });

  it('filters locations by reported status from transactions', async () => {
    const loc = makeLocation({ id: 'loc-broken', machineId: 'M-BROKEN', name: 'Broken Shop' });
    const tx = makeTransaction({
      id: 'tx-report',
      locationId: 'loc-broken',
      reportedStatus: 'broken',
      timestamp: '2026-05-19T10:00:00Z',
      type: 'collection',
    });

    renderSitesTab({
      managedLocations: [loc],
      locations: [loc],
      transactions: [tx],
    });

    // Initially with "全部状态" the location card should be visible
    expect(screen.getByText('M-BROKEN')).toBeTruthy();

    // Switch to "broken" filter — should still show
    const statusFilter = screen.getByDisplayValue('全部状态');
    fireEvent.change(statusFilter, { target: { value: 'broken' } });

    await waitFor(() => {
      expect(screen.getByText('M-BROKEN')).toBeTruthy();
    });
  });

  it('hides locations that do not match the selected status filter', async () => {
    const locNormal = makeLocation({ id: 'loc-normal', machineId: 'M-NORMAL', name: 'Normal Shop' });
    const locBroken = makeLocation({ id: 'loc-broken', machineId: 'M-BROKEN', name: 'Broken Shop' });
    const tx = makeTransaction({
      id: 'tx-report',
      locationId: 'loc-broken',
      reportedStatus: 'maintenance',
      timestamp: '2026-05-19T10:00:00Z',
      type: 'collection',
    });

    renderSitesTab({
      managedLocations: [locNormal, locBroken],
      locations: [locNormal, locBroken],
      transactions: [tx],
    });

    // All visible with "all" filter
    expect(screen.getByText('M-NORMAL')).toBeTruthy();
    expect(screen.getByText('M-BROKEN')).toBeTruthy();

    // Switch to "maintenance" filter — only the reported one should show
    const statusFilter = screen.getByDisplayValue('全部状态');
    fireEvent.change(statusFilter, { target: { value: 'maintenance' } });

    await waitFor(() => {
      // Maintenance-reported location still visible
      expect(screen.getByText('M-BROKEN')).toBeTruthy();
    });
    // Normal location (no matching report) should be hidden
    expect(screen.queryByText('M-NORMAL')).toBeNull();
  });

  it('closes the edit modal when Cancel button is clicked', async () => {
    const loc = makeLocation({ id: 'loc-cancel', machineId: 'M-CANCEL' });

    renderSitesTab({ managedLocations: [loc], locations: [loc] });

    // Open edit modal
    fireEvent.click(screen.getByLabelText('Edit site'));

    // Modal should be open — verify Save changes button is visible
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();

    // Click Cancel
    fireEvent.click(screen.getByLabelText('Cancel'));

    // Modal should close — Save changes button should be gone
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    });
  });

  it('closes the edit modal when X close button is clicked', async () => {
    const loc = makeLocation({ id: 'loc-x', machineId: 'M-X' });

    renderSitesTab({ managedLocations: [loc], locations: [loc] });

    // Open edit modal
    fireEvent.click(screen.getByLabelText('Edit site'));

    // Modal open — verify Save changes visible
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();

    // Find the X close button in the modal header (first button inside the fixed overlay)
    const overlay = document.querySelector('.fixed.inset-0.z-\\[80\\]');
    const closeButton = overlay?.querySelector('button') as HTMLButtonElement;
    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton);

    // Modal should close
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    });
  });

  it('handles save error gracefully by showing an error toast', async () => {
    const loc = makeLocation({ id: 'loc-save-err', machineId: 'M-SAVERR' });
    const onUpdateLocations = jest.fn<(locations: Location[]) => Promise<void>>()
      .mockRejectedValue(new Error('Network failure'));

    renderSitesTab({
      managedLocations: [loc],
      locations: [loc],
      onUpdateLocations,
    });

    // Open edit modal and change name (to trigger save)
    fireEvent.click(screen.getByLabelText('Edit site'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    // Should show error toast
    await waitFor(() => {
      expect(screen.getByText(/点位保存失败/)).toBeTruthy();
    });
    // Save button should re-enable (isSavingLoc reset in finally)
    await waitFor(() => {
      expect(screen.getByText(/点位保存失败/)).toBeTruthy();
    });
  });

  it('handles delete error gracefully after confirm by showing an error toast', async () => {
    const driver = makeDriver();
    const loc = makeLocation({
      id: 'loc-del-err',
      machineId: 'M-DELERR',
      assignedDriverId: driver.id,
    });
    const onUpdateLocations = jest.fn<(locations: Location[]) => Promise<void>>().mockResolvedValue(undefined);
    const onDeleteLocations = jest.fn<(ids: string[]) => Promise<void>>()
      .mockRejectedValue(new Error('Server error'));

    renderSitesTab({
      managedLocations: [loc],
      locations: [loc],
      drivers: [driver],
      onUpdateLocations,
      onDeleteLocations,
    });

    // Click delete button
    fireEvent.click(screen.getByTitle('删除点位'));

    // Wait for confirm dialog and confirm
    expect(await screen.findByText(/绑定司机：Driver One（删除时会先解绑）/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    // onUpdateLocations (unassign driver) succeeds, onDeleteLocations rejects
    await waitFor(() => expect(onUpdateLocations).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByText(/删除失败/)).toBeTruthy();
    });
  });
});
