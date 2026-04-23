import { History, ChevronDown, ChevronUp } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAriaButton } from '../../src/hooks/useAriaButton'

import { fetchFinanceAuditLog } from '../../services/financeAuditService';
import { TRANSLATIONS, FinanceAuditLog, FinanceAuditEventType } from '../../types';

interface FinanceAuditPanelProps {
  lang: 'zh' | 'sw';
}

const EVENT_LABEL: Record<FinanceAuditEventType, { zh: string; sw: string }> = {
  startup_debt_recovery: { zh: '回收铺底资金', sw: 'Startup Debt Recovery' },
  driver_debt_change:    { zh: '调整司机借款', sw: 'Driver Debt Adjustment' },
  commission_rate_change:{ zh: '调整佣金比例', sw: 'Commission Rate Change' },
  startup_debt_edit:     { zh: '编辑铺底债务', sw: 'Startup Debt Edit' },
  floating_coins_change: { zh: '调整流动硬币', sw: 'Floating Coins Change' },
  force_clear_blockers:  { zh: '强制清除阻塞', sw: 'Force Clear Blockers' },
  location_delete:       { zh: '删除机器点位', sw: 'Location Deletion' },
};

function formatValue(eventType: FinanceAuditEventType, val: number | null): string {
  if (val == null) return '—';
  if (eventType === 'commission_rate_change') return `${(val * 100).toFixed(1)}%`;
  return `TZS ${val.toLocaleString()}`;
}

function timeAgo(iso: string, lang: 'zh' | 'sw'): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return lang === 'zh' ? '刚刚' : 'just now';
  if (mins < 60) return lang === 'zh' ? `${mins}分钟前` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === 'zh' ? `${hrs}小时前` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return lang === 'zh' ? `${days}天前` : `${days}d ago`;
}

const FinanceAuditPanel: React.FC<FinanceAuditPanelProps> = ({ lang }) => {
  const t = TRANSLATIONS[lang];
  const [entries, setEntries] = useState<FinanceAuditLog[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchFinanceAuditLog({ limit: 30 }).then(data => {
      if (!cancelled) setEntries(data);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open]);

  return (
    <div className="rounded-card border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History size={16} className="text-slate-500" />
          <span className="text-xs font-black uppercase tracking-widest text-slate-600">{t.auditLog}</span>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="py-6 text-center text-xs text-slate-400 font-bold">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400 font-bold">{t.auditLogEmpty}</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {entries.map(e => (
                <li key={e.id} className="px-5 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-caption font-black text-slate-700 truncate">
                      {EVENT_LABEL[e.event_type]?.[lang] ?? e.event_type}
                    </p>
                    <p className="text-caption text-slate-400 truncate">
                      {e.entity_name ?? e.entity_id}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-caption font-bold">
                      <span className="text-red-500">{formatValue(e.event_type, e.old_value)}</span>
                      <span className="text-slate-300 mx-1">→</span>
                      <span className="text-emerald-600">{formatValue(e.event_type, e.new_value)}</span>
                    </p>
                    <p className="text-caption text-slate-400">{timeAgo(e.created_at, lang)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default FinanceAuditPanel;
