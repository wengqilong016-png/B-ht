import { ChevronRight, Lock, RefreshCw, Wallet, UserPen, Camera, X, Save, Loader2, Navigation } from 'lucide-react';
import React, { useRef, useState } from 'react';

import { Location, CONSTANTS } from '../../types';
import { compressAndResizeImage } from '../../utils/imageUtils';
import { useToast } from '../../contexts/ToastContext';

export interface MachineCardMeta {
  loc: Location;
  distanceMeters: number | null;
  daysSinceActive: number | null;
  isUrgent: boolean;
  isNearby: boolean;
  isPending: boolean;
  isLocked: boolean;
}

interface MachineCardProps {
  item: MachineCardMeta;
  lang: 'zh' | 'sw';
  t: Record<string, string>;
  onSelect: (locId: string) => void;
  onRequestReset: (locId: string) => void;
  onRequestPayout: (locId: string) => void;
  onUpdateLocation?: (locationId: string, updates: Partial<Location>) => Promise<void>;
}

const MachineCard: React.FC<MachineCardProps> = ({
  item, lang, t, onSelect, onRequestReset, onRequestPayout, onUpdateLocation,
}) => {
  const { loc, distanceMeters, daysSinceActive, isLocked, isUrgent, isPending } = item;
  const isNear9999 = (loc.lastScore ?? 0) >= 9000;
  const hasDividendBalance = (loc.dividendBalance ?? 0) > 0;
  const { showToast } = useToast();

  const [showSiteInfoForm, setShowSiteInfoForm] = useState(false);
  const [sitePhone, setSitePhone] = useState(loc.shopOwnerPhone ?? '');
  const [siteOwnerName, setSiteOwnerName] = useState(loc.ownerName ?? '');
  const [sitePhotoPreview, setSitePhotoPreview] = useState<string | null>(null);
  const [isSavingSiteInfo, setIsSavingSiteInfo] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const blob = await compressAndResizeImage(file);
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => setSitePhotoPreview(reader.result as string);
    } catch (err) {
      console.error('Photo compression failed', err);
    }
  };

  const handleSaveSiteInfo = async () => {
    if (!onUpdateLocation) return;
    setIsSavingSiteInfo(true);
    try {
      const updates: Partial<Location> = {};
      if (sitePhone.trim()) updates.shopOwnerPhone = sitePhone.trim();
      if (siteOwnerName.trim()) updates.ownerName = siteOwnerName.trim();
      if (sitePhotoPreview) updates.ownerPhotoUrl = sitePhotoPreview;
      await onUpdateLocation(loc.id, updates);
      setShowSiteInfoForm(false);
      setSitePhotoPreview(null);
    } catch (err) {
      console.error('Failed to save site info', err);
      showToast(
        lang === 'zh' ? '保存失败，请检查网络后重试' : 'Save failed — please check your connection and try again',
        'error',
      );
    } finally {
      setIsSavingSiteInfo(false);
    }
  };
  const statusTone =
    isLocked
      ? 'bg-rose-100 text-rose-700'
      : loc.status === 'active'
        ? 'bg-emerald-100 text-emerald-700'
        : loc.status === 'maintenance'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-slate-200 text-slate-600';
  const statusLabel =
    isLocked
      ? t.resetLocked
      : loc.status === 'active'
        ? 'active'
        : loc.status === 'maintenance'
          ? 'maintenance'
          : loc.status;

  return (
    <div className="bg-white rounded-card border border-slate-200 overflow-hidden shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
      <button
        onClick={() => { if (!isLocked) onSelect(loc.id); }}
        disabled={isLocked}
        data-testid={`driver-machine-select-${loc.id}`}
        className={`w-full text-left transition-colors ${isLocked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-50 active:bg-slate-100'}`}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-slate-900 text-white flex flex-col items-center justify-center">
            {isLocked ? (
              <Lock size={14} className="text-white" />
            ) : (
              <>
                <span className="text-[11px] font-black leading-none">{loc.machineId || '—'}</span>
                <span
                  className={`mt-1 h-1.5 w-1.5 rounded-full ${
                    loc.status === 'active'
                      ? 'bg-emerald-400'
                      : loc.status === 'maintenance'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                  }`}
                />
              </>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-black text-slate-900 uppercase leading-tight">
                  {loc.machineId || '—'} <span className="text-slate-500 normal-case">{loc.name}</span>
                </p>
                <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {loc.area || '—'} · {t.score} {(loc.lastScore ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`rounded-full px-2 py-1 text-caption font-black uppercase ${statusTone}`}>
                  {statusLabel}
                </span>
                {!isLocked && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-caption font-black uppercase text-white">
                    {lang === 'zh' ? '收款' : 'Collect'}
                    <ChevronRight size={11} className="text-white/80" />
                  </span>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className={`rounded-full px-2 py-1 text-caption font-black uppercase ${isPending ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {isPending ? t.pendingToday : t.visitedToday}
              </span>
              <span className={`rounded-full px-2 py-1 text-caption font-black uppercase ${isNear9999 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                9999 {isNear9999 ? t.nearThreshold : t.normalThreshold}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-caption font-black uppercase text-slate-500">
                {(loc.commissionRate * 100).toFixed(0)}%
              </span>
              <span className="rounded-full bg-amber-50 px-2 py-1 text-caption font-black uppercase text-amber-700">
                {t.dividendShort} {(loc.dividendBalance || 0).toLocaleString()}
              </span>
              {distanceMeters !== null ? (
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-caption font-black uppercase text-emerald-700">
                  {Math.round(distanceMeters)}m
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-caption font-black uppercase text-slate-500">
                  {t.distanceWaiting}
                </span>
              )}
              {isUrgent && daysSinceActive !== null && daysSinceActive >= CONSTANTS.STAGNANT_DAYS_THRESHOLD && (
                <span className="rounded-full bg-amber-50 px-2 py-1 text-caption font-black uppercase text-amber-700">
                  {t.staleMachine} {daysSinceActive}d
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      {!isLocked && (
        <div className="flex border-t border-slate-100 bg-slate-50">
          {isNear9999 && (
            <button
              onClick={(e) => { e.stopPropagation(); onRequestReset(loc.id); }}
              className="flex-1 px-3 py-2 min-h-11 text-caption font-black uppercase text-rose-600 hover:bg-rose-50 transition-colors flex items-center justify-center gap-1.5 border-r border-slate-100"
            >
              <RefreshCw size={11} /> {lang === 'zh' ? '重置' : 'Reset'}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (hasDividendBalance) onRequestPayout(loc.id);
            }}
            disabled={!hasDividendBalance}
            className="flex-1 px-3 py-2 min-h-11 text-caption font-black uppercase text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1.5 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            <Wallet size={11} /> {lang === 'zh' ? '提现' : 'Payout'}
          </button>
          {loc.coords && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${loc.coords!.lat},${loc.coords!.lng}`, '_blank');
              }}
              className="flex-1 px-3 py-2 min-h-11 text-caption font-black uppercase text-amber-600 hover:bg-amber-50 transition-colors flex items-center justify-center gap-1.5 border-l border-slate-100"
            >
              <Navigation size={11} /> {t.navigateTo}
            </button>
          )}
          {onUpdateLocation && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowSiteInfoForm(v => !v); }}
              className="flex-1 px-3 py-2 min-h-11 text-caption font-black uppercase text-amber-600 hover:bg-amber-50 transition-colors flex items-center justify-center gap-1.5 border-l border-slate-100"
            >
              <UserPen size={11} /> {lang === 'zh' ? '补充信息' : 'Site Info'}
            </button>
          )}
        </div>
      )}

      {showSiteInfoForm && onUpdateLocation && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-caption font-black uppercase text-slate-500">
              {lang === 'zh' ? '补充店主信息' : 'Update Site Info'}
            </p>
            <button onClick={() => setShowSiteInfoForm(false)} className="text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          </div>

          <input
            type="text"
            value={siteOwnerName}
            onChange={e => setSiteOwnerName(e.target.value)}
            placeholder={lang === 'zh' ? '店主姓名' : 'Owner name'}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-800 placeholder-slate-300 outline-none focus:border-amber-400"
          />

          <input
            type="tel"
            value={sitePhone}
            onChange={e => setSitePhone(e.target.value)}
            placeholder={lang === 'zh' ? '店主电话' : 'Owner phone'}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-800 placeholder-slate-300 outline-none focus:border-amber-400"
          />

          <div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoCapture}
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className={`w-full rounded-xl border-2 border-dashed py-3 flex items-center justify-center gap-2 text-caption font-black uppercase transition-colors ${sitePhotoPreview ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-400 hover:border-amber-300 hover:text-amber-500'}`}
            >
              {sitePhotoPreview ? (
                <>
                  <img src={sitePhotoPreview} alt="" className="h-8 w-8 rounded-lg object-cover" />
                  {lang === 'zh' ? '重新拍照' : 'Retake Photo'}
                </>
              ) : (
                <>
                  <Camera size={13} />
                  {lang === 'zh' ? '拍摄店主照片' : 'Capture Owner Photo'}
                </>
              )}
            </button>
          </div>

          <button
            onClick={handleSaveSiteInfo}
            disabled={isSavingSiteInfo}
            className="w-full rounded-xl bg-amber-600 py-2.5 text-[11px] font-black uppercase text-white flex items-center justify-center gap-1.5 hover:bg-amber-700 disabled:opacity-60 transition-colors"
          >
            {isSavingSiteInfo ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {lang === 'zh' ? '保存' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
};

export default MachineCard;
