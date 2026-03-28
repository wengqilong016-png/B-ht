import React from 'react';
import {
  Activity,
  Bell,
  BookOpen,
  Brain,
  Briefcase,
  CheckSquare,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  MapPin,
  PieChart,
  PlusCircle,
  Radio,
  Search,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react';

export type AdminView =
  | 'dashboard'
  | 'settlement'
  | 'map'
  | 'sites'
  | 'team'
  | 'billing'
  | 'ai'
  | 'collect'
  | 'debt'
  | 'history'
  | 'reports'
  | 'change-review'
  | 'diagnostics'
  | 'fleet-diagnostics'
  | 'health-alerts'
  | 'audit-trail'
  | 'support-cases'
  | 'case-detail'
  | 'driver-lookup'
  | 'driver-machines'
  | 'admin-management';

export interface AdminNavItem {
  id: AdminView;
  icon: React.ReactElement;
  label: string;
  labelEn?: string;
  badge?: number;
}

export function buildAdminPrimaryNav(totalApprovalBadge: number): AdminNavItem[] {
  return [
    { id: 'dashboard', icon: <LayoutDashboard size={18} />, label: '工作台', labelEn: 'Overview' },
    { id: 'settlement', icon: <CheckSquare size={18} />, label: '审批中心', labelEn: 'Approvals', badge: totalApprovalBadge },
    { id: 'map', icon: <MapPin size={18} />, label: '地图与轨迹', labelEn: 'Map & Routes' },
    { id: 'sites', icon: <Store size={18} />, label: '网点管理', labelEn: 'Sites' },
    { id: 'change-review', icon: <ClipboardList size={18} />, label: '变更审核', labelEn: 'Change Req.' },
    { id: 'team', icon: <Users size={18} />, label: '车队与薪资', labelEn: 'Fleet' },
    { id: 'billing', icon: <FileSpreadsheet size={18} />, label: '月账单核对', labelEn: 'Billing' },
    { id: 'ai', icon: <Brain size={18} />, label: 'AI 日志', labelEn: 'AI Logs' },
    { id: 'diagnostics', icon: <Activity size={18} />, label: '本地队列诊断', labelEn: 'Local Queue' },
    { id: 'fleet-diagnostics', icon: <Radio size={18} />, label: '车队健康', labelEn: 'Fleet Diag.' },
    { id: 'health-alerts', icon: <Bell size={18} />, label: '健康告警', labelEn: 'Alerts' },
    { id: 'support-cases', icon: <Briefcase size={18} />, label: '支持工单', labelEn: 'Cases' },
    { id: 'audit-trail', icon: <BookOpen size={18} />, label: '操作审计', labelEn: 'Audit Trail' },
    { id: 'driver-lookup', icon: <Search size={18} />, label: '司机查询', labelEn: 'Driver Lookup' },
    { id: 'admin-management', icon: <ShieldCheck size={18} />, label: '管理员', labelEn: 'Admins' },
  ];
}

export const ADMIN_SECONDARY_NAV: AdminNavItem[] = [
  { id: 'collect', icon: <PlusCircle size={18} />, label: '采集录入' },
  { id: 'debt', icon: <CreditCard size={18} />, label: '债务管理' },
  { id: 'reports', icon: <PieChart size={18} />, label: '财务报表' },
  { id: 'history', icon: <History size={18} />, label: '操作记录' },
];

export const ADMIN_PAGE_TITLES: Record<AdminView, string> = {
  dashboard: 'Action Center',
  settlement: 'Settlement',
  map: 'Map & Routes',
  sites: 'Site Management',
  team: 'Team',
  billing: 'Billing',
  ai: 'AI Audit',
  collect: 'Collect',
  debt: 'Finance',
  history: 'History',
  reports: 'Reports',
  'change-review': 'Change Requests',
  diagnostics: 'Local Queue Diagnostics',
  'fleet-diagnostics': 'Fleet-Wide Diagnostics',
  'health-alerts': 'Health Alerts',
  'audit-trail': 'Support Audit Trail',
  'support-cases': 'Support Cases',
  'case-detail': 'Case Detail',
  'driver-lookup': 'Driver Lookup',
  'driver-machines': 'Driver Machines',
  'admin-management': 'Admin Management',
};

export function mapAdminViewToDashboardTab(v: AdminView): 'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'ai-logs' | 'tracking' {
  if (v === 'settlement') return 'settlement';
  if (v === 'map') return 'tracking';
  if (v === 'sites') return 'locations';
  if (v === 'ai') return 'ai-logs';
  return 'overview';
}
