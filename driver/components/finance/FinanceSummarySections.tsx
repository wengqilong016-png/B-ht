import { ArrowRight, Banknote, ChevronRight, Coins, HandCoins, ShieldAlert, Trophy } from 'lucide-react';
import React from 'react';

import type { FinanceCalculationSource } from '../../../services/financeCalculator';
import type { Location } from '../../../types';

export interface FinanceSummaryCalculations {
  diff: number;
  revenue: number;
  commission: number;
  finalRetention: number;
  startupDebtDeduction: number;
  netPayable: number;
  remainingCoins: number;
  isCoinStockNegative: boolean;
}

interface SharedFinanceSectionProps {
  lang: 'zh' | 'sw';
  t: Record<string, string>;
  calculations: FinanceSummaryCalculations;
}

export function RevenueSummary({
  selectedLocation,
  currentScore,
  previewSource,
  ...shared
}: SharedFinanceSectionProps & {
  selectedLocation: Location;
  currentScore: string;
  previewSource?: FinanceCalculationSource;
}) {
  const { t, calculations } = shared;

  return (
    <div className={`px-3 py-2.5 rounded-2xl text-white flex justify-between items-center ${calculations.revenue > 50000 ? 'bg-amber-600' : 'bg-slate-800'}`}>
      <div>
        <p className="text-caption font-black uppercase opacity-60">{t.formula}</p>
        <p className="text-caption font-bold opacity-50">({currentScore} - {selectedLocation?.lastScore}) x 200</p>
        {previewSource && (
          <span
            className={`inline-block mt-1 px-1.5 py-0.5 rounded text-caption font-black uppercase tracking-wide ${previewSource === 'server' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50'}`}
            title={previewSource === 'server' ? 'Preview calculated by server' : 'Preview calculated locally'}
          >
            {previewSource === 'server' ? 'server' : 'local'}
          </span>
        )}
      </div>
      <div className="text-right">
        {calculations.revenue > 50000 && (
          <div className="flex items-center gap-1 justify-end mb-1">
            <Trophy size={10} className="text-yellow-300" />
            <span className="text-caption font-black text-yellow-300 uppercase">High Value</span>
          </div>
        )}
        <p className="text-2xl font-black">TZS {calculations.revenue.toLocaleString()}</p>
        <p className="text-caption opacity-60 uppercase">{t.revenue}</p>
      </div>
    </div>
  );
}

export function FinanceMetricGrid({
  isOwnerRetaining,
  ...shared
}: SharedFinanceSectionProps & {
  isOwnerRetaining: boolean;
}) {
  const { lang, t, calculations } = shared;

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
        <p className="text-caption font-black uppercase tracking-wide text-slate-400">
          {isOwnerRetaining
            ? (lang === 'zh' ? '计入余额' : 'Added to Balance')
            : (lang === 'zh' ? '支付分红' : 'Owner Payout')}
        </p>
        <p className="mt-1 text-sm font-black text-slate-900">TZS {calculations.finalRetention.toLocaleString()}</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
        <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.expenses}</p>
        <p className="mt-1 text-sm font-black text-slate-900">TZS 0</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
        <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.net}</p>
        <p className="mt-1 text-sm font-black text-slate-900">TZS {calculations.netPayable.toLocaleString()}</p>
      </div>
    </div>
  );
}

export function OwnerRetentionSection({
  currentDividendBalance,
  displayedOwnerAmount,
  isOwnerRetaining,
  nextDividendBalance,
  onUpdateIsOwnerRetaining,
  onUpdateOwnerRetention,
  ...shared
}: SharedFinanceSectionProps & {
  currentDividendBalance: number;
  displayedOwnerAmount: string;
  isOwnerRetaining: boolean;
  nextDividendBalance: number;
  onUpdateIsOwnerRetaining: (val: boolean) => void;
  onUpdateOwnerRetention: (val: string) => void;
}) {
  const { lang, calculations } = shared;
  const withdrawableReference = Math.floor(nextDividendBalance / 200) * 200;

  return (
    <div className={`p-3 rounded-2xl border transition-all ${isOwnerRetaining ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
      <div className="flex justify-between items-center mb-3">
        <label className={`text-caption font-black flex items-center gap-2 ${isOwnerRetaining ? 'text-amber-600' : 'text-emerald-600'}`}>
          <HandCoins size={13} /> {isOwnerRetaining
            ? (lang === 'zh' ? '站点分红留存' : 'Site Dividend Retention')
            : (lang === 'zh' ? '本次支付分红' : 'Owner Dividend Payout')}
        </label>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-caption font-black ${isOwnerRetaining ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {isOwnerRetaining
              ? (lang === 'zh' ? '留存' : 'Retained')
              : (lang === 'zh' ? '直接支付' : 'Direct Pay')}
          </span>
          <button
            type="button"
            onClick={() => onUpdateIsOwnerRetaining(!isOwnerRetaining)}
            className={`relative h-5 w-9 rounded-full transition-colors ${isOwnerRetaining ? 'bg-amber-500' : 'bg-emerald-500'}`}
          >
            <div className={`absolute left-1 top-1 h-3 w-3 rounded-full bg-white transition-transform ${isOwnerRetaining ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline gap-1">
          <span className={`text-xs font-black ${isOwnerRetaining ? 'text-amber-300' : 'text-emerald-300'}`}>TZS</span>
          <input
            type="number"
            step="0.01"
            value={displayedOwnerAmount}
            onChange={e => onUpdateOwnerRetention(e.target.value)}
            className={`w-full text-2xl font-black bg-transparent outline-none placeholder:opacity-40 ${isOwnerRetaining ? 'text-amber-900 placeholder:text-amber-200' : 'text-emerald-900 placeholder:text-emerald-200'}`}
            placeholder={String(calculations.commission)}
          />
        </div>
        <p className={`text-caption font-black uppercase ${isOwnerRetaining ? 'text-amber-500' : 'text-emerald-500'}`}>
          {isOwnerRetaining
            ? (lang === 'zh'
                ? `理论分红 TZS ${calculations.commission.toLocaleString()}，本次计入余额，可直接修改`
                : `Theoretical dividend TZS ${calculations.commission.toLocaleString()}, editable`)
            : (lang === 'zh'
                ? `理论分红 TZS ${calculations.commission.toLocaleString()}，本次直接支付给商家`
                : `Theoretical dividend TZS ${calculations.commission.toLocaleString()}, paid to owner this run`)}
        </p>
        <p className={`text-caption font-bold leading-relaxed ${isOwnerRetaining ? 'text-amber-700' : 'text-emerald-700'}`}>
          {isOwnerRetaining
            ? (lang === 'zh'
                ? '本次分红会累加到站点分红余额，之后由管理员审核提现。'
                : 'This dividend is added to the site dividend balance and can be withdrawn later after admin approval.')
            : (lang === 'zh'
                ? '本次分红视为已现场支付给商家，不进入站点余额。'
                : 'This dividend is treated as paid to the owner on site and does not enter the site balance.')}
        </p>
        {isOwnerRetaining ? (
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-amber-200 bg-white/70 px-3 py-2">
            <div>
              <p className="text-caption font-black text-slate-400">{lang === 'zh' ? '当前余额' : 'Current Balance'}</p>
              <p className="mt-1 text-[11px] font-black text-slate-900">
                TZS {currentDividendBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-caption font-black text-slate-400">{lang === 'zh' ? '本次计入' : 'Added This Run'}</p>
              <p className="mt-1 text-[11px] font-black text-amber-700">
                TZS {calculations.finalRetention.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-caption font-black text-slate-400">{lang === 'zh' ? '提交后余额' : 'Balance After Submit'}</p>
              <p className="mt-1 text-[11px] font-black text-amber-700">
                TZS {nextDividendBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-caption font-black text-slate-400">{lang === 'zh' ? '可提取参考' : 'Withdrawable Reference'}</p>
              <p className="mt-1 text-[11px] font-black text-amber-700">
                TZS {withdrawableReference.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-0.5 text-caption font-bold text-amber-500">
                {lang === 'zh' ? '按 200 整数' : 'Rounded by 200'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-emerald-200 bg-white/70 px-3 py-2">
            <div>
              <p className="text-caption font-black text-slate-400">{lang === 'zh' ? '理论分红' : 'Theoretical'}</p>
              <p className="mt-1 text-[11px] font-black text-slate-900">
                TZS {calculations.commission.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-caption font-black text-slate-400">{lang === 'zh' ? '本次支付' : 'Paid This Run'}</p>
              <p className="mt-1 text-[11px] font-black text-emerald-700">
                TZS {calculations.finalRetention.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-caption font-black text-slate-400">{lang === 'zh' ? '不计入余额' : 'Not Added'}</p>
              <p className="mt-1 text-[11px] font-black text-emerald-700">TZS 0</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TipPaymentSection({
  tip,
  onUpdateTip,
  ...shared
}: SharedFinanceSectionProps & {
  tip: string;
  onUpdateTip: (val: string) => void;
}) {
  const { lang } = shared;

  return (
    <div className="rounded-2xl border border-sky-100 bg-sky-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-caption font-black text-sky-600">
          <Banknote size={13} /> {lang === 'zh' ? '支付小费' : 'Tip Payment'}
        </label>
        <span className="rounded-full bg-white px-2 py-0.5 text-caption font-black text-sky-500">
          {lang === 'zh' ? '支付入口' : 'Payment'}
        </span>
      </div>
      <p className="mb-2 text-caption font-bold text-sky-700">
        {lang === 'zh' ? '本次给员工/现场人员的小费' : 'Tip paid to staff or on-site personnel this run'}
      </p>
      <div className="flex items-baseline gap-1 border-b border-sky-200 px-1">
        <span className="text-xs font-black text-sky-300">TZS</span>
        <input
          type="number"
          min="0"
          value={tip}
          onChange={e => onUpdateTip(e.target.value)}
          className="w-full bg-transparent text-2xl font-black text-sky-900 outline-none placeholder:text-sky-200"
          placeholder="0"
        />
      </div>
    </div>
  );
}

export function CoinExchangeSection({
  coinExchange,
  onUpdateCoinExchange,
  ...shared
}: SharedFinanceSectionProps & {
  coinExchange: string;
  onUpdateCoinExchange: (val: string) => void;
}) {
  const { t } = shared;

  return (
    <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100">
      <label className="text-caption font-black text-emerald-600 uppercase block mb-2 tracking-widest">{t.exchange}</label>
      <div className="flex items-center gap-3">
        <div className="p-2 bg-emerald-500 rounded-btn text-white flex-shrink-0"><Coins size={16} /></div>
        <input
          type="number"
          value={coinExchange}
          onChange={e => onUpdateCoinExchange(e.target.value)}
          className="w-full text-2xl font-black bg-transparent outline-none text-emerald-900 placeholder:text-emerald-200"
          placeholder="0"
        />
      </div>
    </div>
  );
}

export function StartupDebtDeductionSection({
  onUpdateStartupDebtDeduction,
  selectedLocation,
  startupDebtDeduction,
  ...shared
}: SharedFinanceSectionProps & {
  onUpdateStartupDebtDeduction: (val: string) => void;
  selectedLocation: Location;
  startupDebtDeduction: string;
}) {
  const { lang } = shared;

  return (
    <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100">
      <div className="flex items-center justify-between mb-2">
        <label className="text-caption font-black text-amber-600 uppercase flex items-center gap-2 tracking-widest">
          <ShieldAlert size={13} /> {lang === 'zh' ? '商家欠款还款' : 'Merchant Debt Repayment'}
        </label>
        <span className="text-caption font-black text-amber-400 uppercase">
          {lang === 'zh'
            ? `剩余 ${selectedLocation.remainingStartupDebt.toLocaleString()}`
            : `Balance ${selectedLocation.remainingStartupDebt.toLocaleString()}`}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-baseline gap-1 border-b border-amber-200 px-1 flex-1">
          <span className="text-xs font-black text-amber-300">TZS</span>
          <input
            type="number"
            value={startupDebtDeduction}
            onChange={e => onUpdateStartupDebtDeduction(e.target.value)}
            className="w-full text-2xl font-black bg-transparent outline-none text-amber-900 placeholder:text-amber-200"
            placeholder="0"
          />
        </div>
      </div>
      <p className="text-caption font-black text-amber-400 uppercase mt-2">
        {lang === 'zh'
          ? '手动填写，本次按剩余商家欠款上限入账。'
          : 'Manual entry. This run is capped by remaining merchant debt and added to cash due.'}
      </p>
    </div>
  );
}

export function FinanceWarnings({
  isScoreBelowLastReading,
  selectedLocation,
  ...shared
}: SharedFinanceSectionProps & {
  isScoreBelowLastReading: boolean;
  selectedLocation: Location;
}) {
  const { lang, calculations } = shared;

  return (
    <>
      {isScoreBelowLastReading && (
        <div className="p-3 rounded-subcard border border-rose-200 bg-rose-50">
          <p className="text-caption font-black uppercase text-rose-600">
            {lang === 'zh'
              ? `当前读数低于上次记录 (${selectedLocation.lastScore.toLocaleString()})，请返回重新核对读数或改走重置申请。`
              : `Current reading is below the last recorded score (${selectedLocation.lastScore.toLocaleString()}). Go back and confirm the reading or use the reset request flow.`}
          </p>
        </div>
      )}
      {calculations.startupDebtDeduction > 0 && (
        <div className="p-3 rounded-subcard border border-amber-200 bg-amber-50">
          <p className="text-caption font-black uppercase text-amber-700">
            {lang === 'zh'
              ? `本次商家还款入账 TZS ${calculations.startupDebtDeduction.toLocaleString()}。`
              : `This collection adds TZS ${calculations.startupDebtDeduction.toLocaleString()} of merchant debt repayment.`}
          </p>
        </div>
      )}
    </>
  );
}

export function FinanceNavigation({
  isScoreBelowLastReading,
  lang,
  onBack,
  onNext,
}: {
  isScoreBelowLastReading: boolean;
  lang: 'zh' | 'sw';
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="sticky bottom-[calc(var(--mobile-nav-height,4.75rem)+env(safe-area-inset-bottom))] z-20 mt-4 rounded-card border border-slate-200 bg-white/95 p-2 backdrop-blur md:bottom-0">
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onBack}
          className="py-4 bg-white border border-slate-200 text-slate-500 rounded-btn font-black uppercase text-xs shadow-field hover:text-amber-600 transition-colors flex items-center justify-center gap-2"
        >
          <ArrowRight size={15} className="rotate-180" />
          {lang === 'zh' ? '返回' : 'Back'}
        </button>
        <button
          onClick={onNext}
          disabled={isScoreBelowLastReading}
          data-testid="driver-finance-next"
          className="py-4 bg-amber-600 text-white rounded-btn font-black uppercase text-xs shadow-field-md active:scale-95 transition-all flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          {lang === 'zh' ? '复核并提交' : 'Review & Submit'}
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
