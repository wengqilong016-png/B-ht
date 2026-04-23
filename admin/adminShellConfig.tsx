import {
  BarChart2,
  CheckSquare,
  CreditCard,
  DatabaseBackup,
  Gauge,
  History,
  LayoutDashboard,
  MapPin,
  PlusCircle,
  Store,
  Users,
} from 'lucide-react';
import React from 'react';

export type AdminView =
  | 'dashboard'
  | 'settlement'
  | 'map'
  | 'sites'
  | 'team'
  | 'collect'
  | 'debt'
  | 'history'
  | 'monthly'
  | 'driver-flow'
  | 'dead-letter';

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
  { id: 'driver-flow', icon: <Gauge size={18} />, label: '司机卡点', labelEn: 'Driver Flow' },
  { id: 'dead-letter', icon: <DatabaseBackup size={18} />, label: '同步故障', labelEn: 'Sync Failures' },
  { id: 'monthly', icon: <BarChart2 size={18} />, label: '月度报表', labelEn: 'Monthly Report' },
  { id: 'history', icon: <History size={18} />, label: '操作记录', labelEn: 'Activity Log' },
];

export const ADMIN_PAGE_TITLES: Record<AdminView, string> = {
  dashboard: '工作台',
  settlement: '审批中心',
  map: '地图与轨迹',
  sites: '网点管理',
  team: '车队与薪资',
  collect: '采集录入',
  debt: '债务管理',
  history: '操作记录',
  monthly: '月度报表',
  'driver-flow': '司机卡点',
  'dead-letter': '同步故障',
};

export function mapAdminViewToDashboardTab(v: AdminView): 'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'tracking' {
  if (v === 'settlement') return 'settlement';
  if (v === 'map') return 'tracking';
  if (v === 'sites') return 'locations';
  return 'overview';
}
