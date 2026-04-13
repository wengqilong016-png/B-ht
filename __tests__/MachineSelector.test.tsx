import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { ToastProvider } from '../contexts/ToastContext';
import MachineSelector from '../driver/components/MachineSelector';

import type { Driver, Location, Transaction } from '../types';

jest.mock('../offlineQueue', () => ({
  getPendingTransactions: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
}));

const driver: Driver = {
  id: 'drv-1',
  name: 'Driver One',
  username: 'driver',
  phone: '0711000000',
  initialDebt: 0,
  remainingDebt: 0,
  dailyFloatingCoins: 1200,
  vehicleInfo: { model: 'Bajaj', plate: 'T123' },
  status: 'active',
  baseSalary: 300000,
  commissionRate: 0.05,
};

const locations: Location[] = [
  {
    id: 'loc-1',
    name: 'Shop A Front',
    machineId: 'M-100',
    lastScore: 1000,
    area: 'Kariakoo',
    assignedDriverId: 'drv-1',
    ownerName: 'Merchant Alpha',
    shopOwnerPhone: '0711000001',
    initialStartupDebt: 0,
    remainingStartupDebt: 0,
    status: 'active',
    commissionRate: 0.15,
    dividendBalance: 3000,
  },
  {
    id: 'loc-2',
    name: 'Shop A Back',
    machineId: 'M-101',
    lastScore: 1200,
    area: 'Kariakoo',
    assignedDriverId: 'drv-1',
    ownerName: 'Merchant Alpha',
    shopOwnerPhone: '0711000001',
    initialStartupDebt: 0,
    remainingStartupDebt: 0,
    status: 'active',
    commissionRate: 0.15,
    dividendBalance: 1000,
  },
  {
    id: 'loc-3',
    name: 'Shop B',
    machineId: 'M-200',
    lastScore: 800,
    area: 'Buguruni',
    assignedDriverId: 'drv-1',
    ownerName: 'Merchant Beta',
    shopOwnerPhone: '0711000002',
    initialStartupDebt: 0,
    remainingStartupDebt: 0,
    status: 'active',
    commissionRate: 0.15,
    dividendBalance: 0,
  },
];

function renderSelector(overrides: Partial<React.ComponentProps<typeof MachineSelector>> = {}) {
  return render(
    <ToastProvider>
      <MachineSelector
        locations={locations}
        currentDriver={driver}
        allTransactions={[] as Transaction[]}
        lang="zh"
        isOnline
        gpsCoords={null}
        onSelectMachine={jest.fn()}
        onStartRegister={jest.fn()}
        onRequestReset={jest.fn()}
        onRequestPayout={jest.fn()}
        {...overrides}
      />
    </ToastProvider>,
  );
}

describe('MachineSelector', () => {
  it('shows assigned machines as the primary list for the current driver', async () => {
    renderSelector();

    expect(screen.getByText('选择机器')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('driver-machine-select-loc-1')).toBeTruthy());
    expect(screen.getByText(/3 台机器/)).toBeTruthy();
    expect(screen.getByTestId('driver-machine-select-loc-1')).toBeTruthy();
    expect(screen.getByTestId('driver-machine-select-loc-2')).toBeTruthy();
    expect(screen.getByTestId('driver-machine-select-loc-3')).toBeTruthy();
  });

  it('can still search by merchant name to find the related machine', async () => {
    renderSelector();

    fireEvent.change(screen.getByPlaceholderText('输入编号'), { target: { value: 'Merchant Beta' } });

    await waitFor(() => {
      expect(screen.queryByTestId('driver-machine-select-loc-1')).toBeNull();
      expect(screen.queryByTestId('driver-machine-select-loc-2')).toBeNull();
      expect(screen.getByTestId('driver-machine-select-loc-3')).toBeTruthy();
    });
  });

  it('can search by machine number directly', async () => {
    renderSelector();

    fireEvent.change(screen.getByPlaceholderText('输入编号'), { target: { value: 'M-101' } });

    await waitFor(() => {
      expect(screen.queryByTestId('driver-machine-select-loc-1')).toBeNull();
      expect(screen.getByTestId('driver-machine-select-loc-2')).toBeTruthy();
      expect(screen.queryByTestId('driver-machine-select-loc-3')).toBeNull();
    });
  });

  it('keeps merchant identity visible on machine cards as secondary info', async () => {
    renderSelector();

    await waitFor(() => expect(screen.getAllByText(/Merchant Alpha/)).toHaveLength(2));
    expect(screen.getAllByText(/Merchant Beta/)).toHaveLength(1);
  });

  it('submits an office loan request from the machine card', async () => {
    const onCreateOfficeLoan = jest.fn(async (_locId: string, _amount: number, _note: string) => {});
    renderSelector({ onCreateOfficeLoan });

    await waitFor(() => expect(screen.getByTestId('driver-machine-select-loc-1')).toBeTruthy());

    fireEvent.click(screen.getAllByRole('button', { name: /办公室借款/i })[0]);
    fireEvent.change(screen.getByPlaceholderText('借款金额'), { target: { value: '3500' } });
    fireEvent.change(screen.getByPlaceholderText('借款备注'), { target: { value: 'Office float top-up' } });
    fireEvent.click(screen.getByRole('button', { name: /提交借款/i }));

    await waitFor(() => {
      expect(onCreateOfficeLoan).toHaveBeenCalledWith('loc-1', 3500, 'Office float top-up');
    });
  });
});
