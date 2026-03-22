
import React, { useState, useEffect } from 'react';
import { User, Lock, ArrowRight, AlertCircle, Loader2, Languages, Crown } from 'lucide-react';
import { User as UserType, TRANSLATIONS } from '../types';
import { checkDbHealth, supabase } from '../supabaseClient';
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
    return zh ? '登录失败，请检查网络后重试' : 'Login failed. Check your connection and retry.';
  };

  useEffect(() => {
    checkDbHealth().then(isOnline => setDbStatus(isOnline ? 'online' : 'offline'));
  }, []);

  const fetchUserProfile = async (authUserId: string, fallbackEmail?: string) => {
    const result = await fetchCurrentUserProfile(authUserId, fallbackEmail || '');

    if (!result.success) {
      await signOutCurrentUser();
      setError(resolveSupabaseLoginError('error' in result ? (result as { error: string }).error : 'Unknown error', lang));
      return;
    }

    // Admin-only gate: drivers must use the dedicated Driver App
    if (result.user.role !== 'admin') {
      await signOutCurrentUser();
      setError(lang === 'zh'
        ? '此入口仅供管理员使用，请前往司机专用 APP 登录'
        : 'This console is for admins only. Drivers please use the Driver App.');
      return;
    }

    onLogin(result.user);
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
            <button onClick={() => onSetLang('zh')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 transition-all shadow-silicone border border-white/60 ${lang === 'zh' ? 'bg-indigo-600 text-white shadow-silicone-pressed' : 'bg-white text-slate-400'}`}><Languages size={12}/> 中文</button>
            <button onClick={() => onSetLang('sw')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 transition-all shadow-silicone border border-white/60 ${lang === 'sw' ? 'bg-indigo-600 text-white shadow-silicone-pressed' : 'bg-white text-slate-400'}`}><Languages size={12}/> EN</button>
         </div>
         <div className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all shadow-silicone border border-white/60 ${dbStatus === 'online' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
            {dbStatus === 'checking' ? 'Connecting...' : dbStatus === 'online' ? 'Cloud Ready' : 'Local Mode'}
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
          {/* Admin-only badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full shadow-silicone-sm">
            <Crown size={9} className="text-indigo-500" fill="currentColor" />
            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">
              {lang === 'zh' ? '管理员专用入口' : 'Admin Console Only'}
            </span>
          </div>
        </div>

        <div className="bg-[#f5f7fa] p-10 rounded-[40px] shadow-silicone border border-white/60 w-full space-y-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-3">
              <label htmlFor="email-input" className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
                 <User size={12} className="text-indigo-500" /> {t.username}
              </label>
              <input id="email-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-[#f0f2f5] border-none rounded-2xl py-4 px-5 font-bold text-slate-700 shadow-silicone-pressed outline-none transition-all placeholder:text-slate-400" placeholder="email@example.com" required />
            </div>
            <div className="space-y-3">
              <label htmlFor="password-input" className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
                 <Lock size={12} className="text-indigo-500" /> {t.password}
              </label>
              <input id="password-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-[#f0f2f5] border-none rounded-2xl py-4 px-5 font-black text-slate-700 shadow-silicone-pressed outline-none transition-all placeholder:text-slate-400" placeholder="••••••••" required />
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
              {isLoading ? <Loader2 size={20} className="animate-spin text-indigo-600" /> : <span className="flex items-center gap-2">{t.loginBtn} <ArrowRight size={20} /></span>}
            </button>

            <div className="text-center">
              <p className={`text-[8px] font-bold uppercase tracking-widest ${dbStatus === 'online' ? 'text-emerald-400' : dbStatus === 'offline' ? 'text-rose-400' : 'text-slate-300'}`}>
                {dbStatus === 'online' ? '● Connected' : dbStatus === 'offline' ? '● Offline' : '● Checking...'}
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
