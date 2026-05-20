import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import MachineSelector from '../driver/components/MachineSelector';

import type { Transaction } from '../types';

const mockGetPendingTransactions = jest.fn<() => Promise<Transaction[]>>();
const mockOnSelectMachine = jest.fn();

jest.mock('../offlineQueue', () => ({
  getPendingTransactions: () => mockGetPendingTransactions(),
}));

jest.mock('../driver/components/MachineFilterBar', () => ({
  __esModule: true,
  default: () => <div>FILTER_BAR</div>,
}));

jest.mock('../driver/components/MachineCard', () => ({
  __esModule: true,
  default: ({
    item,
    onSelect,
  }: {
    item: { loc: { id: string; name: string } };
    onSelect: (locId: string) => void;
  }) => (
    <button type="button" onClick={() => onSelect(item.loc.id)}>
      {item.loc.name}
    </button>
  ),
}));

describe('machine selector assignment guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPendingTransactions.mockResolvedValue([]);
  });

  it('does not expose all machines when the driver has no assigned machines', () => {
    render(
      <MachineSelector
        locations={[
          {
            id: 'loc-1',
            name: 'Bahati Shop',
            machineId: 'M-100',
            area: 'Kariakoo',
            lastScore: 1000,
            status: 'active',
            commissionRate: 0.15,
            assignedDriverId: 'other-driver',
          } as any,
        ]}
        currentDriver={{
          id: 'drv-1',
          name: 'Driver One',
          dailyFloatingCoins: 5000,
        } as any}
        allTransactions={[] as Transaction[]}
        lang="zh"
        isOnline={true}
        gpsCoords={null}
        onSelectMachine={mockOnSelectMachine}
        onStartRegister={jest.fn()}
        onRequestReset={jest.fn()}
        onRequestPayout={jest.fn()}
      />,
    );

    expect(screen.getByText('当前没有分配给你的机器，请联系管理员。')).toBeTruthy();
    expect(screen.getByText('暂无分配的机器')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bahati Shop' })).toBeNull();

    expect(mockOnSelectMachine).not.toHaveBeenCalled();
  });

  it('still shows assigned machines and allows selection when the driver has assignments', () => {
    render(
      <MachineSelector
        locations={[
          {
            id: 'loc-1',
            name: 'Bahati Shop',
            machineId: 'M-100',
            area: 'Kariakoo',
            lastScore: 1000,
            status: 'active',
            commissionRate: 0.15,
            assignedDriverId: 'drv-1',
          } as any,
        ]}
        currentDriver={{
          id: 'drv-1',
          name: 'Driver One',
          dailyFloatingCoins: 5000,
        } as any}
        allTransactions={[] as Transaction[]}
        lang="zh"
        isOnline={true}
        gpsCoords={null}
        onSelectMachine={mockOnSelectMachine}
        onStartRegister={jest.fn()}
        onRequestReset={jest.fn()}
        onRequestPayout={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bahati Shop' }));
    expect(mockOnSelectMachine).toHaveBeenCalledWith('loc-1');
  });
});
