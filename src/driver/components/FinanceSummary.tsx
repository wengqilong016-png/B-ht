import React, { useState, useEffect } from 'react';
import { Location } from '../../types';
import { supabase } from '../../../supabaseClient';

interface FinanceSummaryProps {
  currentScore: number;
  previousScore: number;
  location: Location;
  onComplete?: (data: any) => void;
}

const FinanceSummary: React.FC<FinanceSummaryProps> = ({
  currentScore,
  previousScore,
  location,
  onComplete,
}) => {
  const [expenses, setExpenses] = useState<number>(0);
  const [coinExchange, setCoinExchange] = useState<number>(0);
  const [remarks, setRemarks] = useState<string>('');
  const [isAuthoritative, setIsAuthoritative] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  // Default Local Calculation (Fallback)
  const localRevenue = currentScore - previousScore;
  const localCommission = Math.round(localRevenue * (location.commission_rate / 100));
  const localOwnerRetention = localRevenue - localCommission;
  const localNetPayable = localOwnerRetention - Math.abs(expenses) + coinExchange;

  const [finance, setFinance] = useState({
    revenue: localRevenue,
    commission: localCommission,
    owner_retention: localOwnerRetention,
    net_payable: localNetPayable
  });

  const fetchAuthoritativeFinance = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('calculate_finance_v1', {
        p_current_score: currentScore,
        p_previous_score: previousScore,
        p_commission_rate: location.commission_rate,
        p_expenses: expenses,
        p_coin_exchange: coinExchange
      });

      if (error) throw error;

      if (data) {
        setFinance(data);
        setIsAuthoritative(true);
      }
    } catch (err) {
      console.warn('RPC calculation failed, falling back to local:', err);
      setIsAuthoritative(false);
      // Update with local logic if RPC fails
      setFinance({
        revenue: localRevenue,
        commission: localCommission,
        owner_retention: localOwnerRetention,
        net_payable: localNetPayable
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuthoritativeFinance();
  }, [currentScore, previousScore, expenses, coinExchange]);

  useEffect(() => {
    if (onComplete) {
      onComplete({
        ...finance,
        expenses,
        coinExchange,
        remarks,
        is_authoritative: isAuthoritative
      });
    }
  }, [finance, expenses, coinExchange, remarks, isAuthoritative]);

  return (
    <div className='bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-6'>
      <div className='flex justify-between items-center'>
        <h2 className='text-xl font-bold text-slate-800'>Finance Summary</h2>
        <span className={}>
          {isAuthoritative ? '🛡️ Authoritative' : '⚠️ Local Fallback'}
        </span>
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <div className='p-3 bg-slate-50 rounded-lg'>
          <p className='text-xs font-bold text-slate-400 uppercase'>Revenue</p>
          <p className='text-lg font-black text-slate-700'>{finance.revenue.toLocaleString()}</p>
        </div>
        <div className='p-3 bg-slate-50 rounded-lg'>
          <p className='text-xs font-bold text-slate-400 uppercase'>Commission</p>
          <p className='text-lg font-black text-slate-700'>{finance.commission.toLocaleString()}</p>
        </div>
      </div>

      <div className='space-y-4'>
        <div>
          <label className='block text-xs font-bold text-slate-500 uppercase mb-1'>Expenses (TZS)</label>
          <input
            type='number'
            value={expenses}
            onChange={(e) => setExpenses(Number(e.target.value))}
            className='w-full p-3 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-lg outline-none transition-all'
            placeholder='0'
          />
        </div>
        <div>
          <label className='block text-xs font-bold text-slate-500 uppercase mb-1'>Coin Exchange (TZS)</label>
          <input
            type='number'
            value={coinExchange}
            onChange={(e) => setCoinExchange(Number(e.target.value))}
            className='w-full p-3 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-lg outline-none transition-all'
            placeholder='0'
          />
        </div>
        <div>
          <label className='block text-xs font-bold text-slate-500 uppercase mb-1'>Remarks</label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className='w-full p-3 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-lg outline-none transition-all'
            placeholder='Optional notes...'
            rows={2}
          />
        </div>
      </div>

      <div className='pt-4 border-t border-slate-100'>
        <div className='flex justify-between items-center p-4 bg-blue-600 rounded-xl text-white'>
          <span className='font-bold'>Net Payable</span>
          <span className='text-2xl font-black'>
            {loading ? '...' : finance.net_payable.toLocaleString()} TZS
          </span>
        </div>
      </div>
    </div>
  );
};

export default FinanceSummary;