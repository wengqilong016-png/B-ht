import React from 'react';
import { ArrowRight, HandCoins, Banknote, Coins, Trophy, ChevronRight, ShieldAlert } from 'lucide-react';
import WizardStepBar from './WizardStepBar';
import CollectionWorkbenchHeader from './CollectionWorkbenchHeader';
import { Location, CONSTANTS, TRANSLATIONS, Transaction } from '../../types';
import type { FinanceCalculationSource } from '../../services/financeCalculator';

// Tip anomaly thresholds: warn if tip > TIP_WARNING_THRESHOLD and revenue < REVENUE_WARNING_THRESHOLD
const TIP_WARNING_THRESHOLD = 2000;
const REVENUE_WARNING_THRESHOLD = 40000;

interface FinanceSummaryProps {
  selectedLocation: Location;
  lang: 'zh' | 'sw';
  currentScore: string;
  expenses: string;
  expenseCategory: Transaction['expenseCategory'];
  coinExchange: string;
  ownerRetention: string;
  isOwnerRetaining: boolean;
  tip: string;
  startupDebtDeduction: string;
  calculations: {
    diff: number;
    revenue: number;
    commission: number;
    finalRetention: number;
    startupDebtDeduction: number;
    netPayable: number;
    remainingCoins: number;
    isCoinStockNegative: boolean;
  };
  onUpdateExpenses: (val: string) => void;
  onUpdateExpenseCategory: (val: Transaction['expenseCategory']) => void;
  onUpdateCoinExchange: (val: string) => void;
  onUpdateOwnerRetention: (val: string) => void;
  onUpdateIsOwnerRetaining: (val: boolean) => void;
  onUpdateTip: (val: string) => void;
  onUpdateStartupDebtDeduction: (val: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSwitchMachine?: () => void;
  previewSource?: FinanceCalculationSource;
  nextMachine?: Location | null;
  pendingCount?: number;
}

const FinanceSummary: React.FC<FinanceSummaryProps> = ({
  selectedLocation, lang, currentScore, expenses, expenseCategory,
  coinExchange, ownerRetention, isOwnerRetaining, tip, startupDebtDeduction, calculations,
  onUpdateExpenses, onUpdateExpenseCategory,
  onUpdateCoinExchange, onUpdateOwnerRetention, onUpdateIsOwnerRetaining, onUpdateTip, onUpdateStartupDebtDeduction,
  onNext, onBack, onSwitchMachine, previewSource, nextMachine, pendingCount,
}) => {
  const t = TRANSLATIONS[lang];
  const isTipExpense = expenseCategory === 'tip';
  const displayedExpenseValue = isTipExpense ? tip : expenses;
  const currentDividendBalance = Number(selectedLocation.dividendBalance || 0);
  const projectedDividendBalance = currentDividendBalance + calculations.finalRetention;
  const shouldShowComputedOwnerAmount =
    ownerRetention === '' || (ownerRetention === '0' && calculations.commission > 0);
  const displayedOwnerAmount = shouldShowComputedOwnerAmount
    ? String(calculations.commission)
    : ownerRetention;
  const parsedCurrentScore = parseInt(currentScore, 10);
  const hasNumericScore = !isNaN(parsedCurrentScore);
  const isScoreBelowLastReading = hasNumericScore && parsedCurrentScore < (selectedLocation?.lastScore ?? 0);

  return (
    <div className="max-w-md mx-auto py-2.5 px-3 pb-24 animate-in fade-in space-y-2.5">
      <WizardStepBar current="amounts" lang={lang} />

      <CollectionWorkbenchHeader
        selectedLocation={selectedLocation}
        lang={lang}
        onBack={onBack}
        onSwitchMachine={onSwitchMachine}
        nextMachine={nextMachine}
        pendingCount={pendingCount}
      />

      {/* Revenue summary */}
      <div className={`px-3 py-2.5 rounded-2xl text-white flex justify-between items-center ${calculations.revenue > 50000 ? 'bg-indigo-600' : 'bg-slate-800'}`}>
        <div>
          <p className="text-[9px] font-black uppercase opacity-60">{t.formula}</p>
          <p className="text-[9px] font-bold opacity-50">({currentScore} − {selectedLocation?.lastScore}) × 200</p>
          {previewSource && (
              <span
              className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wide ${previewSource === 'server' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50'}`}
              title={previewSource === 'server' ? 'Preview calculated by server' : 'Preview calculated locally'}
            >
              {previewSource === 'server' ? '⬡ server' : '◎ local'}
            </span>
          )}
        </div>
        <div className="text-right">
          {calculations.revenue > 50000 && (
            <div className="flex items-center gap-1 justify-end mb-1">
              <Trophy size={10} className="text-yellow-300" />
              <span className="text-[8px] font-black text-yellow-300 uppercase">High Value</span>
            </div>
          )}
          <p className="text-2xl font-black">TZS {calculations.revenue.toLocaleString()}</p>
          <p className="text-[8px] opacity-60 uppercase">{t.revenue}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">{t.retention}</p>
          <p className="mt-1 text-sm font-black text-slate-900">TZS {calculations.finalRetention.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">{t.expenses}</p>
          <p className="mt-1 text-sm font-black text-slate-900">TZS {(parseInt(displayedExpenseValue) || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">{t.net}</p>
          <p className="mt-1 text-sm font-black text-slate-900">TZS {calculations.netPayable.toLocaleString()}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {lang === 'zh' ? '金额录入' : 'Cash Inputs'}
            </p>
            <p className="mt-1 text-[8px] font-bold uppercase tracking-wide text-slate-300">
              {lang === 'zh' ? '分红、公账支出、换币、商家欠款' : 'Retention, company expenses, exchange, merchant debt'}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-black uppercase text-slate-500">
            {previewSource === 'server' ? 'server' : 'local'}
          </span>
        </div>

      {/* Owner Retention */}
      <div className={`p-3 rounded-2xl border transition-all ${isOwnerRetaining ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
        <div className="flex justify-between items-center mb-3">
          <label className={`text-[10px] font-black uppercase flex items-center gap-2 ${isOwnerRetaining ? 'text-amber-600' : 'text-emerald-600'}`}>
            <HandCoins size={13} /> {isOwnerRetaining ? t.retention : (lang === 'zh' ? '支付商家分红' : 'Pay Owner Share')}
          </label>
          <button
            type="button"
            onClick={() => onUpdateIsOwnerRetaining(!isOwnerRetaining)}
            className={`relative w-9 h-5 rounded-full transition-colors ${isOwnerRetaining ? 'bg-amber-500' : 'bg-emerald-500'}`}
          >
            <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${isOwnerRetaining ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
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
          <p className={`text-[8px] font-black uppercase ${isOwnerRetaining ? 'text-amber-500' : 'text-emerald-500'}`}>
            {isOwnerRetaining
              ? (lang === 'zh'
                  ? `默认按系统计算 TZS ${calculations.commission.toLocaleString()}，可直接修改`
                  : `Defaulted to system amount TZS ${calculations.commission.toLocaleString()}, editable`)
              : (lang === 'zh'
                  ? `默认按系统计算 TZS ${calculations.commission.toLocaleString()}，本次支付给商家`
                  : `Defaulted to system amount TZS ${calculations.commission.toLocaleString()} to pay the owner`)}
          </p>
          <div className={`grid grid-cols-2 gap-2 rounded-2xl border px-3 py-2 ${isOwnerRetaining ? 'border-amber-200 bg-white/70' : 'border-emerald-200 bg-white/70'}`}>
            <div>
              <p className="text-[8px] font-black uppercase text-slate-400">{lang === 'zh' ? '当前分红余额' : 'Current Balance'}</p>
              <p className="mt-1 text-[11px] font-black text-slate-900">
                TZS {currentDividendBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[8px] font-black uppercase text-slate-400">
                {isOwnerRetaining ? (lang === 'zh' ? '留存后余额' : 'Projected Balance') : (lang === 'zh' ? '本次支付' : 'Paid This Run')}
              </p>
              <p className={`mt-1 text-[11px] font-black ${isOwnerRetaining ? 'text-amber-700' : 'text-emerald-700'}`}>
                TZS {(isOwnerRetaining ? projectedDividendBalance : calculations.finalRetention).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
      {/* Expenses */}
      <div className="bg-rose-50 p-3 rounded-2xl border border-rose-100">
        <div className="flex items-center justify-between mb-3">
          <label className="text-[10px] font-black text-rose-500 uppercase flex items-center gap-2">
            <Banknote size={13} /> {lang === 'zh' ? '公账支出' : 'Company Expense'}
          </label>
          {(parseInt(displayedExpenseValue) || 0) > 0 && (
            <span className="px-2 py-0.5 bg-rose-200 text-rose-800 rounded-tag text-[8px] font-black uppercase">{t.pendingApproval}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={expenseCategory}
            onChange={e => onUpdateExpenseCategory(e.target.value as any)}
            className="bg-white border border-rose-100 rounded-btn px-2 py-2 text-[10px] font-black text-rose-600 outline-none uppercase w-28 flex-shrink-0"
          >
            <option value="tip">{lang === 'zh' ? '小费支出' : 'Tip / Gratuity'}</option>
            <option value="fuel">{t.fuelLabel}</option>
            <option value="repair">{t.repairLabel}</option>
            <option value="fine">{t.fineLabel}</option>
            <option value="other">{t.otherLabel}</option>
          </select>
          <div className="flex-1 flex items-baseline gap-1 border-b border-rose-200 px-1">
            <span className="text-xs font-black text-rose-300">TZS</span>
            <input
              type="number"
              value={displayedExpenseValue}
              onChange={e => {
                if (isTipExpense) {
                  onUpdateTip(e.target.value);
                  onUpdateExpenses('');
                } else {
                  onUpdateExpenses(e.target.value);
                  onUpdateTip('');
                }
              }}
              className="w-full text-xl font-black bg-transparent outline-none text-rose-900 placeholder:text-rose-200"
              placeholder="0"
            />
          </div>
        </div>
        <p className="mt-2 text-[8px] font-black uppercase text-rose-400">
          {lang === 'zh'
            ? '司机预支已移到债务窗口处理。'
            : 'Driver advances now live in the debt window.'}
        </p>
        {isTipExpense && (parseInt(tip) || 0) > TIP_WARNING_THRESHOLD && calculations.revenue < REVENUE_WARNING_THRESHOLD && (
          <p className="mt-2 text-[8px] font-black uppercase text-amber-700">
            ⚠️ {lang === 'zh' ? '小费偏高，请确认' : 'High tip for this revenue – confirm with admin'}
          </p>
        )}
      </div>

      {/* Coin Exchange */}
      <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100">
        <label className="text-[10px] font-black text-emerald-600 uppercase block mb-2 tracking-widest">{t.exchange}</label>
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

      <div className="bg-indigo-50 p-3 rounded-2xl border border-indigo-100">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-black text-indigo-600 uppercase flex items-center gap-2 tracking-widest">
            <ShieldAlert size={13} /> {lang === 'zh' ? '商家欠款手动扣减' : 'Manual Merchant Debt Deduction'}
          </label>
          <span className="text-[8px] font-black text-indigo-400 uppercase">
            {lang === 'zh'
              ? `剩余 ${selectedLocation.remainingStartupDebt.toLocaleString()}`
              : `Balance ${selectedLocation.remainingStartupDebt.toLocaleString()}`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-1 border-b border-indigo-200 px-1 flex-1">
            <span className="text-xs font-black text-indigo-300">TZS</span>
            <input
              type="number"
              value={startupDebtDeduction}
              onChange={e => onUpdateStartupDebtDeduction(e.target.value)}
              className="w-full text-2xl font-black bg-transparent outline-none text-indigo-900 placeholder:text-indigo-200"
              placeholder="0"
            />
          </div>
        </div>
        <p className="text-[8px] font-black text-indigo-400 uppercase mt-2">
          {lang === 'zh'
            ? '手动填写，本次只会按可扣上限和剩余商家欠款计入。'
            : 'Manual entry. This run is capped by available cash and remaining merchant debt.'}
        </p>
      </div>
      </div>
      </div>

      {/* Navigation */}
      {isScoreBelowLastReading && (
        <div className="p-3 rounded-subcard border border-rose-200 bg-rose-50">
          <p className="text-[9px] font-black uppercase text-rose-600">
            {lang === 'zh'
              ? `当前读数低于上次记录 (${selectedLocation.lastScore.toLocaleString()})，请返回重新核对读数或改走重置申请。`
              : `Current reading is below the last recorded score (${selectedLocation.lastScore.toLocaleString()}). Go back and confirm the reading or use the reset request flow.`}
          </p>
        </div>
      )}
      {calculations.startupDebtDeduction > 0 && (
        <div className="p-3 rounded-subcard border border-indigo-200 bg-indigo-50">
          <p className="text-[9px] font-black uppercase text-indigo-700">
            {lang === 'zh'
              ? `本次将代商家回收欠款 TZS ${calculations.startupDebtDeduction.toLocaleString()}。`
              : `This collection will recover TZS ${calculations.startupDebtDeduction.toLocaleString()} of merchant debt.`}
          </p>
        </div>
      )}
      <div className="sticky bottom-0 z-20 -mx-3 mt-4 border-t border-slate-200 bg-white/95 px-3 pb-2 pt-3 backdrop-blur">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onBack}
            className="py-4 bg-white border border-slate-200 text-slate-500 rounded-btn font-black uppercase text-xs shadow-field hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowRight size={15} className="rotate-180" />
            {lang === 'zh' ? '返回' : 'Back'}
          </button>
          <button
            onClick={onNext}
            disabled={isScoreBelowLastReading}
            className="py-4 bg-indigo-600 text-white rounded-btn font-black uppercase text-xs shadow-field-md active:scale-95 transition-all flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {lang === 'zh' ? '复核并提交' : 'Review & Submit'}
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FinanceSummary;
