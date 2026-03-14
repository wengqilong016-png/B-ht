import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Driver } from '../types';
import { flushQueue, getPendingCount } from '../offlineQueue';

interface ProfilePageProps {
  driver: Driver;
  isOnline: boolean;
  onLogout: () => void;
  onUserUpdate: (driver: Driver) => void;
}

export default function ProfilePage({ driver, isOnline, onLogout, onUserUpdate }: ProfilePageProps) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    getPendingCount().then(setPendingCount);
  }, []);

  const handleSync = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await flushQueue(supabase);
      const count = await getPendingCount();
      setPendingCount(count);
      setSyncResult(`✅ 同步完成 / Imesawazishwa: ${result.synced} 成功, ${result.failed} 失败`);
    } catch {
      setSyncResult('❌ 同步失败 / Imeshindwa kusawazisha');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    await onLogout();
  };

  const formatTZS = (n: number) =>
    n.toLocaleString('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 });

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold text-slate-100">👤 我的 / Mimi</h1>

      {/* Driver Info */}
      <div className="bg-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center text-slate-900 text-xl font-bold">
            {driver.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="font-bold text-slate-100 text-base">{driver.name}</h2>
            <p className="text-slate-400 text-sm">{driver.username}</p>
          </div>
        </div>

        <div className="border-t border-slate-700 pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">📱 电话 / Simu</span>
            <span className="text-slate-100">{driver.phone || '—'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">💰 未还债务 / Deni</span>
            <span className="text-red-400 font-mono font-bold">{formatTZS(driver.remainingDebt)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">🪙 每日零钱 / Sarafu za kila siku</span>
            <span className="text-amber-400 font-mono font-bold">
              {formatTZS(driver.dailyFloatingCoins)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">📡 状态 / Hali</span>
            <span className={`font-medium ${isOnline ? 'text-green-400' : 'text-yellow-400'}`}>
              {isOnline ? '在线 / Mtandaoni' : '离线 / Nje ya mtandao'}
            </span>
          </div>
        </div>
      </div>

      {/* Sync Status */}
      <div className="bg-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-300">
              ⏳ 待同步 / Inasubiri sync
            </h3>
            <p className="text-2xl font-bold text-amber-400">{pendingCount}</p>
          </div>
          <button
            onClick={handleSync}
            disabled={!isOnline || isSyncing}
            className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-semibold rounded-lg px-4 flex items-center gap-2"
            style={{ minHeight: '44px' }}
          >
            {isSyncing ? (
              <>
                <span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                <span>同步中...</span>
              </>
            ) : (
              <span>手动同步 / Sawazisha</span>
            )}
          </button>
        </div>

        {syncResult && (
          <p className="text-sm text-slate-300 mt-2">{syncResult}</p>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full bg-red-900/40 hover:bg-red-900/60 border border-red-700 text-red-400 font-semibold rounded-xl transition-colors"
        style={{ minHeight: '52px', fontSize: '16px' }}
      >
        退出登录 / Toka
      </button>
    </div>
  );
}
