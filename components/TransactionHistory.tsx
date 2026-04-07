
import React, { useState, useMemo } from 'react';
import { CheckCircle2, Filter, ChevronDown, WifiOff, AlertTriangle, Clock, Globe, Calculator, Search, BrainCircuit, ShieldAlert, Target, Sparkles, RefreshCw, CloudOff, XCircle } from 'lucide-react';
import { Transaction, getDistance, TRANSLATIONS } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/DataContext';
import { useMutations } from '../contexts/MutationContext';
import { useSyncStatus } from '../hooks/useSyncStatus';

interface TransactionHistoryProps {
  onAnalyze?: (txId: string) => void;
}

const TransactionHistory: React.FC<TransactionHistoryProps> = ({ onAnalyze = () => {} }) => {
  const { currentUser, lang } = useAuth();
  const { syncOfflineData } = useMutations();
  const { filteredTransactions: transactions, locations, isOnline, unsyncedCount: globalUnsyncedCount } = useAppData();
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showUnsyncedOnly, setShowUnsyncedOnly] = useState(false);
  const t = TRANSLATIONS[lang];
  const syncStatus = useSyncStatus({
    syncMutation: syncOfflineData,
    isOnline,
    unsyncedCount: globalUnsyncedCount,
    userId: currentUser.id,
  });

  const filteredTransactions = useMemo(() => {
    const locFilter = selectedLocation !== 'all';
    // .filter() produces a new array (no extra copy needed); when neither
    // filter is active, .slice() creates a copy so .sort() doesn't mutate
    // the source array.
    const result = (locFilter || showUnsyncedOnly)
      ? transactions.filter(tx => {
          if (locFilter && tx.locationName !== selectedLocation) return false;
          if (showUnsyncedOnly && tx.isSynced) return false;
          return true;
        })
      : transactions.slice();
    return result.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
  }, [transactions, selectedLocation, showUnsyncedOnly]);

  // Memoized so the filter doesn't run on every render (e.g. when a sibling
  // state like selectedLocation or viewMode changes).
  const unsyncedCount = useMemo(() => transactions.filter(t => !t.isSynced).length, [transactions]);

  // Memoized to avoid rebuilding the Set + Array on every render.
  const locationNames = useMemo(
    () => Array.from(new Set(transactions.map(tx => tx.locationName))).sort(),
    [transactions]
  );

  const hasGps = (tx: Transaction) =>
    tx.gps != null && Number.isFinite(tx.gps.lat) && Number.isFinite(tx.gps.lng);

  const syncMeta = {
    icon: syncStatus.state === 'offline'
      ? <CloudOff size={14} />
      : syncStatus.state === 'dead_letter'
      ? <XCircle size={14} />
      : syncStatus.state === 'retry_waiting'
      ? <RefreshCw size={14} />
      : syncStatus.state === 'failed'
      ? <AlertTriangle size={14} />
      : syncStatus.state === 'syncing'
      ? <RefreshCw size={14} className="animate-spin" />
      : <WifiOff size={14} />,
    className: syncStatus.state === 'offline'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : syncStatus.state === 'dead_letter'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : syncStatus.state === 'retry_waiting'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : syncStatus.state === 'failed'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : syncStatus.state === 'syncing'
      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
      : 'border-amber-200 bg-amber-50 text-amber-700',
    title: lang === 'zh'
      ? syncStatus.state === 'offline'
        ? '当前离线，新提交的记录会先排队。'
        : syncStatus.state === 'dead_letter'
        ? `有 ${syncStatus.deadLetterCount} 条记录超过重试上限，需要检查。`
        : syncStatus.state === 'retry_waiting'
        ? `${syncStatus.retryWaitingCount} 条记录正在等待下一次自动重试。`
        : syncStatus.state === 'failed'
        ? '最近一次同步失败，你可以立即重试。'
        : syncStatus.state === 'syncing'
        ? '系统正在同步本地记录。'
        : `${syncStatus.pendingCount} 条记录待同步。`
      : syncStatus.state === 'offline'
      ? 'You are offline. New records will stay queued for now.'
      : syncStatus.state === 'dead_letter'
      ? `${syncStatus.deadLetterCount} records need manual attention.`
      : syncStatus.state === 'retry_waiting'
      ? `${syncStatus.retryWaitingCount} records are waiting for the next retry window.`
      : syncStatus.state === 'failed'
      ? 'The last sync failed. You can retry now.'
      : syncStatus.state === 'syncing'
      ? 'The system is syncing local records now.'
      : `${syncStatus.pendingCount} records are waiting to sync.`,
  };

  const showSyncBanner = syncStatus.state !== 'synced' || globalUnsyncedCount > 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {showSyncBanner && (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-[28px] border p-4 shadow-sm ${syncMeta.className}`}>
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5">{syncMeta.icon}</div>
            <div className="min-w-0">
              <p className="text-caption font-black uppercase tracking-[0.2em]">
                {lang === 'zh' ? '同步状态' : 'Sync Status'}
              </p>
              <p className="mt-1 text-xs font-black">{syncMeta.title}</p>
            </div>
          </div>
          {syncStatus.isOnline && !syncStatus.isSyncing && (
            <button
              onClick={syncStatus.trigger}
              className="rounded-xl bg-slate-900 px-3 py-2 text-caption font-black uppercase text-white transition hover:bg-slate-800"
            >
              {lang === 'zh' ? '立即重试' : 'Retry Now'}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4 bg-white p-5 rounded-[32px] border border-slate-200 shadow-sm">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowUnsyncedOnly(!showUnsyncedOnly)}
              className={`px-4 py-2 rounded-xl text-caption font-black uppercase transition-all flex items-center gap-2 border ${showUnsyncedOnly ? 'bg-amber-50 border-amber-200 text-amber-600 shadow-md shadow-amber-100' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}
            >
              <WifiOff size={14} />
              <span className="hidden sm:inline">{t.unsyncedLabel}</span>
              <span className={`px-1.5 py-0.5 rounded-md text-caption min-w-[20px] text-center ${showUnsyncedOnly ? 'bg-amber-200 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{unsyncedCount}</span>
            </button>
          </div>

          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select 
              value={selectedLocation} 
              onChange={(e) => setSelectedLocation(e.target.value)} 
              className="bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-caption font-black text-slate-700 outline-none uppercase appearance-none min-w-[150px] shadow-sm focus:ring-2 focus:ring-indigo-500/20 transition-all"
            >
              <option value="all">{lang === 'zh' ? '所有点位汇总' : 'All Sites'}</option>
              {locationNames.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3">
          {filteredTransactions.map(tx => (
            <div key={tx.id} className="bg-white rounded-3xl border border-slate-200 overflow-hidden hover:border-indigo-300 transition-all group shadow-sm hover:shadow-md">
              <div className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 ${tx.isSynced ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-amber-50 border-amber-100 text-amber-600 shadow-inner animate-pulse'}`}>
                    {tx.isSynced ? <CheckCircle2 size={20} /> : <WifiOff size={20} />}
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-sm tracking-tight">{tx.locationName}</h4>
                    <div className="flex items-center gap-3 text-caption font-black text-slate-400 uppercase tracking-widest mt-1">
                      <div className="flex items-center gap-1"><Clock size={10} /> {new Date(tx.timestamp).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</div>
                      <div className="w-1 h-1 bg-slate-200 rounded-full"></div>
                      <div className="flex items-center gap-1 text-indigo-500"><Globe size={10} /> {tx.dataUsageKB} KB</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs font-black text-slate-400 uppercase mb-0.5">净营收</p>
                    <p className="text-sm font-black text-indigo-600">TZS {tx.netPayable.toLocaleString()}</p>
                  </div>
                  <button onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)} className={`p-2 rounded-xl transition-all ${expandedId === tx.id ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                    <ChevronDown size={18} className={`transition-transform duration-300 ${expandedId === tx.id ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
              {expandedId === tx.id && (
                <div className="px-5 pb-5 animate-in slide-in-from-top-2 duration-300">
                  <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calculator size={16} className="text-indigo-600" />
                          <h4 className="text-caption font-black text-slate-900 uppercase tracking-widest">收益清算明细</h4>
                        </div>
                        {tx.aiScore && (
                           <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 animate-in zoom-in-95">
                              <Sparkles size={12} className="text-indigo-600" />
                              <span className="text-caption font-black text-indigo-700 uppercase">AI 审计已确认</span>
                           </div>
                        )}
                      </div>
                      
                      {tx.aiScore && (
                        <div className="p-4 bg-white border-2 border-indigo-100 rounded-2xl space-y-3 shadow-lg shadow-indigo-50">
                           <div className="flex justify-between items-center border-b border-indigo-50 pb-2">
                              <span className="text-caption font-black text-slate-400 uppercase">AI 识别读数</span>
                              <span className="text-base font-black text-indigo-600">{tx.aiScore}</span>
                           </div>
                           <div className="flex justify-between items-center">
                              <span className="text-caption font-black text-slate-400 uppercase">数据吻合度</span>
                              <span className={`px-2 py-0.5 rounded text-caption font-black uppercase ${tx.isAnomaly ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                 {tx.isAnomaly ? '⚠ 存在读数差异' : '✅ 读数完全吻合'}
                              </span>
                           </div>
                           <div className="p-3 bg-slate-50 rounded-xl relative group">
                              <p className="text-caption font-bold text-slate-600 leading-relaxed italic">“ {tx.notes || '现场情况正常，建议入库。'} ”</p>
                              {tx.notes && (
                                <button 
                                  onClick={async (e) => {
                                    const btn = e.currentTarget;
                                    btn.innerHTML = '翻译中...';
                                    try {
                                      const { translateToChinese } = await import('../services/translateService');
                                      const res = await translateToChinese(tx.notes || '');
                                      btn.parentElement!.querySelector('p')!.innerText = `“ ${res} ”`;
                                      btn.style.display = 'none';
                                    } catch (err) {
                                      btn.innerHTML = '翻译失败';
                                    }
                                  }}
                                  className="absolute top-2 right-2 p-1.5 bg-indigo-100 text-indigo-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-caption font-black"
                                >
                                  <Globe size={10} /> 翻译
                                </button>
                              )}
                           </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex justify-between text-[11px] font-bold text-slate-500"><span>总收入 (Coins Value)</span><span>TZS {tx.revenue.toLocaleString()}</span></div>
                        <div className="flex justify-between text-[11px] font-bold text-emerald-600"><span>分红佣金 (+)</span><span>+ {tx.commission.toLocaleString()}</span></div>
                        <div className="flex justify-between text-[11px] font-bold text-rose-500"><span>日常支出 (-)</span><span>- {tx.expenses.toLocaleString()}</span></div>
                        <div className="flex justify-between text-[11px] font-bold text-amber-600"><span>欠款回收 (-)</span><span>- {(tx.debtDeduction + tx.startupDebtDeduction).toLocaleString()}</span></div>
                        <div className="h-px bg-slate-200 my-2"></div>
                        <div className="flex justify-between text-sm font-black text-slate-900"><span>应缴库现金</span><span>TZS {tx.netPayable.toLocaleString()}</span></div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                         {(() => {
                            const loc = locations.find(l => l.id === tx.locationId);
                            const dist = (loc?.coords && hasGps(tx) && tx.gps.lat !== 0)
                              ? getDistance(tx.gps.lat, tx.gps.lng, loc.coords.lat, loc.coords.lng)
                              : null;
                            const isFar = dist !== null && dist > 200;
                            const isMedium = dist !== null && dist > 50 && dist <= 200;

                            return (
                              <div className={`p-3 rounded-xl border flex flex-col justify-between transition-colors ${isFar ? 'bg-rose-50 border-rose-200' : isMedium ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
                                <div className="flex justify-between items-start">
                                   <p className="text-caption font-black text-slate-400 uppercase">地理偏移量</p>
                                   {isFar && <ShieldAlert size={12} className="text-rose-500 animate-pulse" />}
                                </div>
                                <div className="flex items-baseline gap-1 mt-1">
                                   <p className={`text-xs font-black ${isFar ? 'text-rose-600' : isMedium ? 'text-amber-600' : 'text-indigo-600'}`}>
                                      {dist !== null ? `${Math.round(dist)} 米` : '无坐标数据'}
                                   </p>
                                   <p className="text-caption font-bold text-slate-400 uppercase">Offset</p>
                                </div>
                                {isFar && (
                                   <p className="text-caption font-bold text-rose-400 uppercase mt-1 leading-tight">⚠ 疑似远程填报 (Remote Check-in)</p>
                                )}
                              </div>
                            );
                         })()}
                         <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-between">
                           <p className="text-caption font-black text-slate-400 uppercase">审计状态</p>
                           <div className="flex items-center gap-2 mt-1">
                              <Target size={12} className="text-emerald-500" />
                              <p className="text-caption font-black text-emerald-600 uppercase">Verified</p>
                           </div>
                         </div>
                      </div>
                    </div>

                    <div className="relative group">
                       {tx.photoUrl ? (
                         <div className="relative h-48 rounded-2xl overflow-hidden border-2 border-white shadow-lg">
                           <img src={tx.photoUrl} alt="Audit" className="w-full h-full object-cover" />
                           <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                              <span className="text-caption font-black text-white uppercase tracking-widest">审计现场留存</span>
                           </div>
                         </div>
                       ) : (
                         <div className="h-48 rounded-2xl bg-slate-200 flex flex-col items-center justify-center text-slate-400">
                           <AlertTriangle size={32} />
                           <p className="text-caption font-black uppercase mt-2">未上传现场照片</p>
                         </div>
                       )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {filteredTransactions.length === 0 && (
            <div className="text-center py-20 bg-white rounded-[40px] border border-dashed border-slate-200">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                <Search size={32} />
              </div>
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest">未检索到匹配的审计记录</p>
            </div>
          )}
        </div>
    </div>
  );
};

export default TransactionHistory;
