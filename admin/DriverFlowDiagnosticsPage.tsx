import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, DatabaseBackup, Route, Users } from 'lucide-react';
import React, { useMemo } from 'react';

import { useAppData } from '../contexts/DataContext';
import { fetchDriverFlowEvents } from '../services/driverFlowTelemetry';
import { getTodayLocalDate } from '../utils/dateUtils';

import type { DriverFlowEvent, DriverFlowStep } from '../types/models';

const STEP_LABELS: Record<DriverFlowStep, string> = {
  selection: '选择机器',
  capture: '拍照读数',
  amounts: '金额确认',
  confirm: '提交确认',
  complete: '完成',
  reset_request: '重置申请',
  payout_request: '提现申请',
  office_loan: '办公室借款',
  site_info: '补充资料',
};

interface DriverFlowSummary {
  driverId: string;
  driverName: string;
  started: number;
  completed: number;
  offlineQueued: number;
  failed: number;
  abandoned: number;
  avgDurationMs: number | null;
  topExitStep: DriverFlowStep | null;
  lastEventAt: string | null;
}

function groupByFlow(events: DriverFlowEvent[]): Map<string, DriverFlowEvent[]> {
  const grouped = new Map<string, DriverFlowEvent[]>();
  for (const event of events) {
    const list = grouped.get(event.flowId) ?? [];
    list.push(event);
    grouped.set(event.flowId, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  return grouped;
}

function summarizeDriverFlows(
  events: DriverFlowEvent[],
  driverNameById: Map<string, string>,
): DriverFlowSummary[] {
  const flowGroups = groupByFlow(events);
  const summaryByDriver = new Map<string, DriverFlowSummary & { exitCounts: Map<DriverFlowStep, number>; durationTotal: number; durationCount: number }>();

  const ensureSummary = (driverId: string) => {
    const existing = summaryByDriver.get(driverId);
    if (existing) return existing;
    const next = {
      driverId,
      driverName: driverNameById.get(driverId) ?? driverId,
      started: 0,
      completed: 0,
      offlineQueued: 0,
      failed: 0,
      abandoned: 0,
      avgDurationMs: null,
      topExitStep: null,
      lastEventAt: null,
      exitCounts: new Map<DriverFlowStep, number>(),
      durationTotal: 0,
      durationCount: 0,
    };
    summaryByDriver.set(driverId, next);
    return next;
  };

  for (const flowEvents of flowGroups.values()) {
    const first = flowEvents[0];
    const last = flowEvents[flowEvents.length - 1];
    if (!first || !last) continue;

    const summary = ensureSummary(first.driverId);
    const hasStart = flowEvents.some(event => event.eventName === 'machine_selected' || event.eventName === 'draft_resumed');
    const hasComplete = flowEvents.some(event => event.eventName === 'submit_success');
    const hasOffline = flowEvents.some(event => event.eventName === 'submit_offline_queued');
    const hasFailure = flowEvents.some(event => event.eventName === 'submit_failed' || event.eventName === 'submit_validation_error');

    if (hasStart) summary.started += 1;
    if (hasComplete) summary.completed += 1;
    if (hasOffline) summary.offlineQueued += 1;
    if (hasFailure) summary.failed += 1;
    if (hasStart && !hasComplete && !hasOffline && !hasFailure) {
      summary.abandoned += 1;
      summary.exitCounts.set(last.step, (summary.exitCounts.get(last.step) ?? 0) + 1);
    }

    const durationMs = new Date(last.createdAt).getTime() - new Date(first.createdAt).getTime();
    if (durationMs > 0 && (hasComplete || hasOffline)) {
      summary.durationTotal += durationMs;
      summary.durationCount += 1;
    }
    if (!summary.lastEventAt || new Date(last.createdAt) > new Date(summary.lastEventAt)) {
      summary.lastEventAt = last.createdAt;
    }
  }

  return Array.from(summaryByDriver.values())
    .map((summary) => {
      let topExitStep: DriverFlowStep | null = null;
      let topExitCount = 0;
      for (const [step, count] of summary.exitCounts.entries()) {
        if (count > topExitCount) {
          topExitStep = step;
          topExitCount = count;
        }
      }
      return {
        ...summary,
        avgDurationMs: summary.durationCount > 0 ? Math.round(summary.durationTotal / summary.durationCount) : null,
        topExitStep,
      };
    })
    .sort((a, b) => (b.started + b.failed + b.abandoned) - (a.started + a.failed + a.abandoned));
}

function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function payloadText(payload: Record<string, unknown>, key: string, fallback = '—'): string {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function payloadNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  const parsed = typeof value === 'number' ? value : Number(value ?? NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPayloadMoney(payload: Record<string, unknown>, key: string): string {
  const value = payloadNumber(payload, key);
  return value === null ? '—' : `TZS ${value.toLocaleString()}`;
}

function formatScoreLine(payload: Record<string, unknown>): string {
  const previous = payloadNumber(payload, 'previousScore');
  const current = payloadNumber(payload, 'currentScore');
  return `${previous === null ? '—' : previous.toLocaleString()} → ${current === null ? '—' : current.toLocaleString()}`;
}

const DriverFlowDiagnosticsPage: React.FC = () => {
  const { drivers } = useAppData();
  const today = getTodayLocalDate();
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['driverFlowEvents'],
    queryFn: () => fetchDriverFlowEvents(800),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const driverNameById = useMemo(
    () => new Map(drivers.map(driver => [driver.id, driver.name])),
    [drivers],
  );

  const todayEvents = useMemo(
    () => events.filter(event => event.createdAt.startsWith(today)),
    [events, today],
  );

  const summaries = useMemo(
    () => summarizeDriverFlows(todayEvents, driverNameById),
    [todayEvents, driverNameById],
  );

  const totals = useMemo(() => summaries.reduce(
    (acc, summary) => ({
      started: acc.started + summary.started,
      completed: acc.completed + summary.completed,
      offlineQueued: acc.offlineQueued + summary.offlineQueued,
      failed: acc.failed + summary.failed,
      abandoned: acc.abandoned + summary.abandoned,
    }),
    { started: 0, completed: 0, offlineQueued: 0, failed: 0, abandoned: 0 },
  ), [summaries]);

  const recentFailures = todayEvents
    .filter(event => event.eventName === 'submit_failed' || event.eventName === 'submit_validation_error')
    .slice(0, 8);

  const recentSubmitEvents = todayEvents
    .filter(event => event.eventName === 'submit_success' || event.eventName === 'submit_offline_queued' || event.eventName === 'submit_failed')
    .slice(0, 12);

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-10">
      <div className="rounded-card border border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-caption font-black uppercase tracking-[0.22em] text-amber-600">Driver flow diagnostics</p>
            <h2 className="mt-1 text-xl font-black text-slate-900">司机使用卡点</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">
              只统计流程事件，不记录照片内容、精确 GPS 或电话。
            </p>
          </div>
          <div className="rounded-subcard bg-slate-50 px-3 py-2 text-right">
            <p className="text-caption font-black uppercase text-slate-400">日期</p>
            <p className="text-sm font-black text-slate-900">{today}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[
          { label: '开始收款', value: totals.started, icon: <Route size={16} />, tone: 'text-slate-700' },
          { label: '云端完成', value: totals.completed, icon: <CheckCircle2 size={16} />, tone: 'text-emerald-600' },
          { label: '离线待同步', value: totals.offlineQueued, icon: <DatabaseBackup size={16} />, tone: 'text-amber-600' },
          { label: '失败/校验拦截', value: totals.failed, icon: <AlertTriangle size={16} />, tone: 'text-rose-600' },
          { label: '开始后未完成', value: totals.abandoned, icon: <Clock size={16} />, tone: 'text-slate-600' },
        ].map(item => (
          <div key={item.label} className="rounded-card border border-slate-200 bg-white px-4 py-3">
            <div className={`mb-2 inline-flex rounded-subcard bg-slate-50 p-2 ${item.tone}`}>{item.icon}</div>
            <p className="text-caption font-black uppercase tracking-wide text-slate-400">{item.label}</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-card border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Users size={16} className="text-amber-600" />
          <p className="text-sm font-black text-slate-900">司机漏斗</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50 text-caption font-black uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">司机</th>
                <th className="px-4 py-3">开始</th>
                <th className="px-4 py-3">完成</th>
                <th className="px-4 py-3">离线</th>
                <th className="px-4 py-3">失败</th>
                <th className="px-4 py-3">未完成</th>
                <th className="px-4 py-3">常见退出步骤</th>
                <th className="px-4 py-3">平均耗时</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summaries.map(summary => (
                <tr key={summary.driverId} className="text-xs font-bold text-slate-600">
                  <td className="px-4 py-3 font-black text-slate-900">{summary.driverName}</td>
                  <td className="px-4 py-3">{summary.started}</td>
                  <td className="px-4 py-3 text-emerald-600">{summary.completed}</td>
                  <td className="px-4 py-3 text-amber-600">{summary.offlineQueued}</td>
                  <td className="px-4 py-3 text-rose-600">{summary.failed}</td>
                  <td className="px-4 py-3">{summary.abandoned}</td>
                  <td className="px-4 py-3">{summary.topExitStep ? STEP_LABELS[summary.topExitStep] : '—'}</td>
                  <td className="px-4 py-3">{formatDuration(summary.avgDurationMs)}</td>
                </tr>
              ))}
              {!isLoading && summaries.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-xs font-black uppercase tracking-wide text-slate-400">
                    今日暂无司机流程事件
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {recentSubmitEvents.length > 0 && (
        <div className="rounded-card border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-black text-slate-900">最近提交明细</p>
            <p className="text-caption font-black uppercase tracking-wide text-slate-400">success / offline / failed</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead className="bg-slate-50 text-caption font-black uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">时间</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">司机</th>
                  <th className="px-4 py-3">机器</th>
                  <th className="px-4 py-3">分数</th>
                  <th className="px-4 py-3">营业额</th>
                  <th className="px-4 py-3">应付</th>
                  <th className="px-4 py-3">交易号/原因</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentSubmitEvents.map(event => {
                  const payload = event.payload ?? {};
                  const statusTone = event.eventName === 'submit_success'
                    ? 'bg-emerald-50 text-emerald-700'
                    : event.eventName === 'submit_offline_queued'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-rose-50 text-rose-700';
                  const statusLabel = event.eventName === 'submit_success'
                    ? '云端成功'
                    : event.eventName === 'submit_offline_queued'
                      ? '离线待同步'
                      : '失败';
                  return (
                    <tr key={event.id} className="text-xs font-bold text-slate-600">
                      <td className="px-4 py-3">{new Date(event.createdAt).toLocaleTimeString()}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 font-black ${statusTone}`}>{statusLabel}</span></td>
                      <td className="px-4 py-3 font-black text-slate-900">{payloadText(payload, 'driverName', driverNameById.get(event.driverId) ?? event.driverId)}</td>
                      <td className="px-4 py-3">{payloadText(payload, 'locationName', event.locationId ?? '—')}</td>
                      <td className="px-4 py-3">{formatScoreLine(payload)}</td>
                      <td className="px-4 py-3">{formatPayloadMoney(payload, 'revenue')}</td>
                      <td className="px-4 py-3">{formatPayloadMoney(payload, 'netPayable')}</td>
                      <td className="px-4 py-3 max-w-[240px] truncate">
                        {payloadText(payload, 'txId', event.draftTxId ?? '—')}
                        {event.errorCategory ? ` · ${event.errorCategory}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recentFailures.length > 0 && (
        <div className="rounded-card border border-rose-100 bg-rose-50 px-4 py-3">
          <p className="text-caption font-black uppercase tracking-[0.2em] text-rose-600">Recent blockers</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {recentFailures.map(event => (
              <div key={event.id} className="rounded-subcard bg-white px-3 py-2 text-xs font-bold text-slate-600">
                <p className="font-black text-slate-900">{driverNameById.get(event.driverId) ?? event.driverId}</p>
                <p className="mt-1">{STEP_LABELS[event.step]} · {event.errorCategory || event.eventName}</p>
                <p className="mt-1 text-caption font-black uppercase text-slate-400">
                  {new Date(event.createdAt).toLocaleTimeString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverFlowDiagnosticsPage;
