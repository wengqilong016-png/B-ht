import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Banknote,
  Camera,
  CheckCircle,
  Clock,
  Coins,
  Loader2,
  MapPin,
  Percent,
  Phone,
  TrendingUp,
  Truck,
  User,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { useAuth } from '../../contexts/AuthContext';
import { useAppData } from '../../contexts/DataContext';
import { useFormStatus } from '../../hooks/useFormStatus';
import { updateDriverProfile } from '../../repositories/driverRepository';
import { persistEvidencePhotoUrl } from '../../services/evidenceStorage';
import { TRANSLATIONS, resizeImage } from '../../types';

import type { Driver } from '../../types';

interface DriverStatusPanelProps {}

const DriverStatusPanel: React.FC<DriverStatusPanelProps> = () => {
  const { lang, activeDriverId } = useAuth();
  const { drivers, locations, filteredTransactions: transactions, isOnline } = useAppData();
  const queryClient = useQueryClient();
  const driver = drivers.find((item) => item.id === activeDriverId);
  const t = TRANSLATIONS[lang];
  const assignedMachines = locations.filter((location) => location.assignedDriverId === activeDriverId);
  const profileForm = useFormStatus();
  const [phoneDraft, setPhoneDraft] = useState('');
  const [backgroundPhotoDraft, setBackgroundPhotoDraft] = useState<string | null>(null);

  useEffect(() => {
    setPhoneDraft(driver?.phone ?? '');
    setBackgroundPhotoDraft(driver?.backgroundPhotoUrl ?? null);
    profileForm.reset();
    // profileForm.reset() is intentionally excluded — it only needs to run when
    // driver data changes, and including profileForm in deps risks loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.backgroundPhotoUrl, driver?.phone]);

  if (!driver) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <User size={40} className="mb-4 opacity-30" />
        <p className="text-xs font-black uppercase tracking-widest">
          {t.driverProfileNotFound}
        </p>
      </div>
    );
  }

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const resized = await resizeImage(file, 1280, 0.7);
      setBackgroundPhotoDraft(resized);
      profileForm.reset();
    } catch (error) {
      profileForm.setError(error instanceof Error ? error.message : t.updateError);
    } finally {
      event.target.value = '';
    }
  };

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isOnline) {
      profileForm.setError(t.offlineWarning);
      return;
    }

    if (!phoneDraft.trim()) {
      profileForm.setError(t.driverPhoneRequired);
      return;
    }

    profileForm.setLoading();

    try {
      const backgroundPhotoUrl = await persistEvidencePhotoUrl(backgroundPhotoDraft, {
        category: 'driver-profile',
        entityId: 'background-photo',
        driverId: driver.id,
      });

      const updates: Pick<Partial<Driver>, 'phone' | 'backgroundPhotoUrl'> = {
        phone: phoneDraft.trim(),
        backgroundPhotoUrl: backgroundPhotoUrl ?? driver.backgroundPhotoUrl,
      };

      await updateDriverProfile(driver.id, updates);

      const nextDriver: Driver = {
        ...driver,
        ...updates,
      };

      queryClient.setQueryData<Driver[]>(['drivers'], (old = drivers) =>
        old.map((item) => (item.id === driver.id ? nextDriver : item)),
      );
      void queryClient.invalidateQueries({ queryKey: ['drivers'] });

      setBackgroundPhotoDraft(nextDriver.backgroundPhotoUrl ?? null);
      profileForm.setSuccess(t.updateSuccess);
    } catch (error) {
      profileForm.setError(error instanceof Error ? error.message : t.updateError);
    }
  };

  const recentTx = transactions
    .filter((tx) => tx.driverId === driver.id)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  const totalRevenue = transactions
    .filter((tx) => tx.driverId === driver.id)
    .reduce((sum, tx) => sum + tx.revenue, 0);

  const debtPct = driver.initialDebt > 0
    ? Math.round(((driver.initialDebt - (driver.remainingDebt ?? 0)) / driver.initialDebt) * 100)
    : 100;

  const lastActiveDisplay = driver.lastActive
    ? new Date(driver.lastActive).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : t.neverActive;

  const isActive = driver.status === 'active';
  const cardBackgroundStyle = driver.backgroundPhotoUrl
    ? { backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.58), rgba(15, 23, 42, 0.58)), url(${driver.backgroundPhotoUrl})` }
    : undefined;

  return (
    <div className="space-y-4 animate-in fade-in">
      <div className="bg-white rounded-card border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-cover bg-center p-5 flex items-center gap-4" style={cardBackgroundStyle}>
          <div className="w-16 h-16 rounded-subcard bg-slate-800 text-white flex items-center justify-center font-black text-2xl shadow-md flex-shrink-0">
            {driver.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className={`font-black text-base uppercase tracking-wide truncate ${driver.backgroundPhotoUrl ? 'text-white' : 'text-slate-900'}`}>{driver.name}</h2>
            <p className={`text-caption font-bold uppercase truncate ${driver.backgroundPhotoUrl ? 'text-slate-200' : 'text-slate-400'}`}>{driver.username}</p>
            {driver.phone && (
              <p className={`text-caption font-bold mt-0.5 ${driver.backgroundPhotoUrl ? 'text-slate-100' : 'text-slate-400'}`}>{driver.phone}</p>
            )}
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-black uppercase flex-shrink-0 ${
            isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-500 border border-rose-100'
          }`}>
            {isActive ? <CheckCircle size={12} /> : <XCircle size={12} />}
            {isActive ? t.driverStatusActive : t.driverStatusInactive}
          </div>
        </div>
        <div className="border-t border-slate-50 px-5 py-3 flex items-center gap-2 text-slate-400">
          <Clock size={12} />
          <span className="text-caption font-bold uppercase">{t.lastActive}: {lastActiveDisplay}</span>
        </div>
      </div>

      <div className="bg-white rounded-card border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Phone size={12} className="text-emerald-500" />
          <p className="text-caption font-black text-slate-400 uppercase tracking-widest">{t.driverProfileDetails}</p>
        </div>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-caption font-black uppercase tracking-widest text-slate-500">
              <Phone size={10} className="text-emerald-500" />
              {t.currentPhoneLabel}
            </label>
            <input
              type="tel"
              value={phoneDraft}
              onChange={(event) => {
                setPhoneDraft(event.target.value);
                profileForm.reset();
              }}
              placeholder="+255 6xx xxx xxxx"
              disabled={!isOnline}
              className="w-full rounded-btn border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition placeholder:text-slate-400 disabled:opacity-60 focus:border-emerald-300"
            />
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-caption font-black uppercase tracking-widest text-slate-500">
              <Camera size={10} className="text-amber-500" />
              {t.driverBackgroundPhoto}
            </label>
            <div className="overflow-hidden rounded-subcard border border-slate-200 bg-slate-50">
              {backgroundPhotoDraft ? (
                <img src={backgroundPhotoDraft} alt={t.driverBackgroundPhoto} className="h-40 w-full object-cover" />
              ) : (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
                  <Camera size={20} />
                  <p className="text-caption font-bold">{t.driverBackgroundPhotoPlaceholder}</p>
                </div>
              )}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-btn border border-amber-200 bg-amber-50 px-4 py-2 text-caption font-black uppercase text-amber-700 transition hover:bg-amber-100">
              <Camera size={12} />
              {backgroundPhotoDraft ? t.replaceBackgroundPhoto : t.uploadBackgroundPhoto}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={!isOnline} />
            </label>
            <p className="text-caption font-bold text-slate-400">{t.driverProfileDetailsNote}</p>
          </div>

          {!profileForm.isIdle && (
            <div className={`flex items-center gap-2 text-xs font-bold ${profileForm.isSuccess ? 'text-emerald-500' : 'text-rose-500'}`}>
              {profileForm.isLoading ? <Loader2 size={14} className="animate-spin" /> : profileForm.isSuccess ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              <span>{profileForm.message}</span>
            </div>
          )}

          <button
            aria-label={t.saveDriverProfile}
            type="submit"
            disabled={profileForm.isLoading || !isOnline}
            className="inline-flex items-center justify-center gap-2 rounded-btn bg-emerald-600 px-4 py-2 text-caption font-black uppercase text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {profileForm.isLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {t.saveDriverProfile}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-card border border-slate-200 shadow-sm p-4">
          <p className="text-caption font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
            <Banknote size={11} /> {t.baseSalary}
          </p>
          <p className="text-base font-black text-slate-900">
            TZS {(driver.baseSalary ?? 300000).toLocaleString()}
          </p>
        </div>
        <div className="bg-amber-50 rounded-card border border-amber-100 shadow-sm p-4">
          <p className="text-caption font-black text-amber-400 uppercase tracking-widest mb-2 flex items-center gap-1">
            <Percent size={11} /> {t.commissionRate}
          </p>
          <p className="text-base font-black text-amber-700">
            {((driver.commissionRate ?? 0.05) * 100).toFixed(0)}%
          </p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-white rounded-card border border-amber-200 shadow-sm p-4">
          <p className="text-caption font-black text-amber-600 uppercase tracking-widest mb-2 flex items-center gap-1">
            <Coins size={11} /> {lang === 'zh' ? '流动硬币' : 'Floating Coins'}
          </p>
          <p className="text-base font-black text-amber-700">
            TZS {(driver.dailyFloatingCoins ?? 0).toLocaleString()}
          </p>
        </div>
      </div>

      {driver.initialDebt > 0 && (
        <div className="bg-white rounded-card border border-slate-200 shadow-sm p-5">
          <p className="text-caption font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <AlertCircle size={12} /> {t.debtStatus}
          </p>
          <div className="flex justify-between items-center mb-2">
            <span className="text-caption font-bold text-slate-500 uppercase">{t.remainingDebt}</span>
            <span className="text-sm font-black text-rose-600">TZS {(driver.remainingDebt ?? 0).toLocaleString()}</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-amber-500 rounded-full transition-all"
              style={{ width: `${debtPct}%` }}
            />
          </div>
          <div className="flex justify-between text-caption font-bold text-slate-400 uppercase">
            <span>{t.progress}: {debtPct}%</span>
            <span>{t.initialDebt}: TZS {(driver.initialDebt ?? 0).toLocaleString()}</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-card border border-slate-200 shadow-sm p-5">
        <p className="text-caption font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <TrendingUp size={12} /> {t.totalRevenue}
        </p>
        <p className="text-xl font-black text-slate-900">TZS {totalRevenue.toLocaleString()}</p>
        <p className="text-caption font-bold text-slate-400 uppercase mt-1">
          {recentTx.length} {t.recentCollections}
        </p>
      </div>

      <div className="bg-white rounded-card border border-slate-200 shadow-sm p-5">
        <p className="text-caption font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <MapPin size={12} /> {t.assignedMachines} ({assignedMachines.length})
        </p>
        {assignedMachines.length > 0 ? (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {assignedMachines.map((location) => (
              <div key={location.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-subcard border border-slate-100">
                <div className="w-8 h-8 rounded-btn bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <MapPin size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-slate-800 truncate">{location.name || location.machineId}</p>
                  <p className="text-caption font-bold text-slate-400 truncate">{location.area || '—'}</p>
                </div>
                <span className={`text-caption font-black uppercase px-2 py-0.5 rounded-tag ${
                  location.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                }`}>
                  {location.status === 'active' ? '✓' : '—'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs font-bold text-slate-400">{t.noAssignedMachines}</p>
        )}
      </div>

      <div className="bg-white rounded-card border border-slate-200 shadow-sm p-5">
        <p className="text-caption font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Truck size={12} /> {t.vehicleInfo}
        </p>
        {driver.vehicleInfo?.model || driver.vehicleInfo?.plate ? (
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <Truck size={16} className="text-slate-500" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-800">{driver.vehicleInfo.model || '—'}</p>
              <p className="text-caption font-bold text-slate-400 uppercase">{driver.vehicleInfo.plate || '—'}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs font-bold text-slate-400">{t.noVehicleInfo}</p>
        )}
      </div>
    </div>
  );
};

export default DriverStatusPanel;
