import React, { createContext, useContext } from 'react';

import type { User } from '../types';

interface AuthContextValue {
  currentUser: User;
  userRole: 'admin' | 'driver';
  lang: 'zh' | 'sw';
  setLang: (lang: 'zh' | 'sw') => void;
  handleLogout: () => void;
  activeDriverId: string | undefined;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: AuthContextValue;
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
