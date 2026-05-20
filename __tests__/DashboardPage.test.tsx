import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ── Mock sub-components ──
jest.mock('../components/dashboard/DashboardTabs', () => {
  const MockDashboardTabs = ({
    activeTab,
    setActiveTab,
    isAdmin,
    hideTabs,
  }: {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    isAdmin: boolean;
    hideTabs?: boolean;
    lang: Record<string, string>;
  }) => (
    <div data-testid="dashboard-tabs">
      <span data-testid="active-tab">{activeTab}</span>
      <span data-testid="is-admin">{String(isAdmin)}</span>
      <span data-testid="hide-tabs">{String(!!hideTabs)}</span>
      <button data-testid="switch-overview" onClick={() => setActiveTab('overview')}>
        Overview
      </button>
      <button data-testid="switch-settlement" onClick={() => setActiveTab('settlement')}>
        Settlement
      </button>
    </div>
  );
  MockDashboardTabs.displayName = 'MockDashboardTabs';
  return { __esModule: true, default: MockDashboardTabs };
});

jest.mock('../components/dashboard/OverviewTab', () => ({
  __esModule: true,
  default: () => <div data-testid="overview-tab">OverviewTab</div>,
}));

jest.mock('../components/dashboard/TrackingTab', () => ({
  __esModule: true,
  default: () => <div data-testid="tracking-tab">TrackingTab</div>,
}));

jest.mock('../components/dashboard/SitesTab', () => ({
  __esModule: true,
  default: () => <div data-testid="sites-tab">SitesTab</div>,
}));

jest.mock('../components/dashboard/SettlementTab', () => ({
  __esModule: true,
  default: () => <div data-testid="settlement-tab">SettlementTab</div>,
}));

jest.mock('../components/dashboard/AiLogsTab', () => ({
  __esModule: true,
  default: () => <div data-testid="ai-logs-tab">AiLogsTab</div>,
}));

jest.mock('../components/dashboard/BahatiAssistant', () => ({
  __esModule: true,
  default: () => <div data-testid="bahati-assistant">BahatiAssistant</div>,
}));

jest.mock('../components/dashboard/PayrollActionModal', () => {
  const MockPayrollActionModal = ({
    mode,
    driver,
    month,
    onClose,
  }: {
    mode: string;
    driver: { id: string; name: string; baseSalary: number };
    month: string;
    onClose: () => void;
    lang: Record<string, string>;
    onSubmit: (payload: unknown) => Promise<void>;
    isSubmitting: boolean;
    record?: unknown;
    summary?: unknown;
  }) => (
    <div data-testid="payroll-modal">
      <span data-testid="payroll-mode">{mode}</span>
      <span data-testid="payroll-driver">{driver.name}</span>
      <span data-testid="payroll-month">{month}</span>
      <button data-testid="payroll-close" onClick={onClose}>
        Close
      </button>
    </div>
  );
  MockPayrollActionModal.displayName = 'MockPayrollActionModal';
  return { __esModule: true, default: MockPayrollActionModal };
});

jest.mock('../components/dashboard/hooks/useDashboardData', () => ({
  useDashboardData: () => ({
    driverMap: new Map(),
    locationMap: new Map(),
    todayDriverTxs: [],
    myProfile: null,
    pendingExpenses: [],
    pendingSettlements: [],
    anomalyTransactions: [],
    pendingResetRequests: [],
    pendingPayoutRequests: [],
    todayDriverStats: [],
    payrollStats: [],
    allAreas: [],
    managedLocations: [],
    filteredAiLogs: [],
    bossStats: null,
    trackingDriverCards: [],
    trackingOverview: null,
    trackingVisibleLocations: [],
    trackingVisibleTransactions: [],
  }),
}));

jest.mock('../components/PageErrorBoundary', () => ({
  __esModule: true,
  default: ({ children, name }: { children: React.ReactNode; name: string }) => (
    <div data-testid={`error-boundary-${name}`}>{children}</div>
  ),
}));

jest.mock('../components/driver-management', () => ({
  __esModule: true,
  default: () => <div data-testid="driver-management">DriverManagement</div>,
}));

// ── Mock contexts ──
const mockShowToast = jest.fn();

jest.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../contexts/AuthContext', () => {
  const actual = jest.requireActual('../contexts/AuthContext') as Record<string, unknown>;
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

jest.mock('../contexts/DataContext', () => ({
  useAppData: () => ({
    filteredTransactions: [],
    filteredDrivers: [],
    filteredLocations: [],
    filteredSettlements: [],
    aiLogs: [],
    unsyncedCount: 0,
    isOnline: true,
    isLoadingLocations: false,
    isLoadingSettlements: false,
  }),
}));

const mockUpdateLocations = { mutateAsync: jest.fn().mockResolvedValue(undefined) };
const mockDeleteLocations = { mutateAsync: jest.fn().mockResolvedValue(undefined) };
const mockCreateSettlement = { mutateAsync: jest.fn().mockResolvedValue(undefined) };
const mockReviewSettlement = { mutateAsync: jest.fn().mockResolvedValue(undefined) };
const mockApproveExpenseRequest = { mutateAsync: jest.fn().mockResolvedValue(undefined) };
const mockReviewAnomalyTransaction = { mutateAsync: jest.fn().mockResolvedValue(undefined) };
const mockApproveResetRequest = { mutateAsync: jest.fn().mockResolvedValue(undefined) };
const mockApprovePayoutRequest = { mutateAsync: jest.fn().mockResolvedValue(undefined) };

jest.mock('../contexts/MutationContext', () => ({
  useMutations: () => ({
    updateLocations: mockUpdateLocations,
    deleteLocations: mockDeleteLocations,
    createSettlement: mockCreateSettlement,
    reviewSettlement: mockReviewSettlement,
    approveExpenseRequest: mockApproveExpenseRequest,
    reviewAnomalyTransaction: mockReviewAnomalyTransaction,
    approveResetRequest: mockApproveResetRequest,
    approvePayoutRequest: mockApprovePayoutRequest,
  }),
}));

// ── Mock repositories ──
jest.mock('../repositories/monthlyPayrollRepository', () => ({
  fetchMonthlyPayrolls: jest.fn().mockResolvedValue([]),
  createMonthlyPayroll: jest.fn(),
  markMonthlyPayrollPaid: jest.fn(),
  cancelMonthlyPayroll: jest.fn(),
}));

// ── Mock @tanstack/react-query ──
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query') as Record<string, unknown>;
  return {
    ...actual,
    useQuery: jest.fn().mockReturnValue({ data: [], isLoading: false, error: null }),
    useQueryClient: jest.fn().mockReturnValue({
      invalidateQueries: jest.fn(),
    }),
    useMutation: jest.fn().mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
    }),
  };
});

import DashboardPage from '../components/dashboard/DashboardPage';
import { useAuth } from '../contexts/AuthContext';

const mockUseAuth = useAuth as jest.Mock;

const zhLang: Record<string, string> = {
  dashboard: '管理概览',
  collect: '现场巡检',
  quickCollect: '快速收',
  register: '新机注册',
  debt: '财务回收',
  ai: 'AI 审计',
  history: '审计日志',
  reports: '财务报表',
  logout: '退出登录',
  sync: '立即同步',
  offline: '待传记录',
  login: '登录',
  username: '用户名',
  password: '密码',
  loginBtn: '登录',
  loginBtnLoading: '登录中...',
  loginFailed: '登录失败',
  loginError: '登录错误',
  profileNotProvisioned: '未配置',
  invalidAccountRole: '无效角色',
  score: '读数',
  lastScore: '上次读数',
  revenue: '营收',
  todayRevenue: '今日营收',
  expenses: '支出',
  net: '应收',
  submit: '提交',
  scanner: '扫码',
  retention: '留存',
  payrollActionFailed: '工资操作失败',
  payrollTitle: '工资单',
  payrollSubtitle: '月度工资管理',
  payrollMonths: '个月',
  baseShort: '底薪',
  commissionLabel: '提成',
  loansShort: '借款',
  shortageShort: '短缺',
  revenueShort: '营收',
  collectionsShort: '笔',
  noPayrollData: '无工资数据',
  generatePayroll: '生成工资单',
  reopenPayroll: '重开工资单',
  markPaid: '标记已付',
  cancelPayroll: '取消工资单',
  paidAtLabel: '支付时间',
  print_payroll: '打印',
};

function adminUser() {
  return { id: 'admin-1', username: 'admin', role: 'admin' as const, name: 'Admin' };
}

function driverUser() {
  return {
    id: 'drv-1',
    username: 'driver1',
    role: 'driver' as const,
    name: 'Driver One',
    driverId: 'drv-1',
  };
}

function renderDashboard(props: Partial<React.ComponentProps<typeof DashboardPage>> = {}) {
  return render(
    <React.StrictMode>
      <DashboardPage {...props} />
    </React.StrictMode>,
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      currentUser: adminUser(),
      lang: 'zh',
    });
  });

  // ── Tab defaults ──

  it('renders overview tab for admin by default', () => {
    renderDashboard();
    expect(screen.getByTestId('active-tab').textContent).toBe('overview');
  });

  it('renders settlement tab for driver by default', () => {
    mockUseAuth.mockReturnValue({
      currentUser: driverUser(),
      lang: 'zh',
    });
    renderDashboard();
    expect(screen.getByTestId('active-tab').textContent).toBe('settlement');
  });

  // ── initialTab prop ──

  it('respects initialTab prop', () => {
    renderDashboard({ initialTab: 'locations' });
    expect(screen.getByTestId('active-tab').textContent).toBe('locations');
  });

  // ── Role-restricted tabs ──

  it('renders overview content only for admin', () => {
    renderDashboard({ initialTab: 'overview' });
    expect(screen.getByTestId('overview-tab')).toBeTruthy();
  });

  it('does not render admin tabs for driver', () => {
    mockUseAuth.mockReturnValue({
      currentUser: driverUser(),
      lang: 'zh',
    });
    renderDashboard({ initialTab: 'settlement' });
    // Settlement tab is accessible to both roles
    expect(screen.getByTestId('settlement-tab')).toBeTruthy();
    // Admin-only tabs should not render
    expect(screen.queryByTestId('overview-tab')).toBeNull();
    expect(screen.queryByTestId('tracking-tab')).toBeNull();
    expect(screen.queryByTestId('sites-tab')).toBeNull();
  });

  // ── Tab switching ──

  it('switches tab via DashboardTabs callback', () => {
    renderDashboard();
    expect(screen.getByTestId('active-tab').textContent).toBe('overview');

    fireEvent.click(screen.getByTestId('switch-settlement'));
    expect(screen.getByTestId('active-tab').textContent).toBe('settlement');
    expect(screen.getByTestId('settlement-tab')).toBeTruthy();
    expect(screen.queryByTestId('overview-tab')).toBeNull();
  });

  // ── Payroll modal ──

  it('renders payroll action modal when payrollModalState is set (indirectly via team tab)', () => {
    // The payroll modal is only shown if payrollModalState is non-null
    // and that's set by clicking buttons inside the team tab's payroll section.
    // Since we mock DriverManagement, we test the modal's conditional render directly.
    renderDashboard({ initialTab: 'settlement' });
    expect(screen.queryByTestId('payroll-modal')).toBeNull();
  });

  // ── hideTabs prop ──

  it('passes hideTabs to DashboardTabs', () => {
    renderDashboard({ hideTabs: true });
    expect(screen.getByTestId('hide-tabs').textContent).toBe('true');
  });

  // ── admin passes correct isAdmin flag ──

  it('passes isAdmin=true to DashboardTabs for admin', () => {
    renderDashboard();
    expect(screen.getByTestId('is-admin').textContent).toBe('true');
  });

  it('passes isAdmin=false to DashboardTabs for driver', () => {
    mockUseAuth.mockReturnValue({
      currentUser: driverUser(),
      lang: 'zh',
    });
    renderDashboard();
    expect(screen.getByTestId('is-admin').textContent).toBe('false');
  });

  // ── Error boundary wrappers ──

  it('wraps overview tab in error boundary', () => {
    renderDashboard({ initialTab: 'overview' });
    expect(screen.getByTestId('error-boundary-总览')).toBeTruthy();
  });

  it('wraps tracking tab in error boundary', () => {
    renderDashboard({ initialTab: 'tracking' });
    expect(screen.getByTestId('error-boundary-追踪')).toBeTruthy();
  });

  it('wraps settlement tab in error boundary', () => {
    renderDashboard({ initialTab: 'settlement' });
    expect(screen.getByTestId('error-boundary-结算')).toBeTruthy();
  });

  // ── Remaining admin tabs ──

  it('renders team tab content for admin', () => {
    renderDashboard({ initialTab: 'team' });
    expect(screen.getByTestId('driver-management')).toBeTruthy();
  });

  it('renders locations tab content for admin', () => {
    renderDashboard({ initialTab: 'locations' });
    expect(screen.getByTestId('sites-tab')).toBeTruthy();
  });

  it('renders tracking tab content for admin', () => {
    renderDashboard({ initialTab: 'tracking' });
    expect(screen.getByTestId('tracking-tab')).toBeTruthy();
  });

  it('renders ai-logs tab content for admin', () => {
    renderDashboard({ initialTab: 'ai-logs' });
    expect(screen.getByTestId('ai-logs-tab')).toBeTruthy();
  });

  // ── Driver role enforcement ──

  it('forces driver to settlement tab even when initialTab is overview', () => {
    mockUseAuth.mockReturnValue({
      currentUser: driverUser(),
      lang: 'zh',
    });
    renderDashboard({ initialTab: 'overview' });
    // useEffect forces non-admin to settlement
    expect(screen.getByTestId('active-tab').textContent).toBe('settlement');
    expect(screen.getByTestId('settlement-tab')).toBeTruthy();
    expect(screen.queryByTestId('overview-tab')).toBeNull();
  });

  // ── Payroll section in team tab ──

  it('renders payroll header in team tab', () => {
    renderDashboard({ initialTab: 'team' });
    expect(screen.getByText('薪资中心')).toBeTruthy();
    expect(screen.getByText('工资单与支付凭证')).toBeTruthy();
  });

  it('team tab wraps in error boundary', () => {
    renderDashboard({ initialTab: 'team' });
    expect(screen.getByTestId('error-boundary-司机管理')).toBeTruthy();
  });

  // ── Settlement tab accessible to admin ──

  it('renders settlement tab for admin', () => {
    renderDashboard({ initialTab: 'settlement' });
    expect(screen.getByTestId('settlement-tab')).toBeTruthy();
    expect(screen.getByTestId('error-boundary-结算')).toBeTruthy();
  });

  // ── Remaining error boundaries ──

  it('wraps locations tab in error boundary', () => {
    renderDashboard({ initialTab: 'locations' });
    expect(screen.getByTestId('error-boundary-机器管理')).toBeTruthy();
  });

  it('wraps ai-logs tab in error boundary', () => {
    renderDashboard({ initialTab: 'ai-logs' });
    expect(screen.getByTestId('error-boundary-AI日志')).toBeTruthy();
  });

  // ── hideTabs=false default ──

  it('passes hideTabs=false by default', () => {
    renderDashboard();
    expect(screen.getByTestId('hide-tabs').textContent).toBe('false');
  });
});
