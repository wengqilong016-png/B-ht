import React from 'react';
import { X, Calculator, AlertCircle, TrendingUp, Receipt } from 'lucide-react';
import { TRANSLATIONS } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

interface SalaryData {
  driver: { name: string };
  revenue: number;
  base: number;
  comm: number;
  loans: number;
  shortage: number;
  rate: number;
  txCount: number;
  month: string;
  total: number;
}

interface DriverSalaryModalProps {
  salaryData: SalaryData;
  onClose: () => void;
}

const DriverSalaryModal: React.FC<DriverSalaryModalProps> = ({ salaryData, onClose }) => {
  const { lang } = useAuth();
  const t = TRANSLATIONS[lang];
  return (
  <div className="fixed inset-0 z-[70] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
    <div className="bg-white w-full max-w-sm rounded-card overflow-hidden shadow-2xl relative">
      <div className="bg-slate-900 p-6 text-white relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-white/10 rounded-full hover:bg-white/20"><X size={18} /></button>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-indigo-500 rounded-xl"><Calculator size={20} /></div>
          <h3 className="text-xl font-black uppercase">{t.monthlyPayrollTitle}</h3>
        </div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{salaryData.driver.name} • {salaryData.month} {t.monthlyCycle}</p>
      </div>

      <div className="p-6 space-y-6">
        <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 flex justify-between items-center">
          <div>
            <p className="text-[9px] font-black text-indigo-400 uppercase mb-1">{t.monthlyRevenueStats}</p>
            <p className="text-xl font-black text-slate-900">TZS {salaryData.revenue.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black text-indigo-400 uppercase mb-1">{t.collectionsVisits}</p>
            <p className="text-base font-black text-slate-700">{salaryData.txCount}</p>
          </div>
        </div>

        <div className="space-y-3 px-1">
          <div className="flex justify-between items-center">
            <span className="text-xs font-black text-slate-500 uppercase">{t.baseSalaryLabel}</span>
            <span className="text-sm font-black text-slate-700">TZS {salaryData.base.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-black text-slate-500 uppercase">{t.commissionLabel} ({(salaryData.rate * 100).toFixed(0)}%)</span>
            <span className="text-sm font-black text-emerald-600">+ TZS {salaryData.comm.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-black text-slate-500 uppercase">{t.privateLoansLabel}</span>
            <span className="text-sm font-black text-rose-500">- TZS {salaryData.loans.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-black text-slate-500 uppercase">{t.shortageShort}</span>
            <span className="text-sm font-black text-rose-500">- TZS {salaryData.shortage.toLocaleString()}</span>
          </div>
          <div className="h-px bg-slate-100 my-2"></div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-black text-slate-900 uppercase tracking-widest">{t.netSalaryLabel}</span>
            <span className="text-xl font-black text-indigo-600">TZS {salaryData.total.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-slate-50 p-3 rounded-xl flex items-center gap-2">
          <AlertCircle size={14} className="text-slate-400" />
          <p className="text-[9px] font-bold text-slate-400 leading-tight">{t.payrollNote}</p>
        </div>

        <button onClick={onClose} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs">{t.confirmAndClose}</button>
      </div>
    </div>
  </div>
);
};

export default DriverSalaryModal;
