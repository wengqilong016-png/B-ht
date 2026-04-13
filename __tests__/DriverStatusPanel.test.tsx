import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import DriverStatusPanel from '../driver/components/DriverStatusPanel';

const mockMutateAsync = jest.fn<(drivers: unknown[]) => Promise<void>>();
const mockPersistEvidencePhotoUrl = jest.fn<(
  photoUrl: string | null | undefined,
  options: { category: string; entityId: string; driverId?: string | null }
) => Promise<string | null>>();
const mockResizeImage = jest.fn<(file: File) => Promise<string>>();

const mockDriver = {
  id: 'RAJABU',
  name: 'Rajabu',
  username: 'rajabu@bht.com',
  phone: '',
  backgroundPhotoUrl: undefined,
  initialDebt: 0,
  remainingDebt: 0,
  dailyFloatingCoins: 20000,
  vehicleInfo: { model: 'Boxer', plate: 'T123 ABC' },
  status: 'active' as const,
  baseSalary: 300000,
  commissionRate: 0.05,
};

const mockAppData = {
  isOnline: true,
  drivers: [mockDriver],
  locations: [
    {
      id: 'loc-1',
      machineId: 'C1',
      name: 'Shop One',
      area: 'Kariakoo',
      assignedDriverId: 'RAJABU',
      status: 'active' as const,
    },
  ],
  filteredTransactions: [
    {
      id: 'tx-1',
      driverId: 'RAJABU',
      revenue: 15000,
      timestamp: '2026-04-10T08:00:00.000Z',
    },
  ],
};

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    lang: 'zh',
    activeDriverId: 'RAJABU',
  }),
}));

jest.mock('../contexts/DataContext', () => ({
  useAppData: () => mockAppData,
}));

jest.mock('../contexts/MutationContext', () => ({
  useMutations: () => ({
    updateDrivers: {
      mutateAsync: mockMutateAsync,
      isPending: false,
    },
  }),
}));

jest.mock('../services/evidenceStorage', () => ({
  persistEvidencePhotoUrl: (
    photoUrl: string | null | undefined,
    options: { category: string; entityId: string; driverId?: string | null },
  ) => mockPersistEvidencePhotoUrl(photoUrl, options),
}));

jest.mock('../types', () => {
  const actual = jest.requireActual('../types') as typeof import('../types');
  return {
    ...actual,
    resizeImage: (file: File) => mockResizeImage(file),
  };
});

describe('DriverStatusPanel', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
    mockPersistEvidencePhotoUrl.mockReset();
    mockResizeImage.mockReset();
    mockMutateAsync.mockResolvedValue(undefined);
    mockPersistEvidencePhotoUrl.mockImplementation(async (photoUrl) => {
      if (!photoUrl) return null;
      return photoUrl.startsWith('data:') ? 'https://cdn.example.com/driver-background.jpg' : photoUrl;
    });
    mockResizeImage.mockResolvedValue('data:image/jpeg;base64,photo');
  });

  it('saves driver phone and background photo from the status panel', async () => {
    const { container } = render(<DriverStatusPanel />);

    fireEvent.change(screen.getByPlaceholderText('+255 6xx xxx xxxx'), {
      target: { value: '+255700123456' },
    });

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();

    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(['photo'], 'background.jpg', { type: 'image/jpeg' })],
      },
    });

    await waitFor(() => {
      expect(mockResizeImage).toHaveBeenCalled();
    });

    await screen.findByText('更换背景照片');

    fireEvent.click(screen.getByText('保存资料'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'RAJABU',
          phone: '+255700123456',
          backgroundPhotoUrl: 'https://cdn.example.com/driver-background.jpg',
        }),
      ]);
    });

    expect(mockPersistEvidencePhotoUrl).toHaveBeenCalledWith(
      'data:image/jpeg;base64,photo',
      expect.objectContaining({
        category: 'driver-profile',
        entityId: 'background-photo',
        driverId: 'RAJABU',
      }),
    );
  });
});
