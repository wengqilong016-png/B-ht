import React, { useMemo } from 'react';
import { Transaction, Driver, Location, DailySettlement } from '../../types';

interface Props {
  transactions: Transaction[];
  drivers: Driver[];
  locations: Location[];
  dailySettlements: DailySettlement[];
}

const OperationsOverview: React.FC<Props> = ({ transactions, drivers, locations, dailySettlements }) => {
  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Single pass: accumulate today's transaction count and revenue together
    let todayCount = 0, todayRevenue = 0;
    for (const t of transactions) {
      if (t.timestamp.startsWith(todayStr)) {
        todayCount++;
        todayRevenue += t.revenue || 0;
      }
    }

    // Single pass: count pending approvals across settlements and transactions
    let pendingCount = 0;
    for (const s of dailySettlements) {
      if (!s.isSynced) pendingCount++;
    }
    for (const t of transactions) {
      if (t.type === 'payout_request' && !t.isSynced) pendingCount++;
    }
    
    return [
      { 
        label: '今日交易数', 
        value: todayCount, 
        color: 'text-blue-500',
        desc: '今日完成采集次数'
      },
      { 
        label: '今日收入', 
        value: `$${todayRevenue.toLocaleString()}`, 
        color: 'text-green-500',
        desc: '今日总 revenue'
      },
      { 
        label: '在线司机', 
        value: drivers.filter(d => d.lastActive && (Date.now() - new Date(d.lastActive).getTime() < 600000)).length, 
        color: 'text-indigo-500',
        desc: '10分钟内活跃'
      },
      { 
        label: '待审批', 
        value: pendingCount, 
        color: 'text-yellow-500',
        desc: 'Pending Approval'
      },
      { 
        label: '异常交易', 
        value: transactions.filter(t => t.isAnomaly).length, 
        color: 'text-red-500',
        desc: '需要介入处理'
      },
      { 
        label: '滞留机器', 
        value: locations.filter(l => {
          if (!l.lastRevenueDate) return true;
          const days = (Date.now() - new Date(l.lastRevenueDate).getTime()) / (1000 * 60 * 60 * 24);
          return days > 7;
        }).length, 
        color: 'text-orange-500',
        desc: '超过7天未采集'
      }
    ];
  }, [transactions, drivers, locations, dailySettlements]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
      {stats.map((s, i) => (
        <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{s.label}</p>
          <p className={`text-2xl font-black ${s.color} mb-1`}>{s.value}</p>
          <p className="text-[9px] text-slate-400 leading-tight">{s.desc}</p>
        </div>
      ))}
    </div>
  );
};

export default OperationsOverview;
