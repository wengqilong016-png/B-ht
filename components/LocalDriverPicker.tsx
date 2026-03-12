import React, { useState } from 'react';
import { User as UserIcon, ArrowRight, Crown, RefreshCw } from 'lucide-react';
import { User, TRANSLATIONS } from '../types';
import { setLocalDriverId, buildLocalUser } from '../utils/authMode';

interface LocalDriverPickerProps {
  /** Called once the user has confirmed a driver id. */
  onConfirm: (user: User) => void;
  lang: 'zh' | 'sw';
}

/**
 * LocalDriverPicker — shown when VITE_DISABLE_AUTH=true and no local driver id
 * is stored yet.  Driver enters their ID (e.g. "D-SUDI"), which is persisted
 * to localStorage and used as the local User identity.
 */
const LocalDriverPicker: React.FC<LocalDriverPickerProps> = ({ onConfirm, lang }) => {
  const [driverId, setDriverId] = useState('');
  const [error, setError] = useState('');
  const t = TRANSLATIONS[lang];

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = driverId.trim().toUpperCase();
    if (!trimmed) {
      setError(t.localPickerEmptyError);
      return;
    }
    setLocalDriverId(trimmed);
    onConfirm(buildLocalUser(trimmed));
  };

  return (
    <div className="min-h-screen bg-[#f5f7fa] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Mode badge */}
      <div className="absolute top-6 right-6 z-30">
        <span className="px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 shadow-silicone border border-white/60">
          {t.localPickerMode}
        </span>
      </div>

      <div className="w-full max-w-sm relative z-10 flex flex-col items-center">
        {/* Logo */}
        <div className="mb-8 relative">
          <div className="relative w-28 h-28 bg-silicone-gradient rounded-[35px] border border-white/80 flex items-center justify-center shadow-silicone">
            <span className="text-6xl drop-shadow-lg">🦁</span>
            <div className="absolute -top-3 -right-3 bg-amber-500 text-white p-2.5 rounded-2xl border-4 border-white shadow-silicone">
              <Crown size={20} fill="currentColor" />
            </div>
          </div>
        </div>

        <div className="text-center mb-10 space-y-2">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight uppercase">
            BAHATI <span className="text-indigo-600">JACKPOTS</span>
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">
            {t.localPickerTitle}
          </p>
        </div>

        <div className="bg-[#f5f7fa] p-10 rounded-[40px] shadow-silicone border border-white/60 w-full space-y-8">
          <form onSubmit={handleConfirm} className="space-y-6">
            <div className="space-y-3">
              <label
                htmlFor="driver-id-input"
                className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1"
              >
                <UserIcon size={12} className="text-indigo-500" />
                {t.localPickerLabel}
              </label>
              <input
                id="driver-id-input"
                type="text"
                autoComplete="off"
                value={driverId}
                onChange={e => { setDriverId(e.target.value); setError(''); }}
                className="w-full bg-[#f0f2f5] border-none rounded-2xl py-4 px-5 font-bold text-slate-700 shadow-silicone-pressed outline-none transition-all placeholder:text-slate-400 uppercase"
                placeholder={t.localPickerPlaceholder}
              />
            </div>

            {error && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-bold">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-silicone-gradient text-indigo-600 font-black py-4 rounded-2xl shadow-silicone hover:shadow-silicone-sm active:shadow-silicone-pressed border border-white/80 flex items-center justify-center gap-2 transition-all"
            >
              <span className="flex items-center gap-2">
                {t.localPickerConfirm} <ArrowRight size={20} />
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LocalDriverPicker;

/**
 * SwitchDriverButton — a small UI element rendered inside the driver shell
 * that lets the current driver clear their cached identity and re-pick.
 */
export const SwitchDriverButton: React.FC<{
  lang: 'zh' | 'sw';
  onSwitch: () => void;
}> = ({ lang, onSwitch }) => {
  const t = TRANSLATIONS[lang];
  return (
    <button
      onClick={onSwitch}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 border border-amber-100 shadow-silicone-sm hover:bg-amber-100 transition-all"
      title={t.localPickerSwitch}
    >
      <RefreshCw size={10} />
      {t.localPickerSwitch}
    </button>
  );
};
