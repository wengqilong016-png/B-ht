import { X, Receipt, Wallet, Ban } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { useToast } from '../../contexts/ToastContext';
import { persistEvidencePhotoUrl } from '../../services/evidenceStorage';
import { TRANSLATIONS, type MonthlyPayroll } from '../../types';

type PayrollActionMode = 'create' | 'pay' | 'cancel';

interface PayrollActionModalProps {
  mode: PayrollActionMode;
  driver: {
    id: string;
    name: string;
    baseSalary: number;
  };
  month: string;
  summary: {
    commission: number;
    loans: number;
    shortage: number;
    netPayable: number;
    collectionCount: number;
    totalRevenue: number;
  };
  record?: MonthlyPayroll | null;
  isSubmitting: boolean;
  lang: 'zh' | 'sw';
  onClose: () => void;
  onSubmit: (payload: {
    note?: string;
    paymentMethod?: MonthlyPayroll['paymentMethod'];
    paymentProofUrl?: string;
  }) => Promise<void>;
}

const ACTION_COPY: Record<PayrollActionMode, { icon: React.ReactNode }> = {
  create: {
    icon: <Receipt size={18} />,
  },
  pay: {
    icon: <Wallet size={18} />,
  },
  cancel: {
    icon: <Ban size={18} />,
  },
};

function getPayrollActionTitle(
  mode: PayrollActionMode,
  t: typeof TRANSLATIONS['zh'],
): string {
  if (mode === 'create') return t.generatePayroll;
  if (mode === 'pay') return t.markPaid;
  return t.cancelPayroll;
}

function getPayrollSubmitLabel(
  mode: PayrollActionMode,
  isBusy: boolean,
  t: typeof TRANSLATIONS['zh'],
): string {
  if (isBusy) return t.processingAction;
  if (mode === 'create') return t.createPayroll;
  if (mode === 'pay') return t.confirmPayment;
  return t.cancelPayroll;
}

function buildPayrollSubmitPayload(
  note: string,
  isPayMode: boolean,
  paymentMethod: MonthlyPayroll['paymentMethod'],
  paymentProofUrl: string | undefined,
): {
  note?: string;
  paymentMethod?: MonthlyPayroll['paymentMethod'];
  paymentProofUrl?: string;
} {
  return {
    note: note.trim() || undefined,
    paymentMethod: isPayMode ? paymentMethod : undefined,
    paymentProofUrl,
  };
}

async function uploadPayrollProof(
  proofPreview: string,
  recordId: string | undefined,
  driverId: string,
  month: string,
): Promise<string | undefined> {
  return (await persistEvidencePhotoUrl(proofPreview, {
    category: 'payroll',
    entityId: recordId || `${driverId}-${month}`,
    driverId,
  })) ?? undefined;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read evidence file'));
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read evidence file'));
    reader.readAsDataURL(file);
  });
}

const PayrollActionModal: React.FC<PayrollActionModalProps> = ({
  mode,
  driver,
  month,
  summary,
  record,
  isSubmitting,
  lang,
  onClose,
  onSubmit,
}) => {
  const t = TRANSLATIONS[lang];
  const { showToast } = useToast();
  const [note, setNote] = useState(record?.note || '');
  const [paymentMethod, setPaymentMethod] = useState<MonthlyPayroll['paymentMethod']>(
    record?.paymentMethod || 'bank_transfer',
  );
  const [proofPreview, setProofPreview] = useState<string | null>(record?.paymentProofUrl || null);
  const [isUploading, setIsUploading] = useState(false);

  const copy = ACTION_COPY[mode];
  const isPayMode = mode === 'pay';
  const isCancelMode = mode === 'cancel';
  const requiresProof = isPayMode;
  const canSubmit =
    !isSubmitting &&
    !isUploading &&
    (!isPayMode || (!!paymentMethod && !!proofPreview));

  const title = useMemo(() => getPayrollActionTitle(mode, t), [mode, t]);

  const handleFileChange = async (file: File | null) => {
    if (!file) {
      setProofPreview(record?.paymentProofUrl || null);
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setProofPreview(dataUrl);
    } catch (error) {
      console.error('Failed to preview payroll proof.', error);
      showToast(lang === 'zh' ? '凭证预览失败，请重试。' : 'Failed to preview payment proof. Please retry.', 'error');
      setProofPreview(record?.paymentProofUrl || null);
    }
  };

  const handleSubmit = async () => {
    let paymentProofUrl: string | undefined = record?.paymentProofUrl ?? undefined;

    if (isPayMode && proofPreview && proofPreview.startsWith('data:image/')) {
      setIsUploading(true);
      try {
        paymentProofUrl = await uploadPayrollProof(proofPreview, record?.id, driver.id, month);
      } catch (error) {
        console.error('Failed to upload payroll proof.', error);
        showToast(lang === 'zh' ? '工资凭证上传失败，请重试。' : 'Failed to upload payroll proof. Please retry.', 'error');
        return;
      } finally {
        setIsUploading(false);
      }
    }

    try {
      await onSubmit(buildPayrollSubmitPayload(note, isPayMode, paymentMethod, paymentProofUrl));
    } catch (error) {
      console.error('Failed to submit payroll action.', error);
      showToast(
        lang === 'zh' ? '工资操作提交失败，请重试。' : 'Failed to submit payroll action. Please retry.',
        'error',
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-card overflow-hidden shadow-2xl relative">
        <div className="bg-slate-900 p-6 text-white relative">
          <button type="button" aria-label={t.close} disabled={isSubmitting || isUploading} onClick={onClose} className="absolute top-6 right-6 p-2 bg-white/10 rounded-full hover:bg-white/20 disabled:opacity-40">
            <X size={18} />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-500 rounded-xl">{copy.icon}</div>
            <h3 className="text-xl font-black uppercase">{title}</h3>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
            {driver.name} • {month}
          </p>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-[10px] font-bold text-slate-500 uppercase">
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <p className="text-slate-400 mb-1">{t.baseSalaryLabel}</p>
              <p className="text-sm font-black text-slate-900">TZS {driver.baseSalary.toLocaleString()}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <p className="text-slate-400 mb-1">{t.commissionLabel}</p>
              <p className="text-sm font-black text-slate-900">TZS {summary.commission.toLocaleString()}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <p className="text-slate-400 mb-1">{t.loansAndShortage}</p>
              <p className="text-sm font-black text-rose-600">TZS {(summary.loans + summary.shortage).toLocaleString()}</p>
            </div>
            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
              <p className="text-amber-400 mb-1">{t.netPayroll}</p>
              <p className="text-sm font-black text-amber-700">TZS {summary.netPayable.toLocaleString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[10px] font-bold text-slate-400 uppercase">
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <p className="mb-1">{t.revenueLabel}</p>
              <p className="text-sm font-black text-slate-900">TZS {summary.totalRevenue.toLocaleString()}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <p className="mb-1">{t.collectionsLabel}</p>
              <p className="text-sm font-black text-slate-900">{summary.collectionCount}</p>
            </div>
          </div>

          {isPayMode && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">{t.paymentMethod}</label>
                <select
                  value={paymentMethod || 'bank_transfer'}
                  onChange={event => setPaymentMethod(event.target.value as MonthlyPayroll['paymentMethod'])}
              className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-amber-500"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">
                  {t.paymentProof} {requiresProof ? '*' : ''}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={event => handleFileChange(event.target.files?.[0] || null)}
                  className="block w-full text-xs font-bold text-slate-500"
                />
                {!proofPreview && (
                  <p className="mt-2 text-[10px] font-bold text-rose-500 uppercase">
                    {lang === 'zh' ? '请先上传工资支付凭证。' : 'Upload payment proof before confirming payroll.'}
                  </p>
                )}
                {proofPreview && (
                  <img src={proofPreview} alt={t.paymentProof} className="mt-3 w-full h-44 object-cover rounded-2xl border border-slate-200" />
                )}
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">
              {isCancelMode ? t.cancelNote : t.notes}
            </label>
            <textarea
              value={note}
              onChange={event => setNote(event.target.value)}
              rows={4}
              placeholder={t.notesPlaceholder}
              className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSubmitting || isUploading}
              className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs disabled:opacity-50"
            >
              {t.close}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 py-3 bg-amber-600 text-white rounded-2xl font-black uppercase text-xs disabled:opacity-50"
            >
              {getPayrollSubmitLabel(mode, isSubmitting || isUploading, t)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayrollActionModal;
