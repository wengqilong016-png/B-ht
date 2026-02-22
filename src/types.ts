
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
  idPhotoUrl?: string; // New: ID Card photo for registration
  initialStartupDebt: number; 
  remainingStartupDebt: number;
  isNewOffice?: boolean;
  coords?: { lat: number; lng: number };
  status: 'active' | 'maintenance' | 'broken';
  lastRevenueDate?: string;
  commissionRate: number;
  merchantBalance: number; // New: Unpaid commissions for monthly settlement
  isSynced?: boolean; // Added for offline sync tracking
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'driver';
  name: string;
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
  aiScore?: number; // New: Score detected by AI for verification
  aiConfidence?: number; // New: AI confidence level (0-1)
  revenue: number;
  commission: number;
  ownerRetention: number;
  isMerchantDeposit?: boolean; // New: If commission is saved for monthly settlement
  tips?: number; // New: Tips given to customers (Question mark #1)
  driverLoan?: number; // New: Driver personal loan deduction (Question mark #2)
  debtDeduction: number;
  startupDebtDeduction: number;
  expenses: number;
  coinExchange: number;
  extraIncome: number;
  netPayable: number;
  gps: { lat: number; lng: number };
  gpsDeviation?: number;
  photoUrl?: string; // Before photo (High score)
  clearancePhotoUrl?: string; // New: After photo (Zero score)
  dataUsageKB: number; 
  notes?: string;
  isClearance?: boolean;
  isSynced: boolean;
  reportedStatus?: 'active' | 'maintenance' | 'broken';
  paymentStatus?: 'unpaid' | 'pending' | 'paid' | 'rejected';
  type?: 'collection' | 'expense';
  
  // New Fields for Expense Approval
  expenseType?: 'public' | 'private'; // Public = Company Cost, Private = Driver Loan
  expenseCategory?: 'fuel' | 'repair' | 'fine' | 'allowance' | 'salary_advance' | 'other';
  expenseStatus?: 'pending' | 'approved' | 'rejected';
  expenseDescription?: string;
}

export interface Driver {
  id: string;
  name: string;
  username: string;
  password: string;
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
  ADMIN_USERNAME: 'JACK',
  ADMIN_PASSWORD: '0808',
  STAGNANT_DAYS_THRESHOLD: 7,
};

export const TRANSLATIONS = {
  zh: {
    login: '账号登录 Login',
    username: '用户名 Username',
    password: '密码 Password',
    loginBtn: '立即登录 Login Now',
    dashboard: '管理概览 Dashibodi',
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
    dailySettlement: '日终对账',
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
    fullyPaid: '已还清'
  },
  sw: {
    login: 'Ingia Kwenye Mfumo',
    username: 'Jina la Mtumiaji',
    password: 'Nenosiri',
    loginBtn: 'Ingia Sasa',
    dashboard: 'Dashibodi ya Udhibiti',
    collect: 'Ukaguzi wa Nyanjani',
    register: 'Usajili wa Mashine',
    debt: 'Udhibiti wa Madeni',
    ai: 'Ukaguzi wa AI',
    history: 'Kumbukumbu',
    reports: 'Ripoti za Fedha',
    logout: 'Ondoka',
    sync: 'Tuma Data Sasa',
    offline: 'Kazi za Ndani',
    score: 'Namba ya Counter',
    lastScore: 'Namba ya Zamani',
    revenue: 'Mapato Ghafi',
    expenses: 'Matumizi/Gharama',
    net: 'Pesa ya Kukabidhi',
    submit: 'Tuma Ripoti',
    scanner: 'Skena Counter',
    retention: 'Gawio la Duka',
    exchange: 'Badilisha Sarafu',
    loading: 'Inashughulikia...',
    success: 'Imefanikiwa',
    profit: 'Faida Halisi',
    outstanding: 'Madeni ya Nje',
    export: 'Pakua Ripoti',
    selectMachine: 'Chagua Mashine',
    enterId: 'Weka ID ya Mashine',
    diff: 'Tofauti',
    formula: 'Hesabu ya Mapato',
    currentReading: 'Soma Namba ya LED',
    confirmSubmit: 'Thibitisha na Tuma',
    photoRequired: 'Picha Inahitajika',
    arrears: 'Madeni Yangu',
    dailySettlement: 'Hesabu ya Siku',
    totalNet: 'Makusanyo Halisi',
    publicExp: 'Gharama za Kampuni',
    cashInHand: 'Pesa Inayotarajiwa',
    shortage: 'Pesa Iliyopungua',
    surplus: 'Pesa Iliyozidi',
    perfect: 'Hesabu Imekamilika',
    uploadProof: 'Pakia Risiti',
    inputCash: 'Noti (Cash)',
    inputCoins: 'Sarafu (Coins)',
    startupRecovery: 'Marejesho ya Mtaji',
    driverLoan: 'Mkopo wa Dereva',
    balance: 'Salio la Deni',
    progress: 'Hatua za Marejesho',
    pay: 'Lipa Deni',
    fullyPaid: 'Imelipwa Kamili'
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
