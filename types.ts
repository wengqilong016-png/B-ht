export interface Location {
  id: string;
  name: string;
  machineId: string;
  lastScore: number;
  area: string;
  assignedDriverId?: string;
  ownerName?: string;
  shopOwnerPhone?: string;
  ownerPhotoUrl?: string;
  machinePhotoUrl?: string;
  initialStartupDebt: number; 
  remainingStartupDebt: number;
  isNewOffice?: boolean;
  coords?: { lat: number; lng: number };
  status: 'active' | 'maintenance' | 'broken';
  lastRevenueDate?: string;
  commissionRate: number;
  resetLocked?: boolean; // Locked when a 9999 reset request is pending
  dividendBalance?: number; // Accumulated owner dividend not yet withdrawn
  isSynced?: boolean; // Added for offline sync tracking
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'driver';
  name: string;
  // For driver-role users, this references public.drivers.id while User.id remains the auth user id.
  driverId?: string;
}

export interface Notification {
  id: string;
  type: 'check-in' | 'alert' | 'system';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  relatedTransactionId?: string;
  driverId?: string;
}

export interface AILog {
  id: string;
  timestamp: string;
  driverId: string;
  driverName: string;
  query: string;
  response: string;
  imageUrl?: string;
  modelUsed: string;
  relatedLocationId?: string;
  relatedTransactionId?: string;
  isSynced?: boolean; // Added for offline sync tracking
}

export interface Transaction {
  id: string;
  timestamp: string;
  uploadTimestamp?: string;
  locationId: string;
  locationName: string;
  driverId: string;
  driverName?: string;
  previousScore: number;
  currentScore: number;
  revenue: number;
  commission: number;
  ownerRetention: number;
  debtDeduction: number;
  startupDebtDeduction: number;
  expenses: number;
  coinExchange: number;
  extraIncome: number;
  netPayable: number;
  gps: { lat: number; lng: number };
  gpsDeviation?: number;
  photoUrl?: string;
  dataUsageKB: number; 
  aiScore?: number;
  isAnomaly?: boolean;
  notes?: string;
  isClearance?: boolean;
  isSynced: boolean;
  reportedStatus?: 'active' | 'maintenance' | 'broken';
  paymentStatus?: 'unpaid' | 'pending' | 'paid' | 'rejected';
  type?: 'collection' | 'expense' | 'reset_request' | 'payout_request';
  
  // Approval pipeline status (AI auto-approve / admin manual review)
  approvalStatus?: 'auto-approved' | 'pending' | 'approved' | 'rejected';

  // New Fields for Expense Approval
  expenseType?: 'public' | 'private'; // Public = Company Cost, Private = Driver Loan
  expenseCategory?: 'fuel' | 'repair' | 'fine' | 'allowance' | 'salary_advance' | 'other';
  expenseStatus?: 'pending' | 'approved' | 'rejected';
  expenseDescription?: string;

  // Payout request fields (店主分红提现)
  payoutAmount?: number;
}

export interface Driver {
  id: string;
  name: string;
  username: string;
  phone: string;
  initialDebt: number;
  remainingDebt: number;
  dailyFloatingCoins: number;
  vehicleInfo: {
    model: string;
    plate: string;
  };
  currentGps?: { lat: number; lng: number };
  lastActive?: string;
  status: 'active' | 'inactive';
  baseSalary: number;
  commissionRate: number;
  isSynced?: boolean; // Added for offline sync tracking
}

export interface DailySettlement {
  id: string;
  date: string;
  // If submitted by driver, adminId is null initially
  adminId?: string;
  adminName?: string;
  driverId?: string; // New: Who submitted it
  driverName?: string; // New
  
  totalRevenue: number;
  totalNetPayable: number;
  totalExpenses: number;
  driverFloat: number;
  expectedTotal: number;
  
  actualCash: number;
  actualCoins: number;
  shortage: number;
  
  note?: string;
  timestamp: string;
  transferProofUrl?: string;
  
  // New: Workflow status
  status: 'pending' | 'confirmed' | 'rejected';
  isSynced?: boolean; // Added for offline sync tracking
}

/**
 * iOS-safe UUID generator: falls back to a timestamp+random string on iOS < 15.4
 * where crypto.randomUUID() is not available.
 */
export const safeRandomUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Polyfill for older iOS Safari
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Resize an image file to a max width and return a data URL.
 * Shared utility to avoid duplicating the canvas-based resize logic across components.
 */
export const resizeImage = (
  file: File,
  maxWidth: number = 800,
  quality: number = 0.6,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  });

export const CONSTANTS = {
  COIN_VALUE_TZS: 200,
  DEFAULT_PROFIT_SHARE: 0.15,
  DEBT_RECOVERY_RATE: 0.10,
  ROLLOVER_THRESHOLD: 10000,
  OFFLINE_STORAGE_KEY: 'kiosk_offline_tx',
  STORAGE_LOCATIONS_KEY: 'kiosk_locations_data',
  STORAGE_DRIVERS_KEY: 'kiosk_drivers_data_v3',
  STORAGE_SETTLEMENTS_KEY: 'kiosk_daily_settlements',
  STORAGE_TRANSACTIONS_KEY: 'kiosk_transactions_data',
  STORAGE_AI_LOGS_KEY: 'kiosk_ai_logs',
  STORAGE_NOTIFICATIONS_KEY: 'kiosk_notifications',
  IMAGE_MAX_WIDTH: 800, 
  IMAGE_QUALITY: 0.6,
  STAGNANT_DAYS_THRESHOLD: 7,
};

export const TRANSLATIONS = {
  zh: {
    login: '账号登录 Login',
    username: '邮箱',
    password: '密码 Password',
    loginBtn: '立即登录 Login Now',
    loginFailed: '登录失败，请检查账号密码',
    loginError: '登录过程中发生错误',
    profileNotProvisioned: '账号已存在，但未完成资料配置',
    invalidAccountRole: '账号角色无效',
    dashboard: '管理概览 Admin',
    collect: '现场巡检',
    register: '新机注册',
    debt: '财务回收',
    ai: 'AI 审计',
    history: '审计日志',
    reports: '财务报表',
    logout: '退出登录',
    sync: '立即同步',
    offline: '待传记录',
    score: '当前读数',
    lastScore: '上次读数',
    revenue: '总营收',
    expenses: '支出项目',
    net: '应缴现金',
    submit: '提交报告',
    scanner: '扫码识别',
    retention: '留存分红',
    exchange: '换币金额',
    loading: '处理中...',
    success: '提交成功',
    profit: '净利润',
    outstanding: '待收欠款',
    export: '导出报表',
    selectMachine: '选择机器',
    enterId: '输入编号',
    diff: '差值',
    formula: '营收计算',
    currentReading: '红色LED读数',
    confirmSubmit: '提交报告',
    photoRequired: '须拍照片',
    arrears: '我的挂账',
    dailySettlement: '今日结算 Today\u2019s Settlement',
    totalNet: '净收益',
    publicExp: '公款支出',
    cashInHand: '理论应收',
    shortage: '短款',
    surplus: '长款',
    perfect: '账目吻合',
    uploadProof: '上传凭证',
    inputCash: '实收纸币',
    inputCoins: '实收硬币',
    startupRecovery: '点位押金/启动金',
    driverLoan: '个人借款/预支',
    balance: '未结余额',
    progress: '进度',
    pay: '还款',
    fullyPaid: '已还清',
    reScan: '重新扫描',
    acquiringGps: '正在获取GPS...',
    saving: '保存中...',
    skipGps: 'GPS慢? 跳过提交',
    aiReviewTitle: 'AI识别结果确认',
    counterScore: '机器读数 (Counter)',
    machineCondition: '运行状态 (Condition)',
    notes: '备注',
    notesPlaceholder: '输入机器状况描述...',
    retake: '重拍',
    confirmFill: '确认并填入',
    fullCollect: '全额收回 (FULL COLLECT)',
    registerNewMachine: '新机入网注册',
    noMachinesAssigned: '暂无分配的机器',
    viewHistory: '查看历史账单',
    settlementSubmitted: '账单已提交',
    settlementConfirmed: '账单已确认',
    backToSettlement: '返回结算',
    // New: Reset & Payout & Approval
    resetRequest: '申请分数重置 (9999)',
    resetRequestDesc: '机器爆机，申请清零重置',
    resetLocked: '重置锁定中',
    payoutRequest: '分红提现申请',
    payoutRequestDesc: '店主申请提取分红',
    payoutAmount: '提现金额',
    approvalCenter: '审批中心',
    anomalyReview: '异常审查',
    resetApproval: '重置审批',
    payoutApproval: '提现审批',
    approveBtn: '批准',
    rejectBtn: '驳回',
    autoApproved: '自动通过',
    pendingApproval: '待审批',
    machineLocked: '机器已锁定',
    totalMachines: '可巡机器',
    pendingStops: '待处理点位',
    urgentMachines: '优先机器',
    nearbySites: '附近点位',
    allAreas: '全部区域',
    quickFilterAll: '全部',
    quickFilterPending: '未完成',
    quickFilterUrgent: '高优先',
    quickFilterNearby: '附近',
    visitedToday: '今日已完成',
    pendingToday: '今日未到',
    awaitingGps: '等待GPS',
    staleMachine: '久未营收',
    trackingSearch: '搜索司机 / 车牌 / 区域',
    driverFilterAll: '全部司机',
    driverFilterAttention: '需关注',
    driverFilterActive: '在线',
    driverFilterStale: '掉线',
    todaysCollections: '今日采集',
    todaysCash: '今日应缴',
    attentionSites: '异常点位',
    staleGps: '定位延迟',
    liveNow: '在线中',
    noDriversFound: '没有符合筛选条件的司机',
    risk9999: '9999风险'
  },
  sw: {
    login: 'Driver Login',
    username: 'Email',
    password: 'Password',
    loginBtn: 'Login Now',
    loginFailed: 'Login failed',
    loginError: 'Login error',
    profileNotProvisioned: 'Account exists but profile is not provisioned.',
    invalidAccountRole: 'Invalid account role.',
    dashboard: 'Dashboard',
    collect: 'Collect',
    register: 'New Machine',
    debt: 'Finance',
    ai: 'AI Audit',
    history: 'History',
    reports: 'Reports',
    logout: 'Logout',
    sync: 'Sync Now',
    offline: 'Pending Sync',
    score: 'Current Reading (Counter)',
    lastScore: 'Last Reading',
    revenue: 'Revenue',
    expenses: 'Expenses',
    net: 'Cash to Submit',
    submit: 'Submit Report',
    scanner: 'AI Scanner',
    retention: 'Owner Commission',
    exchange: 'Coin Exchange',
    loading: 'Processing...',
    success: 'Submitted',
    profit: 'Profit',
    outstanding: 'Outstanding Debt',
    export: 'Export Report',
    selectMachine: 'Select Machine',
    enterId: 'Search by Name or ID',
    diff: 'Difference',
    formula: 'Revenue Calculation',
    currentReading: 'Enter Red LED Number',
    confirmSubmit: 'Confirm & Submit Report',
    photoRequired: 'Photo Required',
    arrears: 'My Debts',
    dailySettlement: "Today's Settlement",
    totalNet: 'Net Collection',
    publicExp: 'Company Expenses',
    cashInHand: 'Expected Cash',
    shortage: 'Shortage',
    surplus: 'Surplus',
    perfect: 'Accounts Match',
    uploadProof: 'Upload Receipt Photo',
    inputCash: 'Enter Cash (Notes)',
    inputCoins: 'Enter Coins Amount',
    startupRecovery: 'Startup Capital Recovery',
    driverLoan: 'Personal Loan',
    balance: 'Remaining Balance',
    progress: 'Progress',
    pay: 'Pay Now',
    fullyPaid: 'Fully Paid',
    reScan: 'Scan Again',
    acquiringGps: 'Getting GPS...',
    saving: 'Saving...',
    skipGps: 'GPS Slow? Skip & Submit',
    aiReviewTitle: 'Confirm AI Reading',
    counterScore: 'Machine Counter Reading',
    machineCondition: 'Machine Condition',
    notes: 'Notes',
    notesPlaceholder: 'Describe machine condition...',
    retake: 'Retake Photo',
    confirmFill: 'Confirm & Fill',
    fullCollect: 'FULL COLLECT (No Commission)',
    registerNewMachine: 'Register New Machine',
    noMachinesAssigned: 'No Machines Assigned',
    viewHistory: 'View Collection History',
    settlementSubmitted: 'Settlement Submitted',
    settlementConfirmed: 'Settlement Confirmed',
    backToSettlement: "Back to Settlement",
    // New: Reset & Payout & Approval
    resetRequest: 'Request Score Reset (9999)',
    resetRequestDesc: 'Machine overflow, request reset to zero',
    resetLocked: 'Reset Locked',
    payoutRequest: 'Dividend Withdrawal Request',
    payoutRequestDesc: 'Owner requests dividend payout',
    payoutAmount: 'Payout Amount',
    approvalCenter: 'Approval Center',
    anomalyReview: 'Anomaly Review',
    resetApproval: 'Reset Approval',
    payoutApproval: 'Payout Approval',
    approveBtn: 'Approve',
    rejectBtn: 'Reject',
    autoApproved: 'Auto-Approved',
    pendingApproval: 'Pending Approval',
    machineLocked: 'Machine Locked',
    totalMachines: 'Assigned Machines',
    pendingStops: 'Pending Stops',
    urgentMachines: 'Priority Machines',
    nearbySites: 'Nearby Sites',
    allAreas: 'All Areas',
    quickFilterAll: 'All',
    quickFilterPending: 'Pending',
    quickFilterUrgent: 'Priority',
    quickFilterNearby: 'Nearby',
    visitedToday: 'Visited Today',
    pendingToday: 'Not Visited',
    awaitingGps: 'Waiting for GPS',
    staleMachine: 'No recent revenue',
    trackingSearch: 'Search driver / plate / area',
    driverFilterAll: 'All Drivers',
    driverFilterAttention: 'Needs Attention',
    driverFilterActive: 'Live',
    driverFilterStale: 'Stale GPS',
    todaysCollections: "Today's Collections",
    todaysCash: "Today's Cash",
    attentionSites: 'Attention Sites',
    staleGps: 'Stale GPS',
    liveNow: 'Live Now',
    noDriversFound: 'No drivers match the current filter',
    risk9999: '9999 Risk'
  }
};

export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
