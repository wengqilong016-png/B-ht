
import React, { useState } from 'react';
import { X, Lock, Mail, Phone, CheckCircle, AlertCircle, Loader2, KeyRound, Clock } from 'lucide-react';
import { User as UserType, TRANSLATIONS } from '../types';
import { supabase } from '../supabaseClient';
import { changeUserPassword, updateUserEmail } from '../services/authService';

interface AccountSettingsProps {
  currentUser: UserType;
  lang: 'zh' | 'sw';
  onClose: () => void;
  /** Called when the driver's phone is updated so parent can reflect it */
  onPhoneUpdated?: (driverId: string, phone: string) => void;
}

const AccountSettings: React.FC<AccountSettingsProps> = ({ currentUser, lang, onClose, onPhoneUpdated }) => {
  const t = TRANSLATIONS[lang];

  // Password section
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdStatus, setPwdStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [pwdMsg, setPwdMsg] = useState('');

  // Email section
  const [newEmail, setNewEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [emailMsg, setEmailMsg] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');

  // Phone section (stored in drivers table)
  const [newPhone, setNewPhone] = useState('');
  const [phoneStatus, setPhoneStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [phoneMsg, setPhoneMsg] = useState('');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      setPwdStatus('error');
      setPwdMsg(t.passwordMismatch);
      return;
    }
    if (newPwd.length < 6) {
      setPwdStatus('error');
      setPwdMsg(t.passwordTooShort);
      return;
    }
    setPwdStatus('loading');
    const result = await changeUserPassword(newPwd);
    if (result.success) {
      setPwdStatus('ok');
      setPwdMsg(t.updateSuccess);
      setNewPwd('');
      setConfirmPwd('');
    } else {
      setPwdStatus('error');
      setPwdMsg(result.error ?? t.updateError);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    const target = newEmail.trim();
    setEmailStatus('loading');
    const result = await updateUserEmail(target);
    if (result.success) {
      setSubmittedEmail(target);
      setEmailStatus('ok');
      setEmailMsg(t.emailConfirmationSent);
      setNewEmail('');
    } else {
      setEmailStatus('error');
      setEmailMsg(result.error ?? t.updateError);
    }
  };

  const handleUpdatePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim()) {
      setPhoneStatus('error');
      setPhoneMsg(t.updateError);
      return;
    }
    if (!currentUser.driverId || !supabase) {
      setPhoneStatus('error');
      setPhoneMsg(t.updateError);
      return;
    }
    setPhoneStatus('loading');
    const { error } = await supabase
      .from('drivers')
      .update({ phone: newPhone.trim() })
      .eq('id', currentUser.driverId);
    if (error) {
      setPhoneStatus('error');
      setPhoneMsg(error.message || t.updateError);
    } else {
      setPhoneStatus('ok');
      setPhoneMsg(t.updateSuccess);
      onPhoneUpdated?.(currentUser.driverId, newPhone.trim());
      setNewPhone('');
    }
  };

  const StatusIcon: React.FC<{ status: 'idle' | 'loading' | 'ok' | 'error' }> = ({ status }) => {
    if (status === 'loading') return <Loader2 size={14} className="animate-spin text-indigo-400" />;
    if (status === 'ok') return <CheckCircle size={14} className="text-emerald-400" />;
    if (status === 'error') return <AlertCircle size={14} className="text-rose-400" />;
    return null;
  };

  const inputClass = "w-full bg-[#f0f2f5] border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-700 shadow-silicone-pressed outline-none transition-all placeholder:text-slate-400";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-1.5";
  const sectionClass = "bg-[#f5f7fa] shadow-silicone rounded-2xl p-5 space-y-3";
  const submitClass = "w-full bg-silicone-gradient text-slate-700 font-black py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-silicone hover:shadow-silicone-sm active:shadow-silicone-pressed transition-all disabled:opacity-50 border border-white/40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-200/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#f5f7fa] rounded-[28px] shadow-silicone overflow-hidden flex flex-col max-h-[90vh] border border-white/50">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-silicone-gradient shadow-silicone text-indigo-600 flex items-center justify-center font-black text-sm border border-white/60">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-black text-slate-800">{currentUser.name}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase">{currentUser.username} • {t.accountSettings}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/50 shadow-silicone-sm rounded-xl text-slate-400 hover:text-indigo-600 transition-all border border-white/80">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6">

          {/* ── Change Password ── */}
          <div className={sectionClass}>
            <div className="flex items-center gap-2 mb-3">
              <KeyRound size={14} className="text-amber-500" />
              <p className="text-xs font-black text-white uppercase tracking-widest">{t.changePassword}</p>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className={labelClass}><Lock size={10} className="text-amber-500" />{t.newPassword}</label>
                <input
                  type="password"
                  value={newPwd}
                  onChange={e => { setNewPwd(e.target.value); setPwdStatus('idle'); }}
                  className={inputClass}
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
              </div>
              <div>
                <label className={labelClass}><Lock size={10} className="text-amber-500" />{t.confirmPassword}</label>
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={e => { setConfirmPwd(e.target.value); setPwdStatus('idle'); }}
                  className={inputClass}
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
              </div>
              {pwdStatus !== 'idle' && (
                <div className={`flex items-center gap-2 text-xs font-bold ${pwdStatus === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  <StatusIcon status={pwdStatus} />
                  <span>{pwdMsg}</span>
                </div>
              )}
              <button type="submit" disabled={pwdStatus === 'loading'} className={submitClass}>
                {pwdStatus === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <><Lock size={14} /> {t.saveChanges}</>}
              </button>
            </form>
          </div>

          {/* ── Change Email ── */}
          <div className={sectionClass}>
            <div className="flex items-center gap-2 mb-3">
              <Mail size={14} className="text-indigo-400" />
              <p className="text-xs font-black text-white uppercase tracking-widest">{t.changeEmail}</p>
            </div>

            {/* Current email read-only display */}
            <div className="mb-1">
              <label className={labelClass}><Mail size={10} className="text-slate-400" />{t.currentEmailLabel}</label>
              <p className="w-full bg-[#e8eaed] rounded-xl py-2.5 px-4 text-sm font-bold text-slate-500 shadow-silicone-pressed border border-slate-200/60 truncate">
                {currentUser.username}
              </p>
            </div>

            {/* Pending confirmation panel – shown instead of the form after a successful request */}
            {emailStatus === 'ok' ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-amber-500 flex-shrink-0" />
                  <span className="text-xs font-black text-amber-700 uppercase tracking-wide">{t.emailPendingConfirmation}</span>
                </div>
                <p className="text-[11px] font-bold text-slate-600 leading-relaxed">
                  {t.emailCheckNewInboxNote}
                  {submittedEmail ? (
                    <span className="block mt-1 text-indigo-600 break-all">{submittedEmail}</span>
                  ) : null}
                </p>
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                  {t.emailOldRemainsActiveNote}
                </p>
                <button
                  type="button"
                  onClick={() => { setEmailStatus('idle'); setSubmittedEmail(''); setNewEmail(''); }}
                  className="text-[10px] text-indigo-500 font-black underline underline-offset-2 hover:text-indigo-700 transition-colors"
                >
                  {t.emailSubmitAnotherRequest} →
                </button>
              </div>
            ) : (
              <form onSubmit={handleChangeEmail} className="space-y-3">
                <div>
                  <label className={labelClass}><Mail size={10} className="text-indigo-400" />{t.newEmail}</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => { setNewEmail(e.target.value); setEmailStatus('idle'); }}
                    className={inputClass}
                    placeholder="new@example.com"
                    required
                  />
                </div>
                {emailStatus === 'error' && (
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-400">
                    <AlertCircle size={14} className="text-rose-400" />
                    <span>{emailMsg}</span>
                  </div>
                )}
                <button type="submit" disabled={emailStatus === 'loading'} className={submitClass}>
                  {emailStatus === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <><Mail size={14} /> {t.saveChanges}</>}
                </button>
              </form>
            )}
          </div>

          {/* ── Update Phone (driver only) ── */}
          {currentUser.role === 'driver' && currentUser.driverId && supabase && (
            <div className={sectionClass}>
              <div className="flex items-center gap-2 mb-3">
                <Phone size={14} className="text-emerald-400" />
                <p className="text-xs font-black text-white uppercase tracking-widest">{t.updatePhone}</p>
              </div>
              <form onSubmit={handleUpdatePhone} className="space-y-3">
                <div>
                  <label className={labelClass}><Phone size={10} className="text-emerald-400" />{t.newPhone}</label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={e => { setNewPhone(e.target.value); setPhoneStatus('idle'); }}
                    className={inputClass}
                    placeholder="+255 6xx xxx xxxx"
                    required
                  />
                </div>
                {phoneStatus !== 'idle' && (
                  <div className={`flex items-center gap-2 text-xs font-bold ${phoneStatus === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    <StatusIcon status={phoneStatus} />
                    <span>{phoneMsg}</span>
                  </div>
                )}
                <button type="submit" disabled={phoneStatus === 'loading'} className={submitClass}>
                  {phoneStatus === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <><Phone size={14} /> {t.saveChanges}</>}
                </button>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default AccountSettings;
