import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockRpc: jest.Mock = jest.fn();
const mockSelect: jest.Mock = jest.fn();
const mockOrderCreatedAt: jest.Mock = jest.fn();
const mockOrderMonth: jest.Mock = jest.fn();
const mockEq: jest.Mock = jest.fn();
const mockFrom: jest.Mock = jest.fn();

const makeQuery = (result: unknown) => Object.assign(Promise.resolve(result), { eq: mockEq });
const asMockResult = <T,>(value: T) => value as never;

jest.mock('../supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import {
  cancelMonthlyPayroll,
  createMonthlyPayroll,
  fetchMonthlyPayrolls,
  markMonthlyPayrollPaid,
} from '../repositories/monthlyPayrollRepository';

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockSelect.mockReset();
  mockOrderCreatedAt.mockReset();
  mockOrderMonth.mockReset();
  mockEq.mockReset();

  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ order: mockOrderMonth });
  mockOrderMonth.mockReturnValue({ order: mockOrderCreatedAt });
  mockOrderCreatedAt.mockReturnValue(makeQuery({ data: [], error: null }));
  mockEq.mockResolvedValue(asMockResult({ data: [], error: null }));
});

describe('monthlyPayrollRepository', () => {
  it('fetches payrolls ordered by month and creation date', async () => {
    mockOrderCreatedAt.mockReturnValueOnce(
      makeQuery({
      data: [{ id: 'pay-1', month: '2026-04', status: 'pending' }],
      error: null,
      }),
    );

    const result = await fetchMonthlyPayrolls();

    expect(mockFrom).toHaveBeenCalledWith('monthly_payrolls');
    expect(mockOrderMonth).toHaveBeenCalledWith('month', { ascending: false });
    expect(mockOrderCreatedAt).toHaveBeenCalledWith('createdAt', { ascending: false });
    expect(result).toHaveLength(1);
  });

  it('filters payroll fetches by driver when requested', async () => {
    await fetchMonthlyPayrolls('drv-1');

    expect(mockEq).toHaveBeenCalledWith('driverId', 'drv-1');
  });

  it('calls create_monthly_payroll_v1 with expected parameters', async () => {
    mockRpc.mockResolvedValue(asMockResult({
      data: { id: 'pay-1', driverId: 'drv-1', status: 'pending' },
      error: null,
    }));

    const result = await createMonthlyPayroll({
      driverId: 'drv-1',
      month: '2026-04',
      baseSalary: 300000,
      commission: 50000,
      privateLoanDeduction: 10000,
      shortageDeduction: 2000,
      netPayable: 338000,
      collectionCount: 17,
      totalRevenue: 500000,
      note: 'April payroll',
    });

    expect(mockRpc).toHaveBeenCalledWith('create_monthly_payroll_v1', {
      p_driver_id: 'drv-1',
      p_month: '2026-04',
      p_base_salary: 300000,
      p_commission: 50000,
      p_private_loan_deduction: 10000,
      p_shortage_deduction: 2000,
      p_net_payable: 338000,
      p_collection_count: 17,
      p_total_revenue: 500000,
      p_note: 'April payroll',
    });
    expect(result.status).toBe('pending');
  });

  it('calls mark_monthly_payroll_paid_v1 with expected parameters', async () => {
    mockRpc.mockResolvedValue(asMockResult({
      data: { id: 'pay-1', status: 'paid', paymentMethod: 'bank_transfer' },
      error: null,
    }));

    const result = await markMonthlyPayrollPaid({
      payrollId: 'pay-1',
      paymentMethod: 'bank_transfer',
      note: 'Transferred',
      paymentProofUrl: 'https://example.com/payroll-proof.jpg',
    });

    expect(mockRpc).toHaveBeenCalledWith('mark_monthly_payroll_paid_v1', {
      p_payroll_id: 'pay-1',
      p_payment_method: 'bank_transfer',
      p_note: 'Transferred',
      p_payment_proof_url: 'https://example.com/payroll-proof.jpg',
    });
    expect(result.status).toBe('paid');
  });

  it('calls cancel_monthly_payroll_v1 with expected parameters', async () => {
    mockRpc.mockResolvedValue(asMockResult({
      data: { id: 'pay-1', status: 'cancelled' },
      error: null,
    }));

    const result = await cancelMonthlyPayroll('pay-1', 'Duplicate payroll');

    expect(mockRpc).toHaveBeenCalledWith('cancel_monthly_payroll_v1', {
      p_payroll_id: 'pay-1',
      p_note: 'Duplicate payroll',
    });
    expect(result.status).toBe('cancelled');
  });

  it('throws when payroll RPC returns an error', async () => {
    mockRpc.mockResolvedValue(asMockResult({
      data: null,
      error: new Error('payroll failed'),
    }));

    await expect(cancelMonthlyPayroll('pay-1')).rejects.toThrow('payroll failed');
  });
});
