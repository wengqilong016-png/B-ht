import { Banknote, CreditCard, History, PlusCircle, UserCircle } from 'lucide-react';
import React from 'react';

export type DriverView = 'quick' | 'collect' | 'settlement' | 'debt' | 'history' | 'status';

export interface DriverNavItem {
  id: DriverView;
  icon: React.ReactElement;
  getLabel: (
    lang: 'zh' | 'sw',
    translations: Record<string, string>,
  ) => string;
}

export const DRIVER_NAV_ITEMS: DriverNavItem[] = [
  { id: 'quick', icon: <PlusCircle size={16} />, getLabel: (_lang, t) => t.quickCollect || 'Quick' },
  { id: 'collect', icon: <PlusCircle size={16} />, getLabel: (_lang, t) => t.collect },
  { id: 'settlement', icon: <Banknote size={16} />, getLabel: (_lang, t) => t.dailySettlement },
  { id: 'debt', icon: <CreditCard size={16} />, getLabel: (_lang, t) => t.debt },
  { id: 'history', icon: <History size={16} />, getLabel: (_lang, t) => t.history },
  { id: 'status', icon: <UserCircle size={16} />, getLabel: (_lang, t) => t.driverStatus },
];
