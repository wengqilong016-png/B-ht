
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
  initialStartupDebt: number; 
  remainingStartupDebt: number;
  isNewOffice?: boolean;
  coords?: { lat: number; lng: number };
  status: 'active' | 'maintenance' | 'broken';
  lastRevenueDate?: string;
  commissionRate: number;
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
}

export interface Transaction {
  id: string;
  timestamp: string;
  uploadTimestamp?: string;
  locationId: string;
  locationName: string;
  driverId: string;
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
}

export interface DailySettlement {
  id: string;
  date: string;
  adminId: string;
  adminName: string;
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
    collect: '现场巡检 Kazi ya Eneo',
    register: '新机注册 Sajili Mashine',
    debt: '财务回收 Madeni',
    ai: 'AI 审计 Ukaguzi wa AI',
    history: '审计日志 Historia',
    reports: '财务报表 Ripoti za Fedha',
    logout: '退出登录 Ondoka',
    sync: '立即同步 Tuma Cloud',
    offline: '待传记录 Kazi za Nje',
    score: '当前读数 Namba ya Sasa',
    lastScore: '上次读数 Namba ya Zamani',
    revenue: '总营收 Mapato Kamili',
    expenses: '支出项目 Matumizi',
    net: '应缴现金 Pesa ya Kukabidhi',
    submit: '提交报告 Tuma Ripoti',
    scanner: '扫码识别 Skena Namba',
    retention: '留存分红 Pesa ya Dukani',
    exchange: '换币金额 Sarafu',
    loading: '处理中 Inashughulikia...',
    success: '提交成功 Imefanikiwa',
    profit: '净利润 Faida Halisi',
    outstanding: '待收欠款 Madeni ya Nje',
    export: '导出报表 Pakua Ripoti',
    selectMachine: '选择机器 Chagua Mashine',
    enterId: '输入编号 Weka namba',
    diff: '差值 Tofauti',
    formula: '营收计算 Hesabu',
    currentReading: '红色LED读数 Namba ya Nyekundu',
    confirmSubmit: '提交报告 Tuma Ripoti',
    photoRequired: '须拍照片 Picha inahitajika',
    arrears: '我的挂账 Madeni Yangu',
    dailySettlement: '日终对账 Hesabu ya Siku',
    totalNet: '净收益 Mapato Halisi',
    publicExp: '公款支出 Matumizi ya Kazi',
    cashInHand: '理论应收 Pesa ya Kukabidhi',
    shortage: '短款 Upungufu',
    surplus: '长款 Ziada',
    perfect: '账目吻合 Kamili',
    uploadProof: '上传凭证 Pakia Picha',
    inputCash: '实收纸币 Noti',
    inputCoins: '实收硬币 Sarafu',
    startupRecovery: '点位押金/启动金 Marejesho ya Mtaji',
    driverLoan: '个人借款/预支 Mkopo wa Dereva',
    balance: '未结余额 Salio la Deni',
    progress: '进度 Hatua',
    pay: '还款 Lipa',
    fullyPaid: '已还清 Imelipwa'
  },
  sw: {
    login: 'Login 账号登录',
    username: 'Username 用户名',
    password: 'Password 密码',
    loginBtn: 'Login Now 立即登录',
    dashboard: 'Dashibodi 管理概览',
    collect: 'Kazi ya Eneo 现场巡检',
    register: 'Sajili Mashine 新机注册',
    debt: 'Madeni 财务回收',
    ai: 'Ukaguzi wa AI 审计',
    history: 'Historia 审计日志',
    reports: 'Ripoti za Fedha 报表',
    logout: 'Ondoka 退出',
    sync: 'Tuma Cloud 同步',
    offline: 'Kazi za Nje 待传',
    score: 'Namba ya Sasa 读数',
    lastScore: 'Namba ya Zamani 上次',
    revenue: 'Mapato Kamili 营收',
    expenses: 'Matumizi 支出',
    net: 'Pesa ya Kukabidhi 应缴',
    submit: 'Tuma Ripoti 提交',
    scanner: 'Skena Namba 扫码',
    retention: 'Pesa ya Dukani 留存',
    exchange: 'Sarafu 换币',
    loading: 'Inashughulikia 处理中...',
    success: 'Imefanikiwa 成功',
    profit: 'Faida Halisi 利润',
    outstanding: 'Madeni ya Nje 待收',
    export: 'Pakua Ripoti 导出',
    selectMachine: 'Chagua Mashine 选择',
    enterId: 'Weka namba 输入',
    diff: 'Tofauti 差值',
    formula: 'Hesabu 计算',
    currentReading: 'Namba ya Nyekundu 读数',
    confirmSubmit: 'Tuma Ripoti 提交',
    photoRequired: 'Picha inahitajika 须拍照',
    arrears: 'Madeni Yangu 挂账',
    dailySettlement: 'Hesabu ya Siku 对账',
    totalNet: 'Mapato Halisi 净收',
    publicExp: 'Matumizi ya Kazi 支出',
    cashInHand: 'Pesa ya Kukabidhi 应收',
    shortage: 'Upungufu 短款',
    surplus: 'Ziada 长款',
    perfect: 'Kamili 吻合',
    uploadProof: 'Pakia Picha 上传',
    inputCash: 'Noti 纸币',
    inputCoins: 'Sarafu 硬币',
    startupRecovery: 'Marejesho ya Mtaji 启动金',
    driverLoan: 'Mkopo wa Dereva 借款',
    balance: 'Salio la Deni 余额',
    progress: 'Hatua 进度',
    pay: 'Lipa 还款',
    fullyPaid: 'Imelipwa 已还清'
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
