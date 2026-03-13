import React from 'react';
import { CheckCircle2, ArrowRight, HandCoins, Banknote, Coins, ShieldAlert, Trophy, ChevronRight, Gift } from 'lucide-react';
import { Location, CONSTANTS, TRANSLATIONS, Transaction } from '../../types';

// Tip anomaly thresholds: warn if tip > TIP_WARNING_THRESHOLD and revenue < REVENUE_WARNING_THRESHOLD
const TIP_WARNING_THRESHOLD = 2000;
const REVENUE_WARNING_THRESHOLD = 40000;

interface FinanceSummaryProps {
  selectedLocation: Location;
  lang: 'zh' | 'sw';
  currentScore: string;
  expenses: string;
  expenseType: 'public' | 'private';
  expenseCategory: Transaction['expenseCategory'];
  coinExchange: string;
  ownerRetention: string;
  isOwnerRetaining: boolean;
  tip: string;
  calculations: {
    diff: number;
    revenue: number;
    commission: number;
    finalRetention: number;
    netPayable: number;
    remainingCoins: number;
    isCoinStockNegative: boolean;
  };
  onUpdateExpenses: (val: string) => void;
  onUpdateExpenseType: (val: 'public' | 'private') => void;
  onUpdateExpenseCategory: (val: Transaction['expenseCategory']) => void;
  onUpdateCoinExchange: (val: string) => void;
  onUpdateOwnerRetention: (val: string) => void;
  onUpdateIsOwnerRetaining: (val: boolean) => void;
  onUpdateTip: (val: string) => void;
  onNext: () => void;
  onBack: () => void;
}

// Wizard step bar
const WIZARD_STEPS = [
  { key: 'capture',  labelZh: '拍照',     labelSw: 'Picha' },
  { key: 'amounts',  labelZh: '金额',     labelSw: 'Fedha' },
  { key: 'confirm',  labelZh: '提交',     labelSw: 'Wasilisha' },
];

const WizardStepBar = ({ current, lang }: { current: string; lang: 'zh' | 'sw' }) => {
  const currentIdx = WIZARD_STEPS.findIndex(s => s.key === current);
  return (
    <div className="flex items-center gap-2 mb-5">
      {WIZARD_STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = s.key === current;
        return (
          <React.Fragment key={s.key}>
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-tag text-[9px] font-black uppercase transition-all ${
              active ? 'bg-indigo-600 text-white' :
              done    ? 'bg-emerald-100 text-emerald-600' :
                        'bg-slate-100 text-slate-400'
            }`}>
              {done ? <CheckCircle2 size={10} /> : <span>{i + 2}</span>}
              {lang === 'sw' ? s.labelSw : s.labelZh}
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <div className={`flex-1 h-px ${done ? 'bg-emerald-300' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const FinanceSummary: React.FC<FinanceSummaryProps> = ({
  selectedLocation, lang, currentScore, expenses, expenseType, expenseCategory,
  coinExchange, ownerRetention, isOwnerRetaining, tip, calculations,
  onUpdateExpenses, onUpdateExpenseType, onUpdateExpenseCategory,
  onUpdateCoinExchange, onUpdateOwnerRetention, onUpdateIsOwnerRetaining, onUpdateTip,
  onNext, onBack,
}) => {
  const t = TRANSLATIONS[lang];

  return (
    <div className="max-w-md mx-auto py-4 px-4 animate-in fade-in space-y-4">
      <WizardStepBar current="amounts" lang={lang} />

      {/* Location sub-header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="p-2.5 bg-white border border-slate-200 rounded-subcard text-slate-500 hover:text-indigo-600 shadow-field transition-colors flex-shrink-0">
          <ArrowRight size={18} className="rotate-180" />
        </button>
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-900 truncate leading-tight">{selectedLocation?.name}</h2>
          <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.15em]">
            {selectedLocation?.machineId} • {((selectedLocation?.commissionRate ?? 0) * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Revenue summary */}
      <div className={`p-4 rounded-subcard text-white flex justify-between items-center ${calculations.revenue > 50000 ? 'bg-indigo-600' : 'bg-slate-800'}`}>
        <div>
          <p className="text-[9px] font-black uppercase opacity-60">{t.formula}</p>
          <p className="text-[9px] font-bold opacity-50">({currentScore} − {selectedLocation?.lastScore}) × 200</p>
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

      {/* Owner Retention */}
      <div className={`p-4 rounded-subcard border transition-all ${isOwnerRetaining ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
        <div className="flex justify-between items-center mb-3">
          <label className={`text-[10px] font-black uppercase flex items-center gap-2 ${isOwnerRetaining ? 'text-amber-600' : 'text-slate-400'}`}>
            <HandCoins size={13} /> {t.retention}
          </label>
          <button
            type="button"
            onClick={() => onUpdateIsOwnerRetaining(!isOwnerRetaining)}
            className={`relative w-9 h-5 rounded-full transition-colors ${isOwnerRetaining ? 'bg-amber-500' : 'bg-slate-300'}`}
          >
            <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${isOwnerRetaining ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
        {isOwnerRetaining ? (
          <div className="space-y-1">
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-black text-amber-300">TZS</span>
              <input
                type="number"
                value={ownerRetention}
                onChange={e => onUpdateOwnerRetention(e.target.value)}
                className="w-full text-2xl font-black bg-transparent outline-none text-amber-900 placeholder:text-amber-200"
                placeholder="0"
              />
            </div>
            <p className="text-[8px] font-black text-amber-400 uppercase">{(selectedLocation!.commissionRate * 100).toFixed(0)}% Left at machine</p>
          </div>
        ) : (
          <div className="p-3 bg-indigo-600 text-white rounded-btn flex items-center gap-2.5">
            <ShieldAlert size={16} />
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase">{t.fullCollect}</p>
              <p className="text-[8px] font-bold opacity-80 mt-0.5">TZS {calculations.commission.toLocaleString()} recorded as debt</p>
            </div>
          </div>
        )}
      </div>

      {/* Expenses */}
      <div className="bg-rose-50 p-4 rounded-subcard border border-rose-100">
        <div className="flex items-center justify-between mb-3">
          <label className="text-[10px] font-black text-rose-500 uppercase flex items-center gap-2">
            <Banknote size={13} /> Expenses / Advance
          </label>
          {parseInt(expenses) > 0 && (
            <span className="px-2 py-0.5 bg-rose-200 text-rose-800 rounded-tag text-[8px] font-black uppercase">PENDING</span>
          )}
        </div>

        <div className="flex bg-white/60 p-1 rounded-btn mb-3">
          <button
            onClick={() => onUpdateExpenseType('public')}
            className={`flex-1 py-1.5 rounded-tag text-[9px] font-black uppercase transition-all ${expenseType === 'public' ? 'bg-rose-500 text-white shadow-field' : 'text-rose-400 hover:bg-rose-100'}`}
          >
            Company
          </button>
          <button
            onClick={() => onUpdateExpenseType('private')}
            className={`flex-1 py-1.5 rounded-tag text-[9px] font-black uppercase transition-all ${expenseType === 'private' ? 'bg-indigo-500 text-white shadow-field' : 'text-rose-400 hover:bg-rose-100'}`}
          >
            Driver Advance
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={expenseCategory}
            onChange={e => onUpdateExpenseCategory(e.target.value as any)}
            className="bg-white border border-rose-100 rounded-btn px-2 py-2 text-[10px] font-black text-rose-600 outline-none uppercase w-28 flex-shrink-0"
          >
            {expenseType === 'public' ? (
              <>
                <option value="fuel">Fuel</option>
                <option value="repair">Repair</option>
                <option value="fine">Fine</option>
                <option value="other">Other</option>
              </>
            ) : (
              <>
                <option value="allowance">Meal Allow.</option>
                <option value="salary_advance">Salary Adv.</option>
                <option value="other">Personal</option>
              </>
            )}
          </select>
          <div className="flex-1 flex items-baseline gap-1 border-b border-rose-200 px-1">
            <span className="text-xs font-black text-rose-300">TZS</span>
            <input
              type="number"
              value={expenses}
              onChange={e => onUpdateExpenses(e.target.value)}
              className="w-full text-xl font-black bg-transparent outline-none text-rose-900 placeholder:text-rose-200"
              placeholder="0"
            />
          </div>
        </div>
      </div>

      {/* Coin Exchange */}
      <div className="bg-emerald-50 p-4 rounded-subcard border border-emerald-100">
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

      {/* Tip / Gratuity */}
      <div className="bg-amber-50 p-4 rounded-subcard border border-amber-100">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-black text-amber-600 uppercase flex items-center gap-2 tracking-widest">
            <Gift size={13} /> {lang === 'zh' ? '小费支出 (正常5万-6万给1000-2000)' : 'Tip / Gratuity (Normal 1000-2000 for 50k-60k rev)'}
          </label>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-1 border-b border-amber-200 px-1 flex-1">
            <span className="text-xs font-black text-amber-300">TZS</span>
            <input
              type="number"
              value={tip}
              onChange={e => onUpdateTip(e.target.value)}
              className="w-full text-2xl font-black bg-transparent outline-none text-amber-900 placeholder:text-amber-200"
              placeholder="0"
            />
          </div>
        </div>
        {parseInt(tip) > TIP_WARNING_THRESHOLD && calculations.revenue < REVENUE_WARNING_THRESHOLD && (
          <p className="text-[8px] font-black text-amber-600 uppercase mt-2">⚠️ {lang === 'zh' ? '小费偏高，请确认' : 'High tip for this revenue – confirm with admin'}</p>
        )}
      </div>

      {/* Navigation */}
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
          className="py-4 bg-indigo-600 text-white rounded-btn font-black uppercase text-xs shadow-field-md active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          {lang === 'zh' ? '确认提交' : 'Review & Submit'}
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
};

export default FinanceSummary;
