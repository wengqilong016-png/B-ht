import React, { useState } from 'react';
import { Lock, ShieldAlert, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { TRANSLATIONS } from '../types';
import { changeUserPassword } from '../services/authService';
import { isPasswordStrong, MIN_PASSWORD_LENGTH } from '../utils/passwordPolicy';
import { useFormStatus } from '../hooks/useFormStatus';

interface ForcePasswordChangeProps {
  lang: 'zh' | 'sw';
  onSuccess: () => void;
}

const ForcePasswordChange: React.FC<ForcePasswordChangeProps> = ({ lang, onSuccess }) => {
  const t = TRANSLATIONS[lang];
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const form = useFormStatus();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    form.reset();

    if (newPwd !== confirmPwd) {
      form.setError(t.passwordMismatch);
      return;
    }

    if (newPwd.length < MIN_PASSWORD_LENGTH) {
      form.setError(t.passwordTooShort);
      return;
    }

    if (!isPasswordStrong(newPwd)) {
      form.setError(t.passwordTooWeak);
      return;
    }

    form.setLoading();
    const result = await changeUserPassword(newPwd);
    if (result.success) {
      form.setSuccess(t.updateSuccess);
      // Brief pause so the user can see the success state, then unlock the app.
      setTimeout(onSuccess, 800);
    } else {
      form.setError(result.error ?? t.updateError);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7fa] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        {/* Icon */}
        <div className="w-20 h-20 rounded-[28px] bg-amber-100 border-4 border-amber-200 flex items-center justify-center shadow-silicone">
          <ShieldAlert size={36} className="text-amber-500" />
        </div>

        {/* Heading */}
        <div className="text-center space-y-1">
          <h1 className="text-xl font-black text-slate-800">{t.forceChangeTitle}</h1>
          <p className="text-xs font-bold text-slate-500">{t.forceChangeSubtitle}</p>
        </div>

        {/* Form */}
        <div className="w-full bg-[#f5f7fa] rounded-[32px] shadow-silicone border border-white/60 p-8 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Lock size={10} className="text-amber-500" />
                {t.newPassword}
              </label>
              <input
                type="password"
                value={newPwd}
                onChange={e => { setNewPwd(e.target.value); form.reset(); }}
                className="w-full bg-[#f0f2f5] border-none rounded-2xl py-4 px-5 font-bold text-slate-700 shadow-silicone-pressed outline-none transition-all placeholder:text-slate-400"
                placeholder="••••••••"
                minLength={MIN_PASSWORD_LENGTH}
                required
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Lock size={10} className="text-amber-500" />
                {t.confirmPassword}
              </label>
              <input
                type="password"
                value={confirmPwd}
                onChange={e => { setConfirmPwd(e.target.value); form.reset(); }}
                className="w-full bg-[#f0f2f5] border-none rounded-2xl py-4 px-5 font-bold text-slate-700 shadow-silicone-pressed outline-none transition-all placeholder:text-slate-400"
                placeholder="••••••••"
                minLength={MIN_PASSWORD_LENGTH}
                required
                autoComplete="new-password"
              />
            </div>

            {form.isError && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3">
                <AlertCircle size={14} className="text-rose-500 flex-shrink-0" />
                <span className="text-rose-600 text-xs font-bold">{form.message}</span>
              </div>
            )}

            {form.isSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3">
                <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                <span className="text-emerald-600 text-xs font-bold">{form.message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={form.isLoading || form.isSuccess}
              className="w-full bg-silicone-gradient text-amber-600 font-black py-4 rounded-2xl shadow-silicone hover:shadow-silicone-sm active:shadow-silicone-pressed border border-white/80 flex items-center justify-center gap-2 transition-all disabled:opacity-60"
            >
              {form.isLoading
                ? <Loader2 size={20} className="animate-spin" />
                : form.isSuccess
                  ? <CheckCircle size={20} />
                  : <><Lock size={18} /> {t.forceChangeBtn}</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ForcePasswordChange;
