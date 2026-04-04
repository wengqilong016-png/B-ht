import { supabase } from '../supabaseClient';
import type { MonthlyPayroll } from '../types/models';

const PAYROLL_FIELDS = [
  'id', 'driverId', 'driverName', 'month', 'baseSalary', 'commission',
  'privateLoanDeduction', 'shortageDeduction', 'netPayable', 'collectionCount',
  'totalRevenue', 'status', 'paymentMethod', 'paymentProofUrl', 'note',
  'createdAt', 'paidAt', 'paidBy', 'paidByName', 'isSynced',
].join(', ');

export async function fetchMonthlyPayrolls(driverIdFilter?: string): Promise<MonthlyPayroll[]> {
  if (!supabase) throw new Error('Supabase client unavailable');
  let query = supabase
    .from('monthly_payrolls')
    .select(PAYROLL_FIELDS)
    .order('month', { ascending: false })
    .order('createdAt', { ascending: false });

  if (driverIdFilter) query = query.eq('driverId', driverIdFilter);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as MonthlyPayroll[];
}

export async function createMonthlyPayroll(input: {
  driverId: string;
  month: string;
  baseSalary: number;
  commission: number;
  privateLoanDeduction: number;
  shortageDeduction: number;
  netPayable: number;
  collectionCount: number;
  totalRevenue: number;
  note?: string;
}): Promise<MonthlyPayroll> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { data, error } = await supabase.rpc('create_monthly_payroll_v1', {
    p_driver_id: input.driverId,
    p_month: input.month,
    p_base_salary: input.baseSalary,
    p_commission: input.commission,
    p_private_loan_deduction: input.privateLoanDeduction,
    p_shortage_deduction: input.shortageDeduction,
    p_net_payable: input.netPayable,
    p_collection_count: input.collectionCount,
    p_total_revenue: input.totalRevenue,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return data as MonthlyPayroll;
}

export async function markMonthlyPayrollPaid(input: {
  payrollId: string;
  paymentMethod: MonthlyPayroll['paymentMethod'];
  note?: string;
  paymentProofUrl?: string;
}): Promise<MonthlyPayroll> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { data, error } = await supabase.rpc('mark_monthly_payroll_paid_v1', {
    p_payroll_id: input.payrollId,
    p_payment_method: input.paymentMethod,
    p_note: input.note ?? null,
    p_payment_proof_url: input.paymentProofUrl ?? null,
  });
  if (error) throw error;
  return data as MonthlyPayroll;
}

export async function cancelMonthlyPayroll(payrollId: string, note?: string): Promise<MonthlyPayroll> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { data, error } = await supabase.rpc('cancel_monthly_payroll_v1', {
    p_payroll_id: payrollId,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data as MonthlyPayroll;
}
