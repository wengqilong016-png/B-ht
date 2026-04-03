import React from 'react';
import { ChevronRight, AlertTriangle, Lock, RefreshCw, Wallet } from 'lucide-react';
import { Location, CONSTANTS } from '../../types';

export interface MachineCardMeta {
  loc: Location;
  distanceMeters: number | null;
  daysSinceActive: number | null;
  isUrgent: boolean;
  isNearby: boolean;
  isPending: boolean;
  isLocked: boolean;
}

interface MachineCardProps {
  item: MachineCardMeta;
  lang: 'zh' | 'sw';
  t: Record<string, string>;
  onSelect: (locId: string) => void;
  onRequestReset: (locId: string) => void;
  onRequestPayout: (locId: string) => void;
}

const MachineCard: React.FC<MachineCardProps> = ({
  item, lang, t, onSelect, onRequestReset, onRequestPayout,
}) => {
  const { loc, distanceMeters, daysSinceActive, isLocked, isUrgent, isPending } = item;
  const machineShortId = loc.machineId ? loc.machineId.substring(0, 6).toUpperCase() : '---';
  const isNear9999 = loc.lastScore >= 9000;

  return (
    <div className="bg-white rounded-subcard border border-slate-200 shadow-field hover:shadow-field-md transition-shadow overflow-hidden">
      <button
        onClick={() => { if (!isLocked) onSelect(loc.id); }}
        disabled={isLocked}
        className={`w-full group active:scale-[0.98] transition-transform ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-stretch">
          <div className={`relative w-16 shrink-0 flex flex-col items-center justify-center p-2 rounded-l-subcard transition-colors ${isLocked ? 'bg-rose-800' : 'bg-slate-900 group-hover:bg-indigo-700'}`}>
            {loc.machinePhotoUrl && (
              <img src={loc.machinePhotoUrl} alt={loc.name} className="w-full h-full object-cover absolute inset-0 opacity-40 rounded-l-subcard" />
            )}
            {isLocked
              ? <Lock size={14} className="relative z-10 text-white" />
              : <span className="relative z-10 text-white font-black text-[9px] text-center leading-tight">{machineShortId}</span>
            }
            <div className={`relative z-10 mt-1 w-2 h-2 rounded-full ${
              isLocked ? 'bg-rose-400 animate-pulse'
              : loc.status === 'active' ? 'bg-emerald-400'
              : loc.status === 'maintenance' ? 'bg-amber-400'
              : 'bg-rose-400'
            }`} />
          </div>

          <div className="flex-1 p-3.5 text-left">
            <div className="flex justify-between items-start mb-2">
              <div className="min-w-0 mr-2">
                <span className="text-slate-900 text-sm font-black leading-tight uppercase tracking-wide">{loc.machineId || '—'}</span>
                {loc.area && <p className="text-[9px] font-bold text-slate-400 uppercase leading-tight mt-0.5">{loc.area}</p>}
                <p className="text-[9px] font-bold text-slate-500 leading-tight mt-0.5 truncate">{loc.name}</p>
              </div>
              {isLocked
                ? <span className="text-[8px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-tag uppercase">{t.resetLocked}</span>
                : <ChevronRight size={15} className="text-slate-300 group-hover:text-indigo-500 mt-0.5 transition-colors shrink-0" />
              }
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <p className="text-[7px] font-black text-slate-400 uppercase">Last</p>
                <p className={`text-[10px] font-black ${isNear9999 ? 'text-rose-600' : 'text-indigo-600'}`}>
                  {loc.lastScore.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[7px] font-black text-slate-400 uppercase">Comm.</p>
                <p className="text-[10px] font-black text-emerald-600">{(loc.commissionRate * 100).toFixed(0)}%</p>
              </div>
              <div>
                <p className="text-[7px] font-black text-slate-400 uppercase">{lang === 'zh' ? '分红' : 'Div.'}</p>
                <p className="text-[10px] font-black text-amber-600">TZS {(loc.dividendBalance || 0).toLocaleString()}</p>
              </div>
            </div>

            {loc.area && (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-[8px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-tag border border-slate-100">{loc.area}</span>
                <span className={`text-[8px] font-bold px-2 py-0.5 rounded-tag border ${isPending ? 'text-indigo-600 bg-indigo-50 border-indigo-100' : 'text-emerald-600 bg-emerald-50 border-emerald-100'}`}>
                  {isPending ? t.pendingToday : t.visitedToday}
                </span>
                {distanceMeters !== null
                  ? <span className="text-[8px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-tag border border-emerald-100">{Math.round(distanceMeters)}m</span>
                  : <span className="text-[8px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-tag border border-slate-200">{t.awaitingGps}</span>
                }
                {isUrgent && daysSinceActive !== null && daysSinceActive >= CONSTANTS.STAGNANT_DAYS_THRESHOLD && (
                  <span className="text-[8px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-tag border border-amber-100">
                    {t.staleMachine} {daysSinceActive}d
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </button>

      {/* Reset / Payout actions */}
      {!isLocked && (
        <div className="flex border-t border-slate-100">
          {isNear9999 && (
            <button
              onClick={(e) => { e.stopPropagation(); onRequestReset(loc.id); }}
              className="flex-1 py-2.5 text-[9px] font-black uppercase text-rose-500 hover:bg-rose-50 transition-colors flex items-center justify-center gap-1.5 border-r border-slate-100"
            >
              <RefreshCw size={11} /> {lang === 'zh' ? '9999重置' : '9999 Reset'}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRequestPayout(loc.id); }}
            className="flex-1 py-2.5 text-[9px] font-black uppercase text-emerald-500 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1.5"
          >
            <Wallet size={11} /> {lang === 'zh' ? '分红提现' : 'Payout'}
          </button>
        </div>
      )}
    </div>
  );
};

export default MachineCard;
