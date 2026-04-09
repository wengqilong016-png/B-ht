import { Lock, Loader2, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';

import { updatePassword } from '../repositories/authRepository';
import { supabase } from '../supabaseClient';
import { User, TRANSLATIONS } from '../types';

const isPasswordStrong = (password: string): boolean => {
  return /[A-Z]/.test(password) && /[0-9]/.test(password) && password.length >= 8;
};

interface ForcePasswordChangeProps {
  currentUser: User;
  lang: 'zh' | 'sw';
  onComplete: () => void;
}

const ForcePasswordChange: React.FC<ForcePasswordChangeProps> = ({ currentUser, lang, onComplete }) => {
  const t = TRANSLATIONS[lang];
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPwd !== confirmPwd) { setError(t.passwordMismatch); return; }
    if (newPwd.length < 8) { setError(t.passwordTooShort); return; }
    if (!isPasswordStrong(newPwd)) { setError(t.passwordTooWeak); return; }

    setIsSubmitting(true);
    try {
      await updatePassword(newPwd);
      // Clear the must_change_password flag via the SECURITY DEFINER function
      if (!supabase) throw new Error('Supabase client unavailable');
      await supabase.rpc('clear_my_must_change_password');
      onComplete();
    } catch (err) {
      setError((err as Error).message ?? t.updateError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f3f5f8] p-4">
      <div className="w-full max-w-sm bg-white rounded-card shadow-xl p-6 space-y-5">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
            <ShieldCheck size={24} className="text-amber-600" />
          </div>
          <h1 className="text-base font-black text-slate-900 uppercase">{t.forcePasswordChangeTitle}</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.forcePasswordChangeHint}</p>
          <p className="text-[11px] font-bold text-slate-500">{currentUser.name} · {currentUser.username}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-1">
              <Lock size={10} /> {t.newPassword}
            </label>
            <input
              type="password"
              value={newPwd}
              onChange={e => { setNewPwd(e.target.value); setError(''); }}
              className="w-full bg-slate-100 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-slate-400"
              placeholder="••••••••"
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-1">
              <Lock size={10} /> {t.confirmPassword}
            </label>
            <input
              type="password"
              value={confirmPwd}
              onChange={e => { setConfirmPwd(e.target.value); setError(''); }}
              className="w-full bg-slate-100 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-slate-400"
              placeholder="••••••••"
              minLength={8}
              required
            />
          </div>

          {error && (
            <p className="text-xs font-bold text-rose-500 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-indigo-600 text-white font-black py-3 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={14} />}
            {t.saveChanges}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ForcePasswordChange;
