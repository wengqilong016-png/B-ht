import { Capacitor } from '@capacitor/core';
import { CheckCircle2, Download, ExternalLink, ShieldCheck, Sparkles, X } from 'lucide-react';
import React, { useState } from 'react';

import { useToast } from '../contexts/ToastContext';
import { useAppUpdateCheck } from '../hooks/useAppUpdateCheck';
import { ApkUpdate } from '../services/apkUpdate';

interface Props {
  lang: 'zh' | 'sw';
}

const AppUpdateModal: React.FC<Props> = ({ lang }) => {
  const { showToast } = useToast();
  const update = useAppUpdateCheck();
  const [localDismissed, setLocalDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [installerHandedOff, setInstallerHandedOff] = useState(false);
  const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—';
  const currentVersionCode =
    typeof __APP_VERSION_CODE__ !== 'undefined' && __APP_VERSION_CODE__ > 0 ? __APP_VERSION_CODE__ : null;
  const currentGitSha = typeof __APP_GIT_SHA__ !== 'undefined' ? __APP_GIT_SHA__ : '';
  const updateIdentity = update
    ? [update.latestVersion, update.latestVersionCode, update.latestGitSha].filter(Boolean).join(':')
    : null;
  const shortCurrentSha = currentGitSha ? currentGitSha.slice(0, 7) : '—';
  const shortLatestSha = update?.latestGitSha ? update.latestGitSha.slice(0, 7) : '—';
  const releasedAt = update?.latestReleasedAt
    ? new Date(update.latestReleasedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-GB', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  // Persist dismissal keyed by the latest version so re-mounting the component
  // (e.g. after a parent re-render) doesn't re-show a modal the user already dismissed.
  // Wrapped in try-catch: sessionStorage can throw SecurityError in private-browsing
  // modes or when storage is explicitly disabled by the browser.
  let dismissedVersion: string | null = null;
  try {
    dismissedVersion = typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('update-dismissed-version')
      : null;
  } catch {}
  const isSessionDismissed = update?.hasUpdate && !!updateIdentity && dismissedVersion === updateIdentity;

  const openBrowserDownload = () => {
    const popup = window.open(update?.apkUrl, '_blank', 'noopener,noreferrer');
    if (!popup && update?.apkUrl) {
      window.location.assign(update.apkUrl);
    }
  };

  const handleDismiss = () => {
    setLocalDismissed(true);
    try {
      if (updateIdentity && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('update-dismissed-version', updateIdentity);
      }
    } catch {}
  };

  if (!update?.hasUpdate || localDismissed || isSessionDismissed) return null;

  const handleDownload = async () => {
    setDownloading(true);
    setInstallerHandedOff(false);
    try {
      if (Capacitor.getPlatform() === 'android') {
        showToast(
          lang === 'zh'
            ? '正在下载完整 APK。下载完成后，Android 会弹出安装确认界面。'
            : 'Downloading the full APK. Android will ask you to confirm the install.',
          'info',
        );
        await ApkUpdate.downloadAndInstall({ url: update.apkUrl });
        setInstallerHandedOff(true);
        showToast(
          lang === 'zh'
            ? '已交给 Android 安装器。请点“安装”，完成后重新打开 App。'
            : 'Handed off to Android installer. Tap Install, then reopen the app.',
          'success',
        );
      } else {
        openBrowserDownload();
      }
    } catch (err) {
      const anyErr = err as any;
      const msg = err instanceof Error ? err.message : String(anyErr?.message ?? err);
      if (anyErr?.code === 'INSTALL_PERMISSION_REQUIRED') {
        showToast(
          lang === 'zh'
            ? '请先允许“安装未知应用”，然后再点击更新。'
            : 'Please allow "Install unknown apps" for this app, then try again.',
          'error',
        );
        try {
          await ApkUpdate.openUnknownSourcesSettings();
        } catch {}
      } else {
        showToast(
          lang === 'zh'
            ? `系统安装器未正常拉起，改为浏览器下载安装：${msg}`
            : `Installer did not open. Falling back to browser download: ${msg}`,
          'warning',
        );
        openBrowserDownload();
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm p-4 pb-8">
      <div className="w-full max-w-sm rounded-lg bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-slate-900 to-slate-800 px-5 pt-6 pb-5">
          <button
            onClick={handleDismiss}
            className="absolute right-4 top-4 text-slate-500 hover:text-white"
          >
            <X size={16} />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400 shadow-lg shadow-amber-500/30">
              <Sparkles size={20} className="text-slate-900" fill="currentColor" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {lang === 'zh' ? '发现新版本' : 'Update Available'}
              </p>
              <p className="text-lg font-black text-white">
                v{update.latestVersion}
                {typeof update.latestVersionCode === 'number' ? ` (${update.latestVersionCode})` : ''}
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {lang === 'zh' ? '当前版本' : 'Current'} v{currentVersion}
                {currentVersionCode ? ` (${currentVersionCode})` : ''}
              </p>
              {(update.latestTag || update.latestReleasedAt) && (
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                  {update.latestTag ? `${update.latestTag}` : ''}
                  {releasedAt ? ` · ${releasedAt}` : ''}
                </p>
              )}
            </div>
          </div>
          {update.releaseNotes && (
            <p className="text-xs text-slate-400 leading-relaxed">{update.releaseNotes}</p>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs font-bold text-slate-600 leading-relaxed">
            {lang === 'zh'
              ? '这是完整 APK 覆盖安装，不是热更新。安装完成后旧数据不会丢失；重新打开 App 后，如果这个提示消失，就说明已经更新成功。'
              : 'This is a full APK replacement, not a hot patch. Your data stays safe. After reopening the app, this prompt disappearing means the update succeeded.'}
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <p className="font-black text-slate-400 uppercase">{lang === 'zh' ? '当前构建' : 'Installed'}</p>
                <p className="font-black text-slate-800">v{currentVersion}</p>
                <p className="font-bold text-slate-500">
                  {currentVersionCode ? `#${currentVersionCode}` : '#—'} · {shortCurrentSha}
                </p>
              </div>
              <div>
                <p className="font-black text-slate-400 uppercase">{lang === 'zh' ? '线上构建' : 'Available'}</p>
                <p className="font-black text-emerald-700">v{update.latestVersion}</p>
                <p className="font-bold text-slate-500">
                  {typeof update.latestVersionCode === 'number' ? `#${update.latestVersionCode}` : '#—'} · {shortLatestSha}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[11px] font-bold text-slate-600">
              <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
              <span>
                {lang === 'zh'
                  ? `来源：b-ht.vercel.app${releasedAt ? ` · 发布：${releasedAt}` : ''}`
                  : `Source: b-ht.vercel.app${releasedAt ? ` · Released: ${releasedAt}` : ''}`}
              </span>
            </div>
          </div>

          <div className="space-y-2 text-xs font-bold text-slate-600">
            <div className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 text-[10px] text-white">1</span>
              <p>{lang === 'zh' ? '点击下面按钮下载完整 APK。' : 'Tap the button below to download the full APK.'}</p>
            </div>
            <div className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 text-[10px] text-white">2</span>
              <p>{lang === 'zh' ? 'Android 弹出安装器后，选择“安装”。' : 'When Android opens the installer, choose Install.'}</p>
            </div>
            <div className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 text-[10px] text-white">3</span>
              <p>{lang === 'zh' ? '安装完成后重新打开 App；不再提示更新就是成功。' : 'Reopen the app. No update prompt means it worked.'}</p>
            </div>
          </div>

          {installerHandedOff && (
            <div
              data-testid="apk-installer-handed-off"
              className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"
            >
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
              <span>
                {lang === 'zh'
                  ? '已打开 Android 安装流程。请完成系统安装后重新打开 App。'
                  : 'Android install flow has started. Finish the system install, then reopen the app.'}
              </span>
            </div>
          )}

          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-400 py-3.5 text-sm font-black text-slate-900 shadow-lg shadow-amber-200 active:scale-95 transition-transform disabled:opacity-70"
            >
              <Download size={16} />
              {downloading
                ? (lang === 'zh' ? '正在下载并准备安装…' : 'Downloading and preparing…')
                : (lang === 'zh' ? '立即下载安装' : 'Download & Install')}
            </button>

          <button
            onClick={openBrowserDownload}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-700"
          >
            <ExternalLink size={13} />
            {lang === 'zh' ? '如果系统安装器没有弹出，改用浏览器下载 APK' : 'If the installer does not open, download the APK in your browser'}
          </button>

          <button
            onClick={handleDismiss}
            className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-slate-600"
          >
            {lang === 'zh' ? '稍后提醒' : 'Remind me later'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppUpdateModal;
