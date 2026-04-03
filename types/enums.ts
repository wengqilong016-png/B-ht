/** Centralized status enum objects. Reference these instead of raw strings. */

/** Transaction approval pipeline statuses */
export const ApprovalStatus = {
  AUTO_APPROVED: 'auto-approved',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;
export type ApprovalStatusValue = typeof ApprovalStatus[keyof typeof ApprovalStatus];

/** Expense approval statuses */
export const ExpenseStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;
export type ExpenseStatusValue = typeof ExpenseStatus[keyof typeof ExpenseStatus];

/** Payment statuses */
export const PaymentStatus = {
  UNPAID: 'unpaid',
  PENDING: 'pending',
  PAID: 'paid',
  REJECTED: 'rejected',
} as const;
export type PaymentStatusValue = typeof PaymentStatus[keyof typeof PaymentStatus];

/** Settlement statuses */
export const SettlementStatus = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
} as const;
export type SettlementStatusValue = typeof SettlementStatus[keyof typeof SettlementStatus];

/** Transaction types */
export const TransactionType = {
  COLLECTION: 'collection',
  EXPENSE: 'expense',
  RESET_REQUEST: 'reset_request',
  PAYOUT_REQUEST: 'payout_request',
} as const;
export type TransactionTypeValue = typeof TransactionType[keyof typeof TransactionType];

/** Location / machine statuses */
export const LocationStatus = {
  ACTIVE: 'active',
  MAINTENANCE: 'maintenance',
  BROKEN: 'broken',
} as const;
export type LocationStatusValue = typeof LocationStatus[keyof typeof LocationStatus];
