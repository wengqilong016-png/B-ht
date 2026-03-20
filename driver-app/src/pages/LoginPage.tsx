import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Driver } from '../types';

interface LoginPageProps {
  onLogin: (driver: Driver) => void;
  onMustChangePassword: () => void;
}

export default function LoginPage({ onLogin, onMustChangePassword }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isAdminBlocked, setIsAdminBlocked] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setIsLoading(true);
    setError('');
    setIsAdminBlocked(false);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });

      if (authError || !authData.user) {
        setError('邮箱或密码错误 / Barua pepe au nenosiri si sahihi');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('driver_id, display_name, role, must_change_password')
        .eq('auth_user_id', authData.user.id)
        .maybeSingle();

      if (profileError || !profile?.driver_id) {
        setError('账户未关联司机信息，请联系管理员 / Akaunti haihusishwi na dereva, wasiliana na msimamizi');
        await supabase.auth.signOut();
        return;
      }

      // Block admin accounts from the driver portal
      if (profile.role === 'admin') {
        await supabase.auth.signOut();
        setIsAdminBlocked(true);
        return;
      }

      // Force password change if required
      if (profile.must_change_password) {
        onMustChangePassword();
        return;
      }

      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('id, name, username, phone, remainingDebt, dailyFloatingCoins, status, currentGps')
        .eq('id', profile.driver_id)
        .maybeSingle();

      if (driverError || !driver) {
        setError('无法加载司机信息，请重试 / Imeshindwa kupakia taarifa za dereva, jaribu tena');
        await supabase.auth.signOut();
        return;
      }

      onLogin({
        id: driver.id,
        name: driver.name || profile.display_name || email,
        username: driver.username || email,
        phone: driver.phone || '',
        remainingDebt: driver.remainingDebt ?? 0,
        dailyFloatingCoins: driver.dailyFloatingCoins ?? 0,
        status: driver.status || 'active',
        currentGps: driver.currentGps,
      });
    } catch {
      setError('网络错误，请重试 / Hitilafu ya mtandao, jaribu tena');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm bg-slate-900 rounded-3xl shadow-2xl border border-slate-800 p-8">
        {/* Icon */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-500/40 flex items-center justify-center mb-4">
            <span className="text-4xl">🎰</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">BAHATI JACKPOTS</h1>
          <div className="mt-2 bg-amber-500/10 text-amber-400 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-amber-500/20">
            🚗 Driver Portal / Kituo cha Dereva
          </div>
        </div>

        {/* Admin-blocked error */}
        {isAdminBlocked && (
          <div className="bg-red-950/60 border border-red-800/60 rounded-2xl px-4 py-3 text-red-300 text-xs font-medium mb-4">
            <p className="mb-1">此通道仅限司机使用，管理员请访问管理后台</p>
            <p>This portal is for drivers only. Admins please use the Admin Console.</p>
            <p className="mt-2 text-red-400/60 text-[10px]">
              如需管理后台链接请联系技术支持 / Contact support for the Admin Console link
            </p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
              邮箱 / Barua Pepe
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@gmail.com"
              autoComplete="email"
              autoCapitalize="none"
              inputMode="email"
              className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 w-full transition-all"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
              密码 / Nenosiri
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 w-full transition-all"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="bg-red-950/60 border border-red-800/60 rounded-2xl px-4 py-3 text-red-300 text-xs font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !email.trim() || !password.trim()}
            className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black rounded-2xl py-4 text-sm uppercase tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>登录中... / Inaingia...</span>
              </>
            ) : (
              <span>登录 / Ingia</span>
            )}
          </button>
        </form>

        <p className="text-slate-600 text-[10px] text-center mt-4">
          请输入您的 Gmail 邮箱和密码登录<br />
          Ingiza barua pepe ya Gmail na nenosiri lako
        </p>
      </div>
    </div>
  );
}