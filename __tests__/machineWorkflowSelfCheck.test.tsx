import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Driver, Location, Transaction } from '../types';
import MachineRegistrationForm from '../components/MachineRegistrationForm';
import SitesTab from '../components/dashboard/SitesTab';

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
    id: 'loc-b1',
    name: 'B1 Test Shop',
    machineId: 'B1',
    lastScore: 120,
    area: 'Kariakoo',
    initialStartupDebt: 0,
    remainingStartupDebt: 0,
    status: 'active',
    commissionRate: 0.15,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    timestamp: '2026-04-05T10:00:00.000Z',
    locationId: 'loc-b1',
    locationName: 'B1 Test Shop',
    driverId: 'drv-1',
    driverName: 'Driver One',
    previousScore: 100,
    currentScore: 120,
    revenue: 40000,
    commission: 6000,
    ownerRetention: 6000,
    debtDeduction: 0,
    startupDebtDeduction: 0,
    expenses: 0,
    coinExchange: 0,
    extraIncome: 0,
    netPayable: 30000,
    gps: { lat: -6.8, lng: 39.2 },
    dataUsageKB: 120,
    isSynced: true,
    type: 'collection',
    paymentStatus: 'paid',
    approvalStatus: 'approved',
    ...overrides,
  };
}

describe('machine workflow self-check', () => {
  const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
  const confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => true);

  beforeEach(() => {
    alertSpy.mockClear();
    confirmSpy.mockClear();
  });

  it('blocks duplicate machine registration and normalizes a valid new machine id before submit', async () => {
    const onSubmit = jest.fn<(location: Location) => Promise<void>>().mockResolvedValue(undefined);

    const { rerender } = render(
      <MachineRegistrationForm
        onSubmit={onSubmit}
        onCancel={() => {}}
        currentDriver={makeDriver()}
        lang="zh"
        existingMachineIds={['B1']}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('M-00X'), { target: { value: ' b1 ' } });
    fireEvent.change(screen.getByPlaceholderText('Shop Name'), { target: { value: 'Duplicate Shop' } });
    fireEvent.change(screen.getByPlaceholderText('Owner Name'), { target: { value: 'Owner A' } });
    fireEvent.change(screen.getByPlaceholderText('Kariakoo'), { target: { value: 'Town' } });
    fireEvent.change(screen.getByPlaceholderText('-6.823490'), { target: { value: '-6.82349' } });
    fireEvent.change(screen.getByPlaceholderText('39.269510'), { target: { value: '39.26951' } });
    fireEvent.click(screen.getByRole('button', { name: '完成注册' }));

    expect(alertSpy).toHaveBeenCalledWith('机器编号 B1 已存在，请检查后再提交。');
    expect(onSubmit).not.toHaveBeenCalled();

    rerender(
      <MachineRegistrationForm
        onSubmit={onSubmit}
        onCancel={() => {}}
        currentDriver={makeDriver()}
        lang="zh"
        existingMachineIds={['B1']}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('M-00X'), { target: { value: ' b2 ' } });
    fireEvent.change(screen.getByPlaceholderText('Shop Name'), { target: { value: 'Fresh Shop' } });
    fireEvent.change(screen.getByPlaceholderText('Owner Name'), { target: { value: 'Owner B' } });
    fireEvent.change(screen.getByPlaceholderText('Kariakoo'), { target: { value: 'Town' } });
    fireEvent.change(screen.getByPlaceholderText('-6.823490'), { target: { value: '-6.82349' } });
    fireEvent.change(screen.getByPlaceholderText('39.269510'), { target: { value: '39.26951' } });
    fireEvent.click(screen.getByRole('button', { name: '使用手动坐标' }));
    fireEvent.click(screen.getByRole('button', { name: '完成注册' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          machineId: 'B2',
          name: 'Fresh Shop',
          area: 'Town',
          assignedDriverId: 'drv-1',
        }),
      ),
    );
  });

  it('blocks deleting a machine with active workflow links, then allows delete once blockers are cleared', async () => {
    const driver = makeDriver();
    const location = makeLocation({
      assignedDriverId: driver.id,
      remainingStartupDebt: 5000,
      resetLocked: true,
      dividendBalance: 1000,
    });
    const onDeleteLocations = jest.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined);

    const { rerender } = render(
      <SitesTab
        managedLocations={[location]}
        allAreas={['Kariakoo']}
        siteSearch=""
        setSiteSearch={() => {}}
        siteFilterArea="all"
        setSiteFilterArea={() => {}}
        driverMap={new Map([[driver.id, driver]])}
        drivers={[driver]}
        locations={[location]}
        onUpdateLocations={async () => {}}
        onDeleteLocations={onDeleteLocations}
        transactions={[
          makeTransaction({ approvalStatus: 'pending', paymentStatus: 'pending' }),
        ]}
        pendingResetRequests={[
          makeTransaction({ id: 'rst-1', type: 'reset_request', approvalStatus: 'pending' }),
        ]}
        pendingPayoutRequests={[
          makeTransaction({ id: 'pay-1', type: 'payout_request', approvalStatus: 'pending' }),
        ]}
        isOnline={true}
        lang="zh"
      />,
    );

    const blockedDeleteButton = screen.getByTitle(/Machine is still assigned to a driver/);
    expect((blockedDeleteButton as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <SitesTab
        managedLocations={[makeLocation({ id: 'loc-b1-clean' })]}
        allAreas={['Kariakoo']}
        siteSearch=""
        setSiteSearch={() => {}}
        siteFilterArea="all"
        setSiteFilterArea={() => {}}
        driverMap={new Map([[driver.id, driver]])}
        drivers={[driver]}
        locations={[makeLocation({ id: 'loc-b1-clean' })]}
        onUpdateLocations={async () => {}}
        onDeleteLocations={onDeleteLocations}
        transactions={[makeTransaction({ id: 'tx-history', locationId: 'loc-b1-clean' })]}
        pendingResetRequests={[]}
        pendingPayoutRequests={[]}
        isOnline={true}
        lang="zh"
      />,
    );

    const enabledDeleteButton = screen.getByTitle('Delete location');
    expect((enabledDeleteButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(enabledDeleteButton);

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    await waitFor(() => expect(onDeleteLocations).toHaveBeenCalledWith(['loc-b1-clean']));
  });

  it('surfaces backend delete failure instead of failing silently', async () => {
    const driver = makeDriver();
    const location = makeLocation({ id: 'loc-fail' });
    const onDeleteLocations = jest.fn<(ids: string[]) => Promise<void>>().mockRejectedValue(new Error('row is still referenced'));

    render(
      <SitesTab
        managedLocations={[location]}
        allAreas={['Kariakoo']}
        siteSearch=""
        setSiteSearch={() => {}}
        siteFilterArea="all"
        setSiteFilterArea={() => {}}
        driverMap={new Map([[driver.id, driver]])}
        drivers={[driver]}
        locations={[location]}
        onUpdateLocations={async () => {}}
        onDeleteLocations={onDeleteLocations}
        transactions={[]}
        pendingResetRequests={[]}
        pendingPayoutRequests={[]}
        isOnline={true}
        lang="zh"
      />,
    );

    fireEvent.click(screen.getByTitle('Delete location'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('删除失败，系统拒绝了本次操作。\nDelete failed: row is still referenced'),
    );
  });
});
