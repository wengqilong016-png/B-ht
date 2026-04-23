import { AlertTriangle, RefreshCw, Trash2, XCircle } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  classifyError,
  discardDeadLetterItem,
  getDeadLetterItems,
  replayDeadLetterItem,
} from '../offlineQueue';
import { createPayoutRequest, createResetRequest } from '../repositories/requestRepository';
import { submitCollectionV2 } from '../services/collectionSubmissionService';
import { supabase } from '../supabaseClient';

import type { QueueMeta } from '../offlineQueue';
import type { Transaction } from '../types';

type DeadLetterEntry = Transaction & Partial<QueueMeta>;

function formatDate(value: string | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function isPermanentlyBlocked(entry: DeadLetterEntry): boolean {
  if (entry.lastErrorCategory === 'permanent') return true;
  if (!entry.lastError) return false;
  return classifyError(entry.lastError) === 'permanent';
}

const AdminDeadLetterPage: React.FC = () => {
  const [items, setItems] = useState<DeadLetterEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    const nextItems = await getDeadLetterItems();
    setItems(nextItems as DeadLetterEntry[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const summary = useMemo(() => {
    const permanent = items.filter(isPermanentlyBlocked).length;
    return {
      total: items.length,
      permanent,
      replayable: items.length - permanent,
    };
  }, [items]);

  const handleReplay = async (entry: DeadLetterEntry) => {
    if (!supabase || isPermanentlyBlocked(entry)) return;
    setBusyId(entry.id);
    setMessage(null);
    const result = await replayDeadLetterItem(entry.id, {
      supabaseClient: supabase,
      submitCollection: submitCollectionV2,
      submitResetRequest: createResetRequest,
      submitPayoutRequest: createPayoutRequest,
    });
    setMessage(result.success ? '重放成功 / Replay succeeded' : result.error);
    setBusyId(null);
    await loadItems();
  };

  const handleDiscard = async (entry: DeadLetterEntry) => {
    setBusyId(entry.id);
    setMessage(null);
    const discarded = await discardDeadLetterItem(entry.id);
    setMessage(discarded ? '已丢弃 / Discarded' : '丢弃失败 / Discard failed');
    setBusyId(null);
    await loadItems();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-10">
      <div className="rounded-card border border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-caption font-black uppercase tracking-[0.22em] text-rose-600">Dead-letter queue</p>
            <h2 className="mt-1 text-xl font-black text-slate-900">同步失败处理</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">
              永久错误不能重放；修复源数据后可丢弃本机死信记录。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadItems()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { label: '总数', value: summary.total, tone: 'text-slate-900' },
          { label: '无法重放', value: summary.permanent, tone: 'text-rose-600' },
          { label: '可重试', value: summary.replayable, tone: 'text-amber-600' },
        ].map(item => (
          <div key={item.label} className="rounded-card border border-slate-200 bg-white px-4 py-3">
            <p className="text-caption font-black uppercase tracking-wide text-slate-400">{item.label}</p>
            <p className={`mt-1 text-2xl font-black ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {message && (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          {message}
        </div>
      )}

      <div className="rounded-card border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <AlertTriangle size={16} className="text-rose-600" />
          <p className="text-sm font-black text-slate-900">待处理记录</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-slate-50 text-caption font-black uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">记录</th>
                <th className="px-4 py-3">机器/司机</th>
                <th className="px-4 py-3">错误</th>
                <th className="px-4 py-3">分类</th>
                <th className="px-4 py-3">入队时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(entry => {
                const permanent = isPermanentlyBlocked(entry);
                const busy = busyId === entry.id;
                return (
                  <tr key={entry.id} className="text-xs font-bold text-slate-600">
                    <td className="px-4 py-3">
                      <p className="font-black text-slate-900">{entry.id}</p>
                      <p className="mt-1 text-caption uppercase text-slate-400">{entry.type ?? 'collection'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{entry.locationName || entry.locationId}</p>
                      <p className="mt-1 text-caption uppercase text-slate-400">{entry.driverName || entry.driverId}</p>
                    </td>
                    <td className="max-w-sm px-4 py-3">
                      <p className="line-clamp-2">{entry.lastError || '-'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-caption font-black uppercase ${
                        permanent ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {permanent && <XCircle size={12} />}
                        {permanent ? 'permanent' : 'transient'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatDate(entry._queuedAt || entry.timestamp)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busy || permanent || !supabase}
                          onClick={() => void handleReplay(entry)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-caption font-black uppercase text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <RefreshCw size={12} />
                          {permanent ? '无法重放' : 'Replay'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDiscard(entry)}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-caption font-black uppercase text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 size={12} />
                          丢弃
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs font-black uppercase tracking-wide text-slate-400">
                    当前没有 dead-letter 记录
                  </td>
                </tr>
              )}
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs font-black uppercase tracking-wide text-slate-400">
                    Loading...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDeadLetterPage;
