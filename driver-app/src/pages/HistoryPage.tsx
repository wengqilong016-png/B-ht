import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Driver, Transaction } from '../types';
import { getAllPending } from '../offlineQueue';

interface HistoryPageProps {
  driver: Driver;
  isOnline: boolean;
}

export default function HistoryPage({ driver, isOnline }: HistoryPageProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const [pending, serverData] = await Promise.allSettled([
        getAllPending(),
        isOnline
          ? supabase
              .from('transactions')
              .select(
                'id, timestamp, locationName, driverId, revenue, commission, netPayable, expenses, coinExchange, notes, isSynced'
              )
              .eq('driverId', driver.id)
              .order('timestamp', { ascending: false })
              .limit(30)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const pendingTxs: Transaction[] =
        pending.status === 'fulfilled' ? pending.value : [];

      const serverTxs: Transaction[] =
        serverData.status === 'fulfilled' &&
        serverData.value &&
        'data' in serverData.value &&
        serverData.value.data
          ? (serverData.value.data as Transaction[]).map((t) => ({ ...t, isSynced: true }))
          : [];

      // Merge: server records take priority; pending ones not on server shown with ⏳
      const serverIds = new Set(serverTxs.map((t) => t.id));
      const offlineOnly = pendingTxs.filter((t) => !serverIds.has(t.id));

      const merged = [...offlineOnly, ...serverTxs].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setTransactions(merged.slice(0, 30));
    } catch {
      // leave as-is
    } finally {
      setIsLoading(false);
    }
  }, [driver.id, isOnline]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const formatDate = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  const formatTZS = (n: number) =>
    n.toLocaleString('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 });

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-slate-100">📋 历史 / Historia</h1>
        <button
          onClick={loadHistory}
          className="text-amber-500 text-sm p-2"
          style={{ minWidth: '44px', minHeight: '44px' }}
        >
          🔄
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p className="text-4xl mb-3">📭</p>
          <p>暂无记录 / Hakuna rekodi</p>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="bg-slate-800 rounded-xl p-4 flex items-start justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{tx.isSynced ? '✅' : '⏳'}</span>
                  <span className="text-slate-100 font-medium text-sm truncate">
                    {tx.locationName || '—'}
                  </span>
                </div>
                <p className="text-slate-400 text-xs">{formatDate(tx.timestamp)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-amber-400 font-bold font-mono">
                  {formatTZS(tx.netPayable ?? 0)}
                </p>
                <p className="text-slate-500 text-xs">
                  {tx.isSynced ? '已同步 / Imesawazishwa' : '待同步 / Inasubiri'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
