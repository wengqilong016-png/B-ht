import React, { useMemo, useState } from 'react';
import { X, Receipt, Wallet, Ban } from 'lucide-react';
import { persistEvidencePhotoUrl } from '../../services/evidenceStorage';
import type { MonthlyPayroll } from '../../types';

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

const ACTION_COPY: Record<PayrollActionMode, { title: string; icon: React.ReactNode; button: string }> = {
  create: {
    title: 'Generate Payroll',
    icon: <Receipt size={18} />,
    button: 'Create Payroll',
  },
  pay: {
    title: 'Mark Payroll Paid',
    icon: <Wallet size={18} />,
    button: 'Confirm Payment',
  },
  cancel: {
    title: 'Cancel Payroll',
    icon: <Ban size={18} />,
    button: 'Cancel Payroll',
  },
};

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
  const [note, setNote] = useState(record?.note || '');
  const [paymentMethod, setPaymentMethod] = useState<MonthlyPayroll['paymentMethod']>(
    record?.paymentMethod || 'bank_transfer',
  );
  const [proofFile, setProofFile] = useState<File | null>(null);
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

  const title = useMemo(() => {
    if (lang === 'zh') {
      if (mode === 'create') return '生成工资单';
      if (mode === 'pay') return '登记工资已支付';
      return '取消工资单';
    }
    return copy.title;
  }, [copy.title, lang, mode]);

  const handleFileChange = async (file: File | null) => {
    setProofFile(file);
    if (!file) {
      setProofPreview(record?.paymentProofUrl || null);
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setProofPreview(dataUrl);
    } catch (error) {
      console.error('Failed to preview payroll proof.', error);
      alert(lang === 'zh' ? '❌ 凭证预览失败，请重试。' : '❌ Failed to preview payment proof. Please retry.');
      setProofFile(null);
      setProofPreview(record?.paymentProofUrl || null);
    }
  };

  const handleSubmit = async () => {
    let paymentProofUrl = record?.paymentProofUrl;

    if (isPayMode && proofPreview && proofPreview.startsWith('data:image/')) {
      setIsUploading(true);
      try {
        paymentProofUrl = await persistEvidencePhotoUrl(proofPreview, {
          category: 'payroll',
          entityId: record?.id || `${driver.id}-${month}`,
          driverId: driver.id,
        });
      } catch (error) {
        console.error('Failed to upload payroll proof.', error);
        alert(lang === 'zh' ? '❌ 工资凭证上传失败，请重试。' : '❌ Failed to upload payroll proof. Please retry.');
        return;
      } finally {
        setIsUploading(false);
      }
    }

    await onSubmit({
      note: note.trim() || undefined,
      paymentMethod: isPayMode ? paymentMethod : undefined,
      paymentProofUrl,
    });
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl relative">
        <div className="bg-slate-900 p-6 text-white relative">
          <button onClick={onClose} disabled={isSubmitting || isUploading} className="absolute top-6 right-6 p-2 bg-white/10 rounded-full hover:bg-white/20 disabled:opacity-40">
            <X size={18} />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-500 rounded-xl">{copy.icon}</div>
            <h3 className="text-xl font-black uppercase">{title}</h3>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
            {driver.name} • {month}
          </p>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-[10px] font-bold text-slate-500 uppercase">
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <p className="text-slate-400 mb-1">Base Salary</p>
              <p className="text-sm font-black text-slate-900">TZS {driver.baseSalary.toLocaleString()}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <p className="text-slate-400 mb-1">Commission</p>
              <p className="text-sm font-black text-slate-900">TZS {summary.commission.toLocaleString()}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <p className="text-slate-400 mb-1">Loans + Shortage</p>
              <p className="text-sm font-black text-rose-600">TZS {(summary.loans + summary.shortage).toLocaleString()}</p>
            </div>
            <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
              <p className="text-indigo-400 mb-1">Net Payroll</p>
              <p className="text-sm font-black text-indigo-700">TZS {summary.netPayable.toLocaleString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[10px] font-bold text-slate-400 uppercase">
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <p className="mb-1">Revenue</p>
              <p className="text-sm font-black text-slate-900">TZS {summary.totalRevenue.toLocaleString()}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <p className="mb-1">Collections</p>
              <p className="text-sm font-black text-slate-900">{summary.collectionCount}</p>
            </div>
          </div>

          {isPayMode && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Payment Method</label>
                <select
                  value={paymentMethod || 'bank_transfer'}
                  onChange={event => setPaymentMethod(event.target.value as MonthlyPayroll['paymentMethod'])}
                  className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-indigo-500"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">
                  Payment Proof {requiresProof ? '*' : ''}
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
                  <img src={proofPreview} alt="Payroll proof" className="mt-3 w-full h-44 object-cover rounded-2xl border border-slate-200" />
                )}
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">
              {isCancelMode ? 'Cancel Note' : 'Note'}
            </label>
            <textarea
              value={note}
              onChange={event => setNote(event.target.value)}
              rows={4}
              placeholder={lang === 'zh' ? '输入备注...' : 'Add a note...'}
              className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSubmitting || isUploading}
              className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs disabled:opacity-50"
            >
              {lang === 'zh' ? '关闭' : 'Close'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs disabled:opacity-50"
            >
              {isSubmitting || isUploading ? (lang === 'zh' ? '处理中...' : 'Processing...') : copy.button}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayrollActionModal;
