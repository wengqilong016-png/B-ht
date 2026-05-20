import { beforeEach, describe, expect, it, jest } from '@jest/globals';
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
let mockEnvVarsMissing = false;
let mockSupabaseUrl = 'https://example.supabase.co';
let mockUsingRuntimeCredentials = false;
const mockSaveRuntimeCredentials = jest.fn<(url: string, key: string) => void>();
const mockClearRuntimeCredentials = jest.fn<() => void>();

jest.mock('../supabaseClient', () => ({
  checkDbHealth: () => mockCheckDbHealth(),
  get envVarsMissing() {
    return mockEnvVarsMissing;
  },
  supabase: {},
  get SUPABASE_URL() {
    return mockSupabaseUrl;
  },
  get usingRuntimeCredentials() {
    return mockUsingRuntimeCredentials;
  },
  saveRuntimeCredentials: (url: string, key: string) => mockSaveRuntimeCredentials(url, key),
  clearRuntimeCredentials: () => mockClearRuntimeCredentials(),
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
    mockEnvVarsMissing = false;
    mockSupabaseUrl = 'https://example.supabase.co';
    mockUsingRuntimeCredentials = false;
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

  it('keeps the login shell visible and opens connection settings when env config is missing', async () => {
    mockEnvVarsMissing = true;
    mockCheckDbHealth.mockResolvedValue(false);

    render(<Login onLogin={() => {}} lang="zh" onSetLang={() => {}} />);

    expect(await screen.findByText('缺少前端配置')).not.toBeNull();
    expect(screen.getByText('连接设置')).not.toBeNull();
    expect(screen.getByText('处理方式')).not.toBeNull();
    expect(screen.getByRole('button', { name: /登录/i }).hasAttribute('disabled')).toBe(true);
  });
});
