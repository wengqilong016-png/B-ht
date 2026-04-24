import { BotMessageSquare, X, CheckCircle2, AlertTriangle, Info, WifiOff, Clock } from 'lucide-react';
import React, { useState, useMemo } from 'react';

import { getTodayLocalDate } from '../../utils/dateUtils';

import type { Transaction, Location, DailySettlement } from '../../types';

interface Check {
  id: string;
  level: 'ok' | 'warn' | 'info';
  message: string;
}

interface Props {
  lang: 'zh' | 'sw';
  isOnline: boolean;
  unsyncedCount: number;
  filteredLocations: Location[];
  filteredTransactions: Transaction[];
  filteredSettlements: DailySettlement[];
  activeDriverId: string;
}

function runChecks(props: Props): Check[] {
  const { isOnline, unsyncedCount, filteredLocations, filteredTransactions, filteredSettlements, activeDriverId, lang } = props;
  const checks: Check[] = [];
  const todayStr = getTodayLocalDate();

  // Offline / sync
  if (!isOnline) {
    checks.push({ id: 'offline', level: 'warn', message: lang === 'zh' ? '当前离线，数据将在网络恢复后自动同步' : 'Nje ya mtandao — data itasawazishwa baadaye' });
  } else if (unsyncedCount > 3) {
    checks.push({ id: 'unsynced', level: 'warn', message: lang === 'zh' ? `有 ${unsyncedCount} 条记录待同步，请保持网络畅通` : `Rekodi ${unsyncedCount} zinasubiri usawazishaji` });
  } else if (unsyncedCount > 0) {
    checks.push({ id: 'unsynced-low', level: 'info', message: lang === 'zh' ? `${unsyncedCount} 条记录同步中…` : `Rekodi ${unsyncedCount} zinasawazishwa…` });
  }

  // No machines assigned
  if (filteredLocations.length === 0) {
    checks.push({ id: 'no-machines', level: 'warn', message: lang === 'zh' ? '尚未分配任何机器，请联系管理员' : 'Hakuna mashine zilizopewa — wasiliana na msimamizi' });
  }

  // Today's collection progress
  const todayTxs = filteredTransactions.filter(
    tx => tx.driverId === activeDriverId &&
    tx.timestamp?.startsWith(todayStr) &&
    (tx.type === undefined || tx.type === 'collection'),
  );
  const collectedIds = new Set(todayTxs.map(tx => tx.locationId));
  const uncollected = filteredLocations.filter(loc => !collectedIds.has(loc.id));

  if (filteredLocations.length > 0 && uncollected.length === 0) {
    checks.push({ id: 'all-done', level: 'ok', message: lang === 'zh' ? `今日 ${filteredLocations.length} 台机器全部完成收款 ✓` : `Mashine zote ${filteredLocations.length} zimekusanywa leo ✓` });
  } else if (uncollected.length > 0 && todayTxs.length > 0) {
    checks.push({ id: 'partial', level: 'info', message: lang === 'zh' ? `今日进度：${todayTxs.length}/${filteredLocations.length} 台已收款` : `Maendeleo ya leo: ${todayTxs.length}/${filteredLocations.length} zimekusanywa` });
  } else if (uncollected.length > 0 && todayTxs.length === 0) {
    checks.push({ id: 'none-today', level: 'info', message: lang === 'zh' ? `今日还未开始收款（共 ${filteredLocations.length} 台机器）` : `Bado kuanza kukusanya leo (mashine ${filteredLocations.length})` });
  }

  // Pending settlements
  const pendingSettlements = filteredSettlements.filter(
    s => s.driverId === activeDriverId && s.status === 'pending',
  );
  if (pendingSettlements.length > 0) {
    checks.push({ id: 'pending-settle', level: 'info', message: lang === 'zh' ? `${pendingSettlements.length} 条结算等待管理员审批` : `Makubaliano ${pendingSettlements.length} yanasubiri idhini` });
  }

  // Anomaly transactions
  const anomalyTxs = filteredTransactions.filter(
    tx => tx.driverId === activeDriverId && tx.isAnomaly,
  );
  if (anomalyTxs.length > 0) {
    checks.push({ id: 'anomaly', level: 'warn', message: lang === 'zh' ? `${anomalyTxs.length} 条交易被标记为异常，请关注` : `Miamala ${anomalyTxs.length} imewekwa alama ya wasiwasi` });
  }

  // All clear
  if (checks.filter(c => c.level !== 'ok').length === 0 && checks.length === 0) {
    checks.push({ id: 'all-ok', level: 'ok', message: lang === 'zh' ? '一切正常，继续加油！' : 'Kila kitu sawa — endelea!' });
  }

  return checks;
}

const LEVEL_ICON = {
  ok: <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />,
  warn: <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />,
  info: <Info size={13} className="text-amber-400 shrink-0 mt-0.5" />,
};

const DriverAIAssistPanel: React.FC<Props> = (props) => {
  const [open, setOpen] = useState(false);
  const {
    isOnline,
    unsyncedCount,
    filteredLocations,
    filteredTransactions,
    filteredSettlements,
    activeDriverId,
    lang,
  } = props;
  const checks = useMemo(() => runChecks({
    isOnline,
    unsyncedCount,
    filteredLocations,
    filteredTransactions,
    filteredSettlements,
    activeDriverId,
    lang,
  }), [
    isOnline,
    unsyncedCount,
    filteredLocations,
    filteredTransactions,
    filteredSettlements,
    activeDriverId,
    lang,
  ]);

  const warnCount = checks.filter(c => c.level === 'warn').length;

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed bottom-24 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-all lg:bottom-6 ${
          warnCount > 0
            ? 'bg-amber-500 text-white shadow-amber-300/50'
            : 'bg-amber-600 text-white shadow-amber-300/50'
        }`}
        aria-label="AI 助手"
        aria-expanded={open}
      >
        {warnCount > 0
          ? <WifiOff size={18} />
          : <BotMessageSquare size={18} />
        }
        {warnCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-caption font-black text-white">
            {warnCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-36 right-4 z-50 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl lg:bottom-20">
          <div className="flex items-center justify-between rounded-t-2xl bg-amber-600 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <BotMessageSquare size={15} className="text-white" />
              <p className="text-[11px] font-black uppercase tracking-wide text-white">
                {props.lang === 'zh' ? 'AI 状态助手' : 'Msaidizi wa AI'}
              </p>
            </div>
            <button
              aria-label="Close AI assistant" onClick={() => setOpen(false)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1.5 p-3">
            {checks.map(check => (
              <div key={check.id} className="flex items-start gap-2 rounded-xl bg-slate-50 px-2.5 py-2">
                {LEVEL_ICON[check.level]}
                <p className="text-[11px] font-semibold leading-tight text-slate-700">{check.message}</p>
              </div>
            ))}
            <div className="flex items-center gap-1.5 pt-1 text-caption font-bold uppercase text-slate-400">
              <Clock size={9} />
              <span>{props.lang === 'zh' ? '实时检测 · 本地运算' : 'Ukaguzi wa wakati halisi'}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DriverAIAssistPanel;
