import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Login from '../components/Login';
import type { User } from '../types';

const mockCheckDbHealth = jest.fn<() => Promise<boolean>>();
const mockSignInWithEmailPassword = jest.fn<
  (email: string, password: string) => Promise<{ success: true; user: { id: string; email: string } } | { success: false; error: string }>
>();
const mockFetchCurrentUserProfile = jest.fn<
  (authUserId: string, fallbackEmail?: string) => Promise<{ success: true; user: User } | { success: false; error: string }>
>();
const mockSignOutCurrentUser = jest.fn<() => Promise<void>>();

jest.mock('../supabaseClient', () => ({
  checkDbHealth: () => mockCheckDbHealth(),
  envVarsMissing: false,
  supabase: {},
}));

jest.mock('../services/authService', () => ({
  signInWithEmailPassword: (email: string, password: string) => mockSignInWithEmailPassword(email, password),
  fetchCurrentUserProfile: (authUserId: string, fallbackEmail?: string) =>
    mockFetchCurrentUserProfile(authUserId, fallbackEmail),
  signOutCurrentUser: () => mockSignOutCurrentUser(),
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'auth-user-1',
    username: 'driver@example.com',
    role: 'driver',
    name: 'Driver One',
    driverId: 'drv-1',
    mustChangePassword: false,
    ...overrides,
  };
}

describe('Login profile fetch flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckDbHealth.mockResolvedValue(true);
  });

  it('logs in with valid credentials, fetches the profile, and forwards the user into the app shell', async () => {
    const onLogin = jest.fn<(user: User) => void>();
    const user = makeUser();

    mockSignInWithEmailPassword.mockResolvedValue({
      success: true,
      user: {
        id: user.id,
        email: user.username,
      },
    });
    mockFetchCurrentUserProfile.mockResolvedValue({
      success: true,
      user,
    });

    render(<Login onLogin={onLogin} lang="zh" onSetLang={() => {}} />);
    await waitFor(() => expect(mockCheckDbHealth).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'driver@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/密码/), {
      target: { value: 'correct-horse-battery-staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: /登录/i }));

    await waitFor(() => expect(mockSignInWithEmailPassword).toHaveBeenCalledWith(
      'driver@example.com',
      'correct-horse-battery-staple',
    ));
    await waitFor(() => expect(mockFetchCurrentUserProfile).toHaveBeenCalledWith(
      user.id,
      user.username,
    ));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(user));

    expect(mockSignOutCurrentUser).not.toHaveBeenCalled();
    expect(screen.queryByText('账号存在但未配置权限，请联系管理员重新运行 SQL 初始化脚本')).toBeNull();
    expect(screen.queryByText('账号角色配置错误，请联系管理员')).toBeNull();
  });
});
