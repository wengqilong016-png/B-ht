import React from 'react';
import {
  BarChart2,
  CheckSquare,
  CreditCard,
  History,
  LayoutDashboard,
  MapPin,
  PieChart,
  PlusCircle,
  Store,
  Users,
} from 'lucide-react';

export type AdminView =
  | 'dashboard'
  | 'settlement'
  | 'map'
  | 'sites'
  | 'team'
  | 'collect'
  | 'debt'
  | 'history'
  | 'monthly';

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
    { id: 'team', icon: <Users size={18} />, label: '车队与薪资', labelEn: 'Fleet' },
  ];
}

export const ADMIN_SECONDARY_NAV: AdminNavItem[] = [
  { id: 'collect', icon: <PlusCircle size={18} />, label: '采集录入', labelEn: 'Collection Entry' },
  { id: 'debt', icon: <CreditCard size={18} />, label: '债务管理', labelEn: 'Debt Management' },
  { id: 'monthly', icon: <BarChart2 size={18} />, label: '月度报表', labelEn: 'Monthly Report' },
  { id: 'history', icon: <History size={18} />, label: '操作记录', labelEn: 'Activity Log' },
];

export const ADMIN_PAGE_TITLES: Record<AdminView, string> = {
  dashboard: 'Action Center',
  settlement: 'Settlement',
  map: 'Map & Routes',
  sites: 'Site Management',
  team: 'Team',
  collect: 'Collect',
  debt: 'Finance',
  history: 'History',
  monthly: '月度报表',
};

export function mapAdminViewToDashboardTab(v: AdminView): 'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'tracking' {
  if (v === 'settlement') return 'settlement';
  if (v === 'map') return 'tracking';
  if (v === 'sites') return 'locations';
  return 'overview';
}
