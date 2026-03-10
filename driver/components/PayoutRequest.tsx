import React, { useState } from 'react';
import { ArrowRight, Wallet } from 'lucide-react';
import { Location, Driver, Transaction, TRANSLATIONS } from '../../types';

interface PayoutRequestProps {
  location: Location;
  currentDriver: Driver;
  lang: 'zh' | 'sw';
  gpsCoords: { lat: number; lng: number } | null;
  onSubmit: (tx: Transaction) => void;
  onCancel: () => void;
}

const PayoutRequest: React.FC<PayoutRequestProps> = ({
  location, currentDriver, lang, gpsCoords, onSubmit, onCancel,
}) => {
  const t = TRANSLATIONS[lang];
  const [payoutAmount, setPayoutAmount] = useState<string>('');

  const availableDividend = location?.dividendBalance || 0;
  const parsedPayoutAmount = parseInt(payoutAmount, 10);
  const isValidAmount = !isNaN(parsedPayoutAmount) && parsedPayoutAmount > 0;
  const exceedsBalance = isValidAmount && parsedPayoutAmount > availableDividend;

  const handleSubmitPayoutRequest = () => {
    if (!payoutAmount || isNaN(parsedPayoutAmount) || parsedPayoutAmount <= 0) {
      alert(lang === 'zh' ? '❌ 请输入有效提现金额' : '❌ Enter a valid payout amount!');
      return;
    }
    if (parsedPayoutAmount > availableDividend) {
      alert(lang === 'zh' ? `❌ 提现金额超过可用余额 (TZS ${availableDividend.toLocaleString()})` : `❌ Amount exceeds available balance (TZS ${availableDividend.toLocaleString()})`);
      return;
    }

    const gps = gpsCoords || { lat: 0, lng: 0 };
    const tx: Transaction = {
      id: `PAY-${Date.now()}`,
      timestamp: new Date().toISOString(),
      locationId: location.id,
      locationName: location.name,
      driverId: currentDriver.id,
      driverName: currentDriver.name,
      previousScore: location.lastScore,
      currentScore: location.lastScore,
      revenue: 0, commission: 0, ownerRetention: 0,
      debtDeduction: 0, startupDebtDeduction: 0,
      expenses: 0, coinExchange: 0, extraIncome: 0,
      netPayable: 0,
      gps, dataUsageKB: 40, isSynced: false,
      type: 'payout_request',
      approvalStatus: 'pending',
      payoutAmount: parsedPayoutAmount,
      notes: lang === 'zh' ? `店主分红提现: TZS ${parsedPayoutAmount.toLocaleString()}` : `Owner dividend payout: TZS ${parsedPayoutAmount.toLocaleString()}`
    };
    onSubmit(tx);
    alert(lang === 'zh' ? '✅ 提现申请已提交，等待老板审批' : '✅ Payout request submitted, awaiting approval');
  };

  return (
    <div className="max-w-md mx-auto py-6 px-4 animate-in fade-in">
      <div className="bg-white rounded-card p-6 border border-slate-200 shadow-field-md space-y-5">
        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
          <button
            onClick={onCancel}
            className="p-2.5 bg-slate-100 rounded-subcard text-slate-500 hover:text-indigo-600 transition-colors"
          >
            <ArrowRight size={18} className="rotate-180" />
          </button>
          <div className="text-center">
            <h2 className="text-base font-black text-slate-900">{t.payoutRequest}</h2>
            <p className="text-[10px] font-black text-emerald-500 uppercase mt-1">{location?.name} • {location?.ownerName || '---'}</p>
          </div>
          <div className="w-10" />
        </div>

        <div className="bg-emerald-50 p-4 rounded-subcard border border-emerald-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-500 rounded-btn text-white flex-shrink-0"><Wallet size={16} /></div>
            <div>
              <p className="text-xs font-black text-emerald-800 uppercase">{t.payoutRequestDesc}</p>
              <p className="text-[9px] font-bold text-emerald-400 mt-0.5">
                {lang === 'zh' ? `店主: ${location?.ownerName || 'N/A'}` : `Owner: ${location?.ownerName || 'N/A'}`}
              </p>
            </div>
          </div>
          <div className="bg-white p-3 rounded-btn border border-emerald-100 text-center">
            <p className="text-[8px] font-black text-emerald-400 uppercase mb-0.5">
              {lang === 'zh' ? '可提现余额' : 'Available Balance'}
            </p>
            <p className="text-2xl font-black text-emerald-700">TZS {availableDividend.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-subcard border border-slate-200">
          <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">{t.payoutAmount}</label>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-black text-slate-300">TZS</span>
            <input
              type="number"
              value={payoutAmount}
              onChange={e => setPayoutAmount(e.target.value)}
              className="w-full text-3xl font-black bg-transparent outline-none text-slate-900 placeholder:text-slate-200"
              placeholder="0"
            />
          </div>
          {exceedsBalance && (
            <p className="text-[9px] font-black text-rose-500 mt-2">
              {lang === 'zh' ? `⚠ 超过可用余额 (TZS ${availableDividend.toLocaleString()})` : `⚠ Exceeds available balance (TZS ${availableDividend.toLocaleString()})`}
            </p>
          )}
        </div>

        <button
          onClick={handleSubmitPayoutRequest}
          disabled={!isValidAmount || exceedsBalance}
          className="w-full py-4 bg-emerald-600 text-white rounded-btn font-black uppercase text-sm shadow-field-md disabled:bg-slate-300 active:scale-95 transition-all flex items-center justify-center gap-3"
        >
          <Wallet size={18} />
          {lang === 'zh' ? '提交提现申请' : 'Submit Payout Request'}
        </button>
      </div>
    </div>
  );
};

export default PayoutRequest;
