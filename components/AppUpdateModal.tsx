import { Download, X, Sparkles } from 'lucide-react';
import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';

import { useAppUpdateCheck } from '../hooks/useAppUpdateCheck';
import { ApkUpdate } from '../services/apkUpdate';
import { useToast } from '../contexts/ToastContext';

interface Props {
  lang: 'zh' | 'sw';
}

const AppUpdateModal: React.FC<Props> = ({ lang }) => {
  const { showToast } = useToast();
  const update = useAppUpdateCheck();
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—';

  if (!update?.hasUpdate || dismissed) return null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      if (Capacitor.getPlatform() === 'android') {
        await ApkUpdate.downloadAndInstall({ url: update.apkUrl });
      } else {
        window.open(update.apkUrl, '_blank');
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
        showToast(lang === 'zh' ? `更新失败：${msg}` : `Update failed: ${msg}`, 'error');
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
            onClick={() => setDismissed(true)}
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
              ? '新版本已发布，安装后旧数据不会丢失。点击下载安装包，覆盖安装即可完成更新。'
              : 'A new version is available. Tap download to install over your existing app — your data is safe.'}
          </p>

          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3.5 text-sm font-black text-slate-900 shadow-lg shadow-amber-200 active:scale-95 transition-transform disabled:opacity-70"
          >
            <Download size={16} />
            {downloading
              ? (lang === 'zh' ? '正在打开下载…' : 'Opening download…')
              : (lang === 'zh' ? '立即下载安装' : 'Download & Install')}
          </button>

          <button
            onClick={() => setDismissed(true)}
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
