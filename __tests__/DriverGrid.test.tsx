import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import React from 'react';

import DriverGrid from '../components/driver-management/DriverGrid';

import type { DriverWithStats } from '../components/driver-management/hooks/useDriverManagement';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    lang: 'zh',
  }),
}));

const makeDriver = (overrides: Partial<DriverWithStats> = {}): DriverWithStats => ({
  id: 'driver-1',
  name: 'Test Driver',
  username: 'test-driver',
  phone: '0711000000',
  status: 'active' as const,
  baseSalary: 0,
  commissionRate: 0,
  initialDebt: 0,
  remainingDebt: 0,
  dailyFloatingCoins: 0,
  vehicleInfo: { model: '', plate: '' },
  stats: {
    totalRevenue: 0,
    totalNet: 0,
    collectionRate: 0,
    txCount: 0,
  },
  ...overrides,
});

describe('DriverGrid', () => {
  it('renders zero salary and zero commission without falling back to defaults', () => {
    const driver = makeDriver();

    render(
      <DriverGrid
        paginatedDrivers={[driver]}
        driversWithStats={[driver]}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        onToggleStatus={jest.fn()}
        onShowSalary={jest.fn()}
      />,
    );

    expect(screen.getAllByText('TZS 0')).toHaveLength(2);
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.queryByText('TZS 300,000')).toBeNull();
  });
});
