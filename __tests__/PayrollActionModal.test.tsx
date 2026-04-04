import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PayrollActionModal from '../components/dashboard/PayrollActionModal';

const mockPersistEvidencePhotoUrl: jest.Mock = jest.fn();
const asMockResult = <T,>(value: T) => value as never;

jest.mock('../services/evidenceStorage', () => ({
  persistEvidencePhotoUrl: (...args: unknown[]) => mockPersistEvidencePhotoUrl(...args),
}));

const defaultDriver = {
  id: 'drv-1',
  name: 'Driver One',
  baseSalary: 300000,
};

const defaultSummary = {
  commission: 50000,
  loans: 10000,
  shortage: 2000,
  netPayable: 338000,
  collectionCount: 17,
  totalRevenue: 500000,
};

function renderModal(
  overrides: Partial<React.ComponentProps<typeof PayrollActionModal>> = {},
) {
  const onSubmit = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  const onClose = jest.fn();

  const rendered = render(
    <PayrollActionModal
      mode="pay"
      driver={defaultDriver}
      month="2026-04"
      summary={defaultSummary}
      record={{
        id: 'pay-1',
        driverId: 'drv-1',
        driverName: 'Driver One',
        month: '2026-04',
        baseSalary: 300000,
        commission: 50000,
        privateLoanDeduction: 10000,
        shortageDeduction: 2000,
        netPayable: 338000,
        collectionCount: 17,
        totalRevenue: 500000,
        status: 'pending',
        paymentMethod: 'bank_transfer',
        paymentProofUrl: null,
        note: '',
        createdAt: '2026-04-04T00:00:00Z',
        paidAt: null,
        paidBy: null,
        paidByName: null,
        isSynced: true,
      }}
      isSubmitting={false}
      lang="zh"
      onClose={onClose}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );

  return { ...rendered, onSubmit, onClose };
}

describe('PayrollActionModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const alertMock = jest.fn();
    Object.defineProperty(window, 'alert', {
      writable: true,
      value: alertMock,
    });
    (global as unknown as { alert: typeof alertMock }).alert = alertMock;

    (global as unknown as { FileReader: unknown }).FileReader = class {
      public result: string | null = 'data:image/jpeg;base64,ZmFrZQ==';
      public onload: ((event: { target: { result: string | null } }) => void) | null = null;
      public onerror: (() => void) | null = null;

      readAsDataURL() {
        Promise.resolve().then(() => {
          this.onload?.({ target: { result: this.result } });
        });
      }
    } as unknown as typeof FileReader;
  });

  it('submits create mode with a trimmed note', async () => {
    const { onSubmit } = renderModal({ mode: 'create', record: null });

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  ready for payroll  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Payroll' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        note: 'ready for payroll',
        paymentMethod: undefined,
        paymentProofUrl: undefined,
      });
    });
  });

  it('uploads a new proof image before submitting a pay action', async () => {
    mockPersistEvidencePhotoUrl.mockResolvedValue(asMockResult('https://example.com/payroll-proof.jpg'));
    const { container, onSubmit } = renderModal();

    expect((screen.getByRole('button', { name: 'Confirm Payment' }) as HTMLButtonElement).disabled).toBe(true);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['proof'], 'proof.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByAltText('Payroll proof').getAttribute('src')).toBe('data:image/jpeg;base64,ZmFrZQ==');
    });
    expect((screen.getByRole('button', { name: 'Confirm Payment' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'bank transfer sent' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Payment' }));

    await waitFor(() => {
      expect(mockPersistEvidencePhotoUrl).toHaveBeenCalledWith('data:image/jpeg;base64,ZmFrZQ==', {
        category: 'payroll',
        entityId: 'pay-1',
        driverId: 'drv-1',
      });
    });
    expect(onSubmit).toHaveBeenCalledWith({
      note: 'bank transfer sent',
      paymentMethod: 'bank_transfer',
      paymentProofUrl: 'https://example.com/payroll-proof.jpg',
    });
  });

  it('alerts and does not submit when proof upload fails', async () => {
    mockPersistEvidencePhotoUrl.mockRejectedValue(asMockResult(new Error('upload failed')));
    const { container, onSubmit } = renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['proof'], 'proof.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByAltText('Payroll proof').getAttribute('src')).toBe('data:image/jpeg;base64,ZmFrZQ==');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Payment' }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('❌ 工资凭证上传失败，请重试。');
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a required-proof hint in pay mode before a proof is selected', () => {
    renderModal();

    expect(screen.getByText('请先上传工资支付凭证。')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Confirm Payment' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
