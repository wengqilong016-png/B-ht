
import React, { useState, useEffect } from 'react';
import { User, Lock, ArrowRight, AlertCircle, Loader2, Languages, Crown, Settings, CheckCircle2, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { User as UserType, TRANSLATIONS } from '../types';
import { checkDbHealth, supabase, SUPABASE_URL, envVarsMissing, usingRuntimeCredentials, saveRuntimeCredentials, clearRuntimeCredentials } from '../supabaseClient';
import { fetchCurrentUserProfile, signInWithEmailPassword, signOutCurrentUser } from '../services/authService';

interface LoginProps {
  onLogin: (user: UserType) => void;
  lang: 'zh' | 'sw';
  onSetLang: (lang: 'zh' | 'sw') => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, lang, onSetLang }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Connection settings panel — auto-open when no credentials are configured
  const [showSettings, setShowSettings] = useState(envVarsMissing);
  const [settingsUrl, setSettingsUrl] = useState(SUPABASE_URL);
  const [settingsKey, setSettingsKey] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  const t = TRANSLATIONS[lang];

  const resolveSupabaseLoginError = (rawError: string, language: 'zh' | 'sw'): string => {
    const zh = language === 'zh';
    if (rawError.includes('Invalid login credentials')) {
      return zh ? '邮箱或密码错误，请重试' : 'Wrong email or password. Please try again.';
    }
    if (rawError.includes('Email not confirmed')) {
      return zh ? '邮箱尚未验证，请检查收件箱' : 'Email not verified. Check your inbox.';
    }
    if (rawError.includes('User not found')) {
      return zh ? '账号不存在，请联系管理员' : 'Account not found. Contact admin.';
    }
    if (rawError.includes('Too many requests')) {
      return zh ? '登录尝试次数过多，请稍后再试' : 'Too many attempts. Please wait and retry.';
    }
    if (rawError.includes('Profile not found')) {
      return zh
        ? '账号存在但未配置权限，请联系管理员重新运行 SQL 初始化脚本'
        : 'Account exists but not provisioned. Ask admin to re-run the setup SQL.';
    }
    if (rawError.includes('Invalid user role')) {
      return zh ? '账号角色配置错误，请联系管理员' : 'Invalid account role. Contact admin.';
    }
    if (rawError.includes('Profile fetch failed')) {
      return zh ? '加载账号信息失败，请检查网络后重试' : 'Failed to load account info. Check your connection and retry.';
    }
    return zh ? '登录失败，请检查网络后重试' : 'Login failed. Check your connection and retry.';
  };

  useEffect(() => {
    checkDbHealth().then(isOnline => {
      setDbStatus(isOnline ? 'online' : 'offline');
      // Auto-expand the settings panel when we can't reach the server
      if (!isOnline) setShowSettings(true);
    });
  }, []);

  const fetchUserProfile = async (authUserId: string, fallbackEmail?: string) => {
    const result = await fetchCurrentUserProfile(authUserId, fallbackEmail || '');

    if (!result.success) {
      const err = 'error' in result ? (result as { error: string }).error : 'Unknown error';
      // Only sign out for permanent configuration errors (profile genuinely missing or
      // misconfigured role).  For transient failures (network error, server error) we
      // show an error and leave the session intact so the user can retry without
      // having to go through a full re-authentication cycle.
      const isPermanentError = err === 'Profile not found' || err === 'Invalid user role';
      if (isPermanentError) {
        await signOutCurrentUser();
      }
      setError(resolveSupabaseLoginError(err, lang));
      return;
    }

    onLogin(result.user);
  };

  const handleSaveSettings = () => {
    setSettingsError('');
    const trimUrl = settingsUrl.trim();
    const trimKey = settingsKey.trim();
    if (!trimUrl || !trimKey) {
      setSettingsError(lang === 'zh' ? 'URL 和 Anon Key 均为必填项' : 'Both URL and Anon Key are required.');
      return;
    }
    if (!trimUrl.startsWith('https://')) {
      setSettingsError(lang === 'zh' ? 'URL 必须以 https:// 开头' : 'URL must start with https://');
      return;
    }
    saveRuntimeCredentials(trimUrl, trimKey);
    setSettingsSaved(true);
    // Brief delay so the "Saved" confirmation is visible before the page reloads
    setTimeout(() => window.location.reload(), 800);
  };

  const handleClearSettings = () => {
    clearRuntimeCredentials();
    window.location.reload();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!supabase) {
        setError(lang === 'zh' ? 'Supabase 未配置' : 'Supabase not configured');
        return;
      }

      const loginResult = await signInWithEmailPassword(email, password);
      if (!loginResult.success) {
        setError(resolveSupabaseLoginError(loginResult.error || 'Login failed', lang));
        return;
      }

      await fetchUserProfile(loginResult.user.id, loginResult.user.email || email);
    } catch (err) {
      console.error(err);
      setError(t.loginError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7fa] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 p-6 pt-12 flex justify-between items-start z-30">
         <div className="flex gap-4">
            <button onClick={() => onSetLang('zh')} disabled={isLoading} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 transition-all shadow-silicone border border-white/60 ${lang === 'zh' ? 'bg-indigo-600 text-white shadow-silicone-pressed' : 'bg-white text-slate-400'} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}><Languages size={12}/> 中文</button>
            <button onClick={() => onSetLang('sw')} disabled={isLoading} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 transition-all shadow-silicone border border-white/60 ${lang === 'sw' ? 'bg-indigo-600 text-white shadow-silicone-pressed' : 'bg-white text-slate-400'} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}><Languages size={12}/> EN</button>
         </div>
         <div className="flex items-center gap-2">
            {/* Connection status badge */}
            <div
              className={`px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all shadow-silicone border border-white/60 flex items-center gap-1.5 ${
                dbStatus === 'online'
                  ? 'bg-emerald-50 text-emerald-600'
                  : dbStatus === 'offline'
                  ? 'bg-rose-50 text-rose-600'
                  : 'bg-slate-50 text-slate-400'
              }`}
              title={SUPABASE_URL || 'No URL configured'}
            >
              {dbStatus === 'checking' && <Loader2 size={10} className="animate-spin" />}
              {dbStatus === 'online'   && <Wifi size={10} />}
              {dbStatus === 'offline'  && <WifiOff size={10} />}
              {dbStatus === 'checking' ? 'Connecting...' : dbStatus === 'online' ? 'Connected' : 'No Connection'}
            </div>
            {/* Settings toggle */}
            <button
              onClick={() => setShowSettings(v => !v)}
              className={`p-2 rounded-xl text-[10px] font-black transition-all shadow-silicone border border-white/60 ${showSettings ? 'bg-indigo-600 text-white shadow-silicone-pressed' : 'bg-white text-slate-400'}`}
              title={lang === 'zh' ? '连接设置' : 'Connection Settings'}
            >
              <Settings size={14} />
            </button>
         </div>
      </div>

      <div className="w-full max-w-sm relative z-10 flex flex-col items-center">
        <div className="mb-8 relative">
           <div className="relative w-28 h-28 bg-silicone-gradient rounded-[35px] border border-white/80 flex items-center justify-center shadow-silicone">
              <span className="text-6xl drop-shadow-lg">🦁</span>
              <div className="absolute -top-3 -right-3 bg-amber-500 text-white p-2.5 rounded-2xl border-4 border-white shadow-silicone">
                 <Crown size={20} fill="currentColor" />
              </div>
           </div>
        </div>

        <div className="text-center mb-6 space-y-2">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight uppercase">BAHATI <span className="text-indigo-600">JACKPOTS</span></h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">Field Operations System</p>
        </div>

        <div className="bg-[#f5f7fa] p-10 rounded-[40px] shadow-silicone border border-white/60 w-full space-y-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-3">
              <label htmlFor="email-input" className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
                 <User size={12} className="text-indigo-500" /> {t.username}
              </label>
              <input id="email-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} className={`w-full bg-[#f0f2f5] border-none rounded-2xl py-4 px-5 font-bold text-slate-700 shadow-silicone-pressed outline-none transition-all placeholder:text-slate-400 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`} placeholder="email@example.com" required />
            </div>
            <div className="space-y-3">
              <label htmlFor="password-input" className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
                 <Lock size={12} className="text-indigo-500" /> {t.password}
              </label>
              <input id="password-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} className={`w-full bg-[#f0f2f5] border-none rounded-2xl py-4 px-5 font-black text-slate-700 shadow-silicone-pressed outline-none transition-all placeholder:text-slate-400 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`} placeholder="••••••••" required />
            </div>

            {error && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex flex-col gap-2 shadow-silicone-sm">
                 <div className="flex items-start gap-3">
                   <AlertCircle size={16} className="text-rose-500 flex-shrink-0 mt-0.5" />
                   <span className="text-rose-600 text-xs font-bold leading-relaxed">{error}</span>
                 </div>
                 {error.includes('SQL') && (
                   <p className="text-slate-400 text-[10px] pl-7 leading-relaxed">
                     {lang === 'zh'
                       ? '请前往 Supabase Dashboard → SQL Editor，重新运行设置脚本'
                       : 'Go to Supabase Dashboard → SQL Editor and re-run the setup script.'}
                   </p>
                 )}
              </div>
            )}

            <button type="submit" disabled={isLoading} className="w-full bg-silicone-gradient text-indigo-600 font-black py-4 rounded-2xl shadow-silicone hover:shadow-silicone-sm active:shadow-silicone-pressed border border-white/80 flex items-center justify-center gap-2 transition-all">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={20} className="animate-spin text-indigo-600" />
                  {t.loginBtnLoading}
                </span>
              ) : (
                <span className="flex items-center gap-2">{t.loginBtn} <ArrowRight size={20} /></span>
              )}
            </button>

            <div className="text-center">
              <p className={`text-[8px] font-bold uppercase tracking-widest ${dbStatus === 'online' ? 'text-emerald-400' : dbStatus === 'offline' ? 'text-rose-400' : 'text-slate-300'}`}>
                {dbStatus === 'online'
                  ? `● Connected${usingRuntimeCredentials ? ' (runtime config)' : ''}`
                  : dbStatus === 'offline'
                  ? '● Cannot connect — open Settings to configure'
                  : '● Checking...'}
              </p>
            </div>
          </form>
        </div>

        {/* ── Connection Settings Panel ─────────────────────────────────── */}
        {showSettings && (
          <div className="w-full mt-4 bg-[#f5f7fa] rounded-[32px] shadow-silicone border border-white/60 p-7 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings size={14} className="text-indigo-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                  {lang === 'zh' ? '连接设置' : 'Connection Settings'}
                </span>
              </div>
              {usingRuntimeCredentials && (
                <span className="text-[8px] font-black uppercase tracking-widest text-amber-500 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                  {lang === 'zh' ? '已使用本地配置' : 'Using local config'}
                </span>
              )}
            </div>

            {/* Security notice */}
            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3 flex items-start gap-2" role="alert" aria-label={lang === 'zh' ? '安全警告' : 'Security warning'}>
              <AlertCircle size={13} className="text-rose-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-rose-600 text-[10px] font-bold leading-relaxed">
                {lang === 'zh'
                  ? '请勿在此输入 Service Role Key（服务角色密钥）。该密钥会绕过所有安全规则，不可在浏览器中使用。此处仅填写 Anon Key（公开密钥）。'
                  : 'Do NOT enter the Service Role Key here — it bypasses all security rules and must never be used in a browser. Enter the Anon Key (public key) only.'}
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
                <Wifi size={11} className="text-indigo-400" />
                Supabase URL
              </label>
              <input
                type="url"
                value={settingsUrl}
                onChange={e => setSettingsUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
                className="w-full bg-[#f0f2f5] border-none rounded-2xl py-3.5 px-4 font-bold text-slate-700 text-xs shadow-silicone-pressed outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
                <Lock size={11} className="text-indigo-400" />
                {lang === 'zh' ? 'Anon Key（公开密钥）' : 'Anon Key (public key)'}
              </label>
              <input
                type="password"
                value={settingsKey}
                onChange={e => setSettingsKey(e.target.value)}
                placeholder={lang === 'zh' ? '粘贴你的 anon key...' : 'Paste your anon key...'}
                className="w-full bg-[#f0f2f5] border-none rounded-2xl py-3.5 px-4 font-bold text-slate-700 text-xs shadow-silicone-pressed outline-none placeholder:text-slate-400"
              />
              <p className="text-[9px] text-slate-400 px-1 leading-relaxed">
                {lang === 'zh'
                  ? 'Supabase 控制台 → Settings → API → Project API Keys → anon public'
                  : 'Supabase Dashboard → Settings → API → Project API Keys → anon public'}
              </p>
            </div>

            {settingsError && (
              <div className="flex items-center gap-2 text-rose-500 text-xs font-bold">
                <AlertCircle size={13} /> {settingsError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSaveSettings}
                disabled={settingsSaved}
                className="flex-1 bg-indigo-600 text-white font-black py-3 rounded-2xl text-[11px] uppercase tracking-wide flex items-center justify-center gap-2 shadow-silicone active:shadow-silicone-pressed transition-all disabled:opacity-60"
              >
                {settingsSaved
                  ? <><CheckCircle2 size={14} /> {lang === 'zh' ? '已保存，重新加载中…' : 'Saved — Reloading…'}</>
                  : <><RefreshCw size={14} /> {lang === 'zh' ? '保存并重新连接' : 'Save & Reconnect'}</>}
              </button>
              {usingRuntimeCredentials && (
                <button
                  onClick={handleClearSettings}
                  className="px-4 py-3 bg-[#f0f2f5] text-slate-500 font-black rounded-2xl text-[10px] uppercase shadow-silicone-pressed transition-all"
                  title={lang === 'zh' ? '清除本地配置，使用环境变量' : 'Clear local config, use env vars'}
                >
                  {lang === 'zh' ? '清除' : 'Clear'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
