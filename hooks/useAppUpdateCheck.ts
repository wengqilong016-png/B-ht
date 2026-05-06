import { Capacitor } from '@capacitor/core';
import { useEffect, useState } from 'react';

const NATIVE_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export interface VersionInfo {
  version: string;
  apkUrl: string;
  releaseNotes?: string;
  versionCode?: number;
  gitSha?: string;
  tag?: string;
  releasedAt?: string;
}

export interface UpdateStatus {
  hasUpdate: boolean;
  latestVersion: string;
  latestVersionCode?: number;
  latestGitSha?: string;
  latestTag?: string;
  latestReleasedAt?: string;
  apkUrl: string;
  releaseNotes: string;
}

function hasKnownVersionCode(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function getUpdateManifestUrl(): string {
  // In the Android APK we run at `https://localhost` and `/version.json` points to the bundled asset,
  // which will always match the currently-installed version. For native builds we must read a remote
  // manifest to detect updates.
  //
  // GitHub raw is the fastest signal — it updates the instant a push lands, with zero deployment delay.
  // Vercel serves `/version.json` for the web PWA, but native APK updates should not be gated on Vercel deploys.
  if (Capacitor.isNativePlatform()) {
    const configured =
      typeof __UPDATE_MANIFEST_URL__ !== 'undefined' ? (__UPDATE_MANIFEST_URL__ || '') : '';
    return configured || 'https://raw.githubusercontent.com/wengqilong016-png/bht/main/public/version.json';
  }
  return '/version.json';
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function isRemoteBuildNewer(
  currentVersionCode: number | undefined,
  currentGitSha: string,
  remoteVersionCode: number | undefined,
  remoteGitSha: string | undefined,
): boolean {
  if (hasKnownVersionCode(currentVersionCode) && hasKnownVersionCode(remoteVersionCode)) {
    return remoteVersionCode > currentVersionCode;
  }

  if (currentGitSha && remoteGitSha) {
    return remoteGitSha !== currentGitSha;
  }

  return false;
}

export function useAppUpdateCheck(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
    const currentVersionCode =
      typeof __APP_VERSION_CODE__ !== 'undefined' && Number.isFinite(__APP_VERSION_CODE__) && __APP_VERSION_CODE__ > 0
        ? __APP_VERSION_CODE__
        : undefined;
    const currentGitSha = typeof __APP_GIT_SHA__ !== 'undefined' ? __APP_GIT_SHA__ : '';
    const manifestUrl = getUpdateManifestUrl();
    const isNative = Capacitor.isNativePlatform();

    let didCancel = false;
    let controller: AbortController | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const check = () => {
      controller?.abort();
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);

      // Add a cache-buster as extra protection against stale edge caches.
      fetch(`${manifestUrl}?t=${Date.now()}`, { signal: controller.signal, cache: 'no-store' })
        .then(r => r.json() as Promise<VersionInfo>)
        .then(data => {
          clearTimeout(timeout);
          if (didCancel) return;
          const versionDiff = compareVersions(currentVersion, data.version);
          const hasUpdate =
            versionDiff > 0 ||
            (versionDiff === 0 &&
              isRemoteBuildNewer(currentVersionCode, currentGitSha, data.versionCode, data.gitSha));

          if (hasUpdate) {
            setStatus({
              hasUpdate: true,
              latestVersion: data.version,
              latestVersionCode: data.versionCode,
              latestGitSha: data.gitSha,
              latestTag: data.tag,
              latestReleasedAt: data.releasedAt,
              apkUrl: data.apkUrl,
              releaseNotes: data.releaseNotes ?? '',
            });
          } else {
            setStatus(null);
          }
        })
        .catch(() => clearTimeout(timeout));
    };

    check();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    if (isNative) {
      intervalId = setInterval(check, NATIVE_UPDATE_CHECK_INTERVAL_MS);
    }

    return () => {
      didCancel = true;
      controller?.abort();
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return status;
}
