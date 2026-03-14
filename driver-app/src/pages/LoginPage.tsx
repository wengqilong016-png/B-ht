import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Driver } from '../types';

interface LoginPageProps {
  onLogin: (driver: Driver) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      // Sign in with email (Gmail) + password via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });

      if (authError || !authData.user) {
        setError('邮箱或密码错误 / Barua pepe au nenosiri si sahihi');
        return;
      }

      // Load profile to get driver_id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('driver_id, display_name, role')
        .eq('auth_user_id', authData.user.id)
        .maybeSingle();

      if (profileError || !profile?.driver_id) {
        setError('账户未关联司机信息，请联系管理员 / Akaunti haihusishwi na dereva, wasiliana na msimamizi');
        await supabase.auth.signOut();
        return;
      }

      // Load driver details
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
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎰</div>
          <h1 className="text-2xl font-bold text-amber-500">Bahati Jackpots</h1>
          <p className="text-slate-400 text-sm mt-1">Driver App / Programu ya Dereva</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              邮箱 / Barua pepe
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@gmail.com"
              autoComplete="email"
              autoCapitalize="none"
              inputMode="email"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 text-base"
              style={{ minHeight: '48px' }}
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              密码 / Nenosiri
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 text-base"
              style={{ minHeight: '48px' }}
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !email.trim() || !password.trim()}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
            style={{ minHeight: '52px', fontSize: '16px' }}
          >
            {isLoading ? (
              <>
                <span className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                <span>登录中... / Inaingia...</span>
              </>
            ) : (
              <span>登录 / Ingia</span>
            )}
          </button>
        </form>

        <p className="text-center text-slate-500 text-xs mt-6">
          请输入您的 Gmail 邮箱和密码登录<br />
          Ingiza barua pepe ya Gmail na nenosiri lako
        </p>
      </div>
    </div>
  );
}