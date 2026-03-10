import React, { useMemo } from 'react';
import { Transaction, DailySettlement } from '../../types';
import { CheckSquare, DollarSign, RotateCcw, FileText, ChevronRight } from 'lucide-react';

/**
 * Phase 3: Admin Dashboard - Action Queue
 * A unified inbox for all pending approvals across the system.
 */

interface Props {
  transactions: Transaction[];
  dailySettlements: DailySettlement[];
}

type ActionItem = {
  id: string;
  type: 'settlement' | 'reset_request' | 'payout_request' | 'expense';
  title: string;
  subtitle: string;
  amount?: number;
  timestamp: string;
  urgent: boolean;
};

const ActionQueue: React.FC<Props> = ({ transactions, dailySettlements }) => {
  const queue = useMemo(() => {
    const items: ActionItem[] = [];

    // 1. Pending Settlements
    dailySettlements.filter(s => s.status === 'pending').forEach(s => {
      items.push({
        id: s.id,
        type: 'settlement',
        title: 'Daily Settlement Review',
        subtitle: s.driverName || 'Unknown Driver',
        amount: s.actualCash + s.actualCoins,
        timestamp: s.timestamp || s.date,
        urgent: s.shortage > 0
      });
    });

    // 2. Pending Transactions (Resets, Payouts, Expenses)
    transactions.filter(t => t.approvalStatus === 'pending').forEach(t => {
      let title = 'Pending Review';
      let urgent = false;
      let amount = 0;

      if (t.type === 'reset_request') {
        title = 'Score Reset (9999)';
        urgent = true; // Blocks the machine
      } else if (t.type === 'payout_request') {
        title = 'Dividend Payout';
        amount = t.payoutAmount || 0;
      } else if (t.type === 'expense' || t.expenseStatus === 'pending') {
        title = 'Expense Claim';
        amount = t.expenses || 0;
      }

      items.push({
        id: t.id,
        type: (t.type as any) || 'expense', // Fallback
        title,
        subtitle: `${t.locationName} • ${t.driverName}`,
        amount,
        timestamp: t.timestamp,
        urgent
      });
    });

    // Sort: Urgent first, then oldest first
    return items.sort((a, b) => {
      if (a.urgent && !b.urgent) return -1;
      if (!a.urgent && b.urgent) return 1;
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
  }, [transactions, dailySettlements]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'settlement': return <FileText size={18} className="text-blue-500" />;
      case 'reset_request': return <RotateCcw size={18} className="text-red-500" />;
      case 'payout_request': return <DollarSign size={18} className="text-green-500" />;
      default: return <FileText size={18} className="text-slate-500" />;
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center space-x-2">
          <CheckSquare className="text-indigo-500" />
          <span>Action Queue</span>
        </h2>
        <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded-full">
          {queue.length} Pending
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <CheckSquare size={32} className="mb-2 opacity-50" />
            <p className="text-sm font-bold">Inbox zero! Good job.</p>
          </div>
        ) : (
          queue.map(item => (
            <div 
              key={item.id} 
              className={`p-3 rounded-xl border flex items-center justify-between transition-colors hover:bg-slate-50 cursor-pointer ${item.urgent ? 'border-red-200 bg-red-50/30' : 'border-slate-100'}`}
            >
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg bg-white shadow-sm border ${item.urgent ? 'border-red-100' : 'border-slate-100'}`}>
                  {getIcon(item.type)}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-bold text-slate-900 leading-tight">{item.title}</p>
                    {item.urgent && (
                      <span className="text-[8px] font-black uppercase tracking-widest text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                        Urgent
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5">{item.subtitle}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                {item.amount !== undefined && item.amount > 0 && (
                  <p className="text-sm font-black text-slate-700">${item.amount.toLocaleString()}</p>
                )}
                <ChevronRight size={16} className="text-slate-300" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ActionQueue;
