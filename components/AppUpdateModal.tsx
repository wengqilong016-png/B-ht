import { Capacitor } from '@capacitor/core';
import { Download, X, Sparkles } from 'lucide-react';
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
  const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—';
  const updateIdentity = update
    ? [update.latestVersion, update.latestVersionCode, update.latestGitSha].filter(Boolean).join(':')
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
    try {
      if (Capacitor.getPlatform() === 'android') {
        showToast(
          lang === 'zh'
            ? '正在准备完整安装包，系统随后会弹出安装界面。'
            : 'Preparing the full APK. Android should open the installer next.',
          'info',
        );
        await ApkUpdate.downloadAndInstall({ url: update.apkUrl });
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
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-slate-900 to-slate-800 px-5 pt-6 pb-5">
          <button
            onClick={handleDismiss}
            className="absolute right-4 top-4 text-slate-500 hover:text-white"
          >
            <X size={16} />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-400 shadow-lg shadow-amber-500/30">
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
              </p>
              {(update.latestTag || update.latestReleasedAt) && (
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                  {update.latestTag ? `${update.latestTag}` : ''}
                  {update.latestReleasedAt ? ` · ${update.latestReleasedAt}` : ''}
                </p>
              )}
            </div>
          </div>
          {update.releaseNotes && (
            <p className="text-xs text-slate-400 leading-relaxed">{update.releaseNotes}</p>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs font-bold text-slate-600 leading-relaxed">
            {lang === 'zh'
              ? '这是完整 APK 覆盖安装，不是热更新。点击后会下载新安装包并打开系统安装器；安装完成后旧数据不会丢失。'
              : 'This is a full APK replacement, not a hot patch. Tap download to fetch the new APK and open the Android installer — your data stays safe.'}
          </p>

          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3.5 text-sm font-black text-slate-900 shadow-lg shadow-amber-200 active:scale-95 transition-transform disabled:opacity-70"
            >
              <Download size={16} />
              {downloading
                ? (lang === 'zh' ? '正在准备安装…' : 'Preparing install…')
                : (lang === 'zh' ? '立即下载安装' : 'Download & Install')}
            </button>

          <button
            onClick={openBrowserDownload}
            className="w-full py-2.5 text-xs font-bold text-slate-500 hover:text-slate-700"
          >
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
