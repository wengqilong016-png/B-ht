
import React, { useState } from 'react';
import { X, Lock, Mail, Phone, CheckCircle, AlertCircle, Loader2, KeyRound } from 'lucide-react';
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
    setEmailStatus('loading');
    const result = await updateUserEmail(newEmail.trim());
    if (result.success) {
      setEmailStatus('ok');
      setEmailMsg(t.updateSuccess);
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

  const inputClass = "w-full bg-slate-900/50 border border-white/10 rounded-xl py-3 px-4 text-sm font-bold text-white focus:border-amber-500/50 outline-none transition-all placeholder:text-slate-500";
  const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-1.5";
  const sectionClass = "bg-white/5 rounded-2xl p-5 space-y-3";
  const submitClass = "w-full bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 font-black py-3 rounded-xl text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-800 rounded-[28px] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-black text-white">{currentUser.name}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase">{t.accountSettings}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

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
              {emailStatus !== 'idle' && (
                <div className={`flex items-center gap-2 text-xs font-bold ${emailStatus === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  <StatusIcon status={emailStatus} />
                  <span>{emailMsg}</span>
                </div>
              )}
              <button type="submit" disabled={emailStatus === 'loading'} className={submitClass}>
                {emailStatus === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <><Mail size={14} /> {t.saveChanges}</>}
              </button>
            </form>
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
