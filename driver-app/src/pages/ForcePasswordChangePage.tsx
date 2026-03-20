import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { validatePassword } from '../utils/passwordPolicy';
import { withTimeout } from '../utils/timeout';

/** Maximum ms to wait for Supabase Auth to process the password update. */
const UPDATE_TIMEOUT_MS = 15_000;

interface ForcePasswordChangePageProps {
  onSuccess: () => void;
}

export default function ForcePasswordChangePage({ onSuccess }: ForcePasswordChangePageProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validatePassword(newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('两次密码不一致 / Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      let updateResult: Awaited<ReturnType<typeof supabase.auth.updateUser>>;
      try {
        updateResult = await withTimeout(
          supabase.auth.updateUser({ password: newPassword }),
          UPDATE_TIMEOUT_MS,
        );
      } catch (e) {
        const isTimeout = e != null && typeof e === 'object' && (e as { timedOut?: boolean }).timedOut;
        setError(isTimeout
          ? '请求超时，请检查网络连接后重试 / Request timed out — please check your connection'
          : '密码更新失败，请重试 / Password update failed, please try again');
        return;
      }

      if (updateResult.error) {
        setError(updateResult.error.message || '密码更新失败，请重试 / Failed to update password, please try again');
        return;
      }

      const { error: rpcError } = await withTimeout(
        supabase.rpc('clear_my_must_change_password') as unknown as Promise<{ error: { message: string } | null }>,
        10_000,
      ).catch(() => ({ error: null }));
      if (rpcError) {
        // Password was changed successfully but flag couldn't be cleared; still allow login
        // The next login will re-trigger the flow, so surface a soft warning
        console.warn('[ForcePasswordChange] RPC clear_my_must_change_password failed:', rpcError.message);
      }

      setSuccess(true);
      setTimeout(() => onSuccess(), 800);
    } catch {
      setError('网络错误，请重试 / Network error, please try again');
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
            <ShieldAlert className="w-9 h-9 text-amber-400" />
          </div>
          <h1 className="text-xl font-black text-white text-center leading-tight">
            🔐 首次登录须修改密码<br />
            <span className="text-base font-bold text-slate-300">Password Change Required</span>
          </h1>
          <p className="mt-3 text-slate-400 text-[11px] text-center leading-relaxed">
            为保障账号安全，请立即设置新密码（至少8位，含大小写字母和数字）<br />
            For security, set a new password (min 8 chars, upper+lower+number)
          </p>
        </div>

        {success ? (
          <div className="bg-green-950/60 border border-green-700/60 rounded-2xl px-4 py-4 text-green-300 text-sm font-medium text-center">
            ✓ 密码已更新 / Password updated successfully
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                新密码 / New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 w-full transition-all"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                确认密码 / Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
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
              disabled={isLoading || !newPassword || !confirmPassword}
              className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black rounded-2xl py-4 text-sm uppercase tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>处理中... / Processing...</span>
                </>
              ) : (
                <span>设置新密码 / Set New Password</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
