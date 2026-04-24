import { ChevronRight, Lock, RefreshCw, Wallet, UserPen, Camera, X, Save, Loader2, Navigation, Banknote } from 'lucide-react';
import React, { useRef, useState } from 'react';

import { useToast } from '../../contexts/ToastContext';
import { Location, CONSTANTS } from '../../types';
import { compressAndResizeImage } from '../../utils/imageUtils';

import type { DriverFlowEventInput } from '../../services/driverFlowTelemetry';

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
  onCreateOfficeLoan?: (locationId: string, amount: number, note: string) => Promise<void>;
  onUpdateLocation?: (locationId: string, updates: Partial<Location>) => Promise<void>;
  onTelemetryEvent?: (
    eventName: DriverFlowEventInput['eventName'],
    options?: Partial<Omit<DriverFlowEventInput, 'driverId' | 'flowId' | 'eventName' | 'onlineStatus'>>,
  ) => void;
}

const MachineCard: React.FC<MachineCardProps> = ({
  item, lang, t, onSelect, onRequestReset, onRequestPayout, onCreateOfficeLoan, onUpdateLocation, onTelemetryEvent,
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
  const [showOfficeLoanForm, setShowOfficeLoanForm] = useState(false);
  const [officeLoanAmount, setOfficeLoanAmount] = useState('');
  const [officeLoanNote, setOfficeLoanNote] = useState('');
  const [isSubmittingOfficeLoan, setIsSubmittingOfficeLoan] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const openSiteInfoForm = () => {
    setSitePhone(loc.shopOwnerPhone ?? '');
    setSiteOwnerName(loc.ownerName ?? '');
    setSitePhotoPreview(null);
    setShowSiteInfoForm(true);
  };

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
      onTelemetryEvent?.('site_info_saved', {
        step: 'site_info',
        locationId: loc.id,
        payload: {
          hasOwnerName: !!updates.ownerName,
          hasOwnerPhone: !!updates.shopOwnerPhone,
          hasOwnerPhoto: !!updates.ownerPhotoUrl,
        },
      });
      setShowSiteInfoForm(false);
      setSitePhotoPreview(null);
    } catch (err) {
      console.error('Failed to save site info', err);
      showToast(
        lang === 'zh' ? '保存失败，请检查网络后重试' : 'Save failed — please check your connection and try again',
        'error',
      );
      onTelemetryEvent?.('site_info_failed', {
        step: 'site_info',
        locationId: loc.id,
        errorCategory: 'save_failed',
      });
    } finally {
      setIsSavingSiteInfo(false);
    }
  };

  const handleSubmitOfficeLoan = async () => {
    if (!onCreateOfficeLoan) return;
    const amount = parseInt(officeLoanAmount, 10) || 0;
    if (amount <= 0) {
      showToast(
        lang === 'zh' ? '请输入有效借款金额' : 'Enter a valid loan amount',
        'warning',
      );
      return;
    }
    setIsSubmittingOfficeLoan(true);
    try {
      await onCreateOfficeLoan(loc.id, amount, officeLoanNote.trim());
      setOfficeLoanAmount('');
      setOfficeLoanNote('');
      setShowOfficeLoanForm(false);
    } catch (err) {
      console.error('Failed to submit office loan', err);
      showToast(
        lang === 'zh' ? '借款提交失败，请稍后重试' : 'Office loan submission failed. Please retry.',
        'error',
      );
    } finally {
      setIsSubmittingOfficeLoan(false);
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
    <div className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-field">
      <button
        onClick={() => onSelect(loc.id)}
        disabled={isLocked}
        aria-label={isLocked ? `Machine ${loc.machineId || ""} is locked` : `Navigate to machine ${loc.machineId || ""}`}
        data-testid={`driver-machine-select-${loc.id}`}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-subcard bg-slate-900 text-white">
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
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-black uppercase leading-tight text-slate-900">
                  <span className="whitespace-nowrap">{loc.machineId || '—'}</span>{' '}
                  <span className="break-words normal-case text-slate-500">{loc.name}</span>
                </p>
                <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {loc.area || '—'} · {t.score} {(loc.lastScore ?? 0).toLocaleString()}
                </p>
                {(loc.ownerName || loc.shopOwnerPhone) && (
                  <p className="mt-1 line-clamp-2 text-caption font-bold leading-4 text-slate-500">
                    {loc.ownerName || (lang === 'zh' ? '商家未填写' : 'Merchant not set')}
                    {loc.shopOwnerPhone ? ` · ${loc.shopOwnerPhone}` : ''}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className={`rounded-full px-2 py-1 text-caption font-black uppercase ${statusTone}`}>
                  {statusLabel}
                </span>
                {!isLocked && (
                  <span className="inline-flex items-center gap-1 rounded-btn bg-slate-900 px-2.5 py-1.5 text-caption font-black uppercase text-white">
                    {lang === 'zh' ? '收款' : 'Collect'}
                    <ChevronRight size={11} className="text-white/80" />
                  </span>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
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
        <div className="grid grid-cols-2 border-t border-slate-100 bg-slate-50 sm:flex">
          {isNear9999 && (
<button
            aria-label={`Reset machine ${loc.machineId || ''}`} onClick={(e) => { e.stopPropagation(); onRequestReset(loc.id);}}
          >
            <RefreshCw size={11} /> {lang === 'zh' ? '重置' : 'Reset'}
          </button>
          )}
          <button
            aria-label={lang === 'zh' ? '提现分红' : 'Payout dividends'} aria-disabled={!hasDividendBalance} onClick={(e) => { e.stopPropagation(); if (hasDividendBalance) onRequestPayout(loc.id);}}
          >
            <Wallet size={11} /> {lang === 'zh' ? '提现' : 'Payout'}
          </button>
          {onCreateOfficeLoan && (
            <button
              type="button"
              aria-label={t.officeLoanAction}
              aria-pressed={showOfficeLoanForm}
              onClick={(e) => {
                e.stopPropagation();
                onTelemetryEvent?.('office_loan_opened', {
                  step: 'office_loan',
                  locationId: loc.id,
                });
                setShowOfficeLoanForm(current => !current);
              }}
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 border-r border-slate-100 px-3 py-2 text-caption font-black uppercase text-amber-700 transition-colors hover:bg-amber-50"
            >
              <Banknote size={11} /> {t.officeLoanAction}
            </button>
          )}
          {loc.coords && (
            <button
              type="button"
              aria-label={t.navigateTo + ' ' + loc.name}
              onClick={(e) => { e.stopPropagation(); window.open(`https://www.google.com/maps/dir/?api=1&destination=${loc.coords!.lat},${loc.coords!.lng}`, '_blank'); }}
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 border-r border-slate-100 px-3 py-2 text-caption font-black uppercase text-amber-600 transition-colors hover:bg-amber-50"
            >
              <Navigation size={11} /> {t.navigateTo}
            </button>
          )}
          {onUpdateLocation && (
            <button
              type="button"
              aria-label={showSiteInfoForm ? '收起站点信息' : '补充站点信息'}
              aria-pressed={showSiteInfoForm}
              onClick={(e) => {
                e.stopPropagation();
                if (showSiteInfoForm) {
                  setShowSiteInfoForm(false);
                  return;
                }
                onTelemetryEvent?.('site_info_opened', {
                  step: 'site_info',
                  locationId: loc.id,
                });
                openSiteInfoForm();
              }}
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 px-3 py-2 text-caption font-black uppercase text-amber-600 transition-colors hover:bg-amber-50"
            >
              <UserPen size={11} /> {lang === 'zh' ? '补充信息' : 'Site Info'}
            </button>
          )}
        </div>
      )}

      {showOfficeLoanForm && onCreateOfficeLoan && (
        <div className="border-t border-slate-100 bg-amber-50 px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-caption font-black uppercase text-amber-700">
              {t.officeLoanLabel}
            </p>
            <button
              type="button"
              onClick={() => setShowOfficeLoanForm(false)}
              className="text-amber-500 hover:text-amber-700"
            >
              <X size={14} />
            </button>
          </div>
          <input
            type="number"
            min={0}
            value={officeLoanAmount}
            onChange={(event) => setOfficeLoanAmount(event.target.value.replace(/[^0-9]/g, ''))}
            placeholder={t.officeLoanAmountLabel}
            className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-800 placeholder:text-slate-300 outline-none focus:border-amber-400"
          />
          <textarea
            value={officeLoanNote}
            onChange={(event) => setOfficeLoanNote(event.target.value)}
            rows={2}
            maxLength={120}
            placeholder={t.officeLoanNoteLabel}
            className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-800 placeholder:text-slate-300 outline-none focus:border-amber-400"
          />
          <button
            type="button"
            disabled={isSubmittingOfficeLoan}
            aria-label={t.submit_loan} onClick={handleSubmitOfficeLoan}
            className="flex w-full items-center justify-center gap-2 rounded-btn bg-amber-600 px-3 py-2 text-caption font-black uppercase text-white disabled:opacity-50"
          >
            {isSubmittingOfficeLoan ? <Loader2 size={12} className="animate-spin" /> : <Banknote size={12} />}
            {t.officeLoanSubmit}
          </button>
        </div>
      )}

      {showSiteInfoForm && onUpdateLocation && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-caption font-black uppercase text-slate-500">
              {lang === 'zh' ? '补充店主信息' : 'Update Site Info'}
            </p>
            <button onClick={() => setShowSiteInfoForm(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600">
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
            aria-label={lang === 'zh' ? '保存站点信息' : 'Save site info'} aria-disabled={isSavingSiteInfo} onClick={handleSaveSiteInfo}
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
