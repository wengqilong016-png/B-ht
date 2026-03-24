import React from 'react';
import { Banknote, ClipboardList, CreditCard, History, PlusCircle, UserCircle } from 'lucide-react';

export type DriverView = 'collect' | 'settlement' | 'debt' | 'history' | 'requests' | 'status';

export interface DriverNavItem {
  id: DriverView;
  icon: React.ReactElement;
  getLabel: (
    lang: 'zh' | 'sw',
    translations: { collect: string; dailySettlement: string; debt: string; driverStatus: string },
  ) => string;
}

export const DRIVER_NAV_ITEMS: DriverNavItem[] = [
  { id: 'collect', icon: <PlusCircle size={16} />, getLabel: (_lang, t) => t.collect },
  { id: 'settlement', icon: <Banknote size={16} />, getLabel: (_lang, t) => t.dailySettlement },
  { id: 'debt', icon: <CreditCard size={16} />, getLabel: (_lang, t) => t.debt },
  { id: 'history', icon: <History size={16} />, getLabel: (lang) => (lang === 'sw' ? 'Historia' : '记录') },
  { id: 'requests', icon: <ClipboardList size={16} />, getLabel: (lang) => (lang === 'sw' ? 'Maombi' : '申请') },
  { id: 'status', icon: <UserCircle size={16} />, getLabel: (_lang, t) => t.driverStatus },
];
