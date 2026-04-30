import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import AppUpdateModal from '../components/AppUpdateModal';

const mockUseAppUpdateCheck = jest.fn();
const mockDownloadAndInstall = jest.fn<(options: { url: string }) => Promise<void>>();
const mockOpenUnknownSourcesSettings = jest.fn<() => Promise<void>>();
const mockShowToast = jest.fn();
const mockGetPlatform = jest.fn(() => 'android');

jest.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => mockGetPlatform(),
  },
}));

jest.mock('../hooks/useAppUpdateCheck', () => ({
  useAppUpdateCheck: () => mockUseAppUpdateCheck(),
}));

jest.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock('../services/apkUpdate', () => ({
  ApkUpdate: {
    downloadAndInstall: (options: { url: string }) => mockDownloadAndInstall(options),
    openUnknownSourcesSettings: () => mockOpenUnknownSourcesSettings(),
  },
}));

type GlobalWithBuildInfo = typeof globalThis & {
  __APP_VERSION__?: string;
  __APP_VERSION_CODE__?: number;
  __APP_GIT_SHA__?: string;
};

describe('AppUpdateModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    (globalThis as GlobalWithBuildInfo).__APP_VERSION__ = '1.0.8';
    (globalThis as GlobalWithBuildInfo).__APP_VERSION_CODE__ = 41;
    (globalThis as GlobalWithBuildInfo).__APP_GIT_SHA__ = 'abc123456789';
    mockUseAppUpdateCheck.mockReturnValue({
      hasUpdate: true,
      latestVersion: '1.0.9',
      latestVersionCode: 42,
      latestGitSha: 'def987654321',
      latestTag: 'main-latest',
      latestReleasedAt: '2026-04-12T06:07:29Z',
      apkUrl: 'https://b-ht.vercel.app/downloads/bahati-latest-release.apk',
      releaseNotes: 'main build 1.0.9 (def9876)',
    });
    mockDownloadAndInstall.mockResolvedValue(undefined);
    mockOpenUnknownSourcesSettings.mockResolvedValue(undefined);
    mockGetPlatform.mockReturnValue('android');
  });

  it('shows clear installed and available Android build details', () => {
    render(<AppUpdateModal lang="zh" />);

    expect(screen.getByText('发现新版本')).not.toBeNull();
    expect(screen.getByText('当前构建')).not.toBeNull();
    expect(screen.getByText('线上构建')).not.toBeNull();
    expect(screen.getByText('#41 · abc1234')).not.toBeNull();
    expect(screen.getByText('#42 · def9876')).not.toBeNull();
    expect(screen.getByText(/来源：bahatiwin\.space/)).not.toBeNull();
    expect(screen.getByText('安装完成后重新打开 App；不再提示更新就是成功。')).not.toBeNull();
  });

  it('starts Android APK installation and confirms handoff', async () => {
    render(<AppUpdateModal lang="zh" />);

    fireEvent.click(screen.getByText('立即下载安装'));

    await waitFor(() => {
      expect(mockDownloadAndInstall).toHaveBeenCalledWith({
        url: 'https://b-ht.vercel.app/downloads/bahati-latest-release.apk',
      });
    });

    expect(mockShowToast).toHaveBeenCalledWith(
      '正在下载完整 APK。下载完成后，Android 会弹出安装确认界面。',
      'info',
    );
    expect(mockShowToast).toHaveBeenCalledWith(
      '已交给 Android 安装器。请点“安装”，完成后重新打开 App。',
      'success',
    );
    expect(screen.getByTestId('apk-installer-handed-off').textContent).toContain('已打开 Android 安装流程');
  });

  it('opens unknown app install settings when Android requires permission', async () => {
    const permissionError = new Error('permission required') as Error & { code: string };
    permissionError.code = 'INSTALL_PERMISSION_REQUIRED';
    mockDownloadAndInstall.mockRejectedValueOnce(permissionError);

    render(<AppUpdateModal lang="zh" />);

    fireEvent.click(screen.getByText('立即下载安装'));

    await waitFor(() => {
      expect(mockOpenUnknownSourcesSettings).toHaveBeenCalledTimes(1);
    });
    expect(mockShowToast).toHaveBeenCalledWith(
      '请先允许“安装未知应用”，然后再点击更新。',
      'error',
    );
  });
});
