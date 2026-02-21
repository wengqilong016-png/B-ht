
import React, { useState, useMemo } from 'react';
import { Calendar, MapPin, CheckCircle2, Filter, ChevronDown, Info, RefreshCw, List, Map as MapIcon, Navigation, WifiOff, AlertTriangle, Clock, Globe, Calculator, Banknote, ExternalLink, MapPinned, Search, BrainCircuit } from 'lucide-react';
import { Transaction } from '../types';

interface TransactionHistoryProps {
  transactions: Transaction[];
  onAnalyze: (txId: string) => void;
}

const TransactionHistory: React.FC<TransactionHistoryProps> = ({ transactions, onAnalyze }) => {
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [showUnsyncedOnly, setShowUnsyncedOnly] = useState(false);
  const [activeMapTx, setActiveMapTx] = useState<Transaction | null>(null);

  const filteredTransactions = useMemo(() => {
    let result = [...transactions];
    if (selectedLocation !== 'all') result = result.filter(tx => tx.locationName === selectedLocation);
    if (showUnsyncedOnly) result = result.filter(tx => !tx.isSynced);
    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [transactions, selectedLocation, showUnsyncedOnly]);

  const unsyncedCount = transactions.filter(t => !t.isSynced).length;

  // Center for the interactive map background
  const mapCenter = useMemo(() => {
    if (filteredTransactions.length > 0) return filteredTransactions[0].gps;
    return { lat: -6.82, lng: 39.25 }; // Default Dar es Salaam
  }, [filteredTransactions]);

  // Scaling logic for overlay markers
  const mapCoords = (lat: number, lng: number) => {
    const centerLat = mapCenter.lat, centerLng = mapCenter.lng;
    // Calculate relative offset (magnified for visual separation)
    return { 
      x: Math.max(10, Math.min(90, 50 + (lng - centerLng) * 1500)), 
      y: Math.max(10, Math.min(90, 50 + (centerLat - lat) * 1500)) 
    };
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 bg-white p-5 rounded-[32px] border border-slate-200 shadow-sm">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner">
              <button onClick={() => setViewMode('list')} className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
                <List size={14} /> 列表
              </button>
              <button onClick={() => setViewMode('map')} className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${viewMode === 'map' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
                <MapIcon size={14} /> 地图
              </button>
            </div>
            
            <button 
              onClick={() => setShowUnsyncedOnly(!showUnsyncedOnly)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 border ${showUnsyncedOnly ? 'bg-amber-50 border-amber-200 text-amber-600 shadow-md shadow-amber-100' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}
            >
              <WifiOff size={14} />
              <span className="hidden sm:inline">未同步</span>
              <span className={`px-1.5 py-0.5 rounded-md text-[9px] min-w-[20px] text-center ${showUnsyncedOnly ? 'bg-amber-200 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{unsyncedCount}</span>
            </button>
          </div>

          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select 
              value={selectedLocation} 
              onChange={(e) => setSelectedLocation(e.target.value)} 
              className="bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-[10px] font-black text-slate-700 outline-none uppercase appearance-none min-w-[150px] shadow-sm focus:ring-2 focus:ring-indigo-500/20 transition-all"
            >
              <option value="all">所有点位汇总</option>
              {Array.from(new Set(transactions.map(tx => tx.locationName))).sort().map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>
        </div>
      </div>

      {viewMode === 'list' ? (
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
                    <div className="flex items-center gap-3 text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
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
                          <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">收益清算明细</h4>
                        </div>
                        <button onClick={() => onAnalyze(tx.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 text-indigo-600 rounded-lg text-[9px] font-black uppercase hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                           <BrainCircuit size={12} /> AI 审计
                        </button>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-[11px] font-bold text-slate-500"><span>总收入 (Coins Value)</span><span>TZS {tx.revenue.toLocaleString()}</span></div>
                        <div className="flex justify-between text-[11px] font-bold text-emerald-600"><span>分红佣金 (+)</span><span>+ {tx.commission.toLocaleString()}</span></div>
                        <div className="flex justify-between text-[11px] font-bold text-rose-500"><span>日常支出 (-)</span><span>- {tx.expenses.toLocaleString()}</span></div>
                        <div className="flex justify-between text-[11px] font-bold text-amber-600"><span>欠款回收 (-)</span><span>- {(tx.debtDeduction + tx.startupDebtDeduction).toLocaleString()}</span></div>
                        <div className="h-px bg-slate-200 my-2"></div>
                        <div className="flex justify-between text-sm font-black text-slate-900"><span>应缴库现金</span><span>TZS {tx.netPayable.toLocaleString()}</span></div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                         <div className="bg-white p-3 rounded-xl border border-slate-200">
                           <p className="text-[8px] font-black text-slate-400 uppercase">GPS 精度</p>
                           <p className="text-[10px] font-black text-indigo-600">{tx.gpsDeviation ? `${Math.round(tx.gpsDeviation)}M` : '精准'}</p>
                         </div>
                         <div className="bg-white p-3 rounded-xl border border-slate-200">
                           <p className="text-[8px] font-black text-slate-400 uppercase">状态</p>
                           <p className="text-[10px] font-black text-emerald-600">正常运行</p>
                         </div>
                      </div>
                    </div>

                    <div className="relative group">
                       {tx.photoUrl ? (
                         <div className="relative h-48 rounded-2xl overflow-hidden border-2 border-white shadow-lg">
                           <img src={tx.photoUrl} alt="Audit" className="w-full h-full object-cover" />
                           <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                              <span className="text-[10px] font-black text-white uppercase tracking-widest">审计现场留存</span>
                           </div>
                         </div>
                       ) : (
                         <div className="h-48 rounded-2xl bg-slate-200 flex flex-col items-center justify-center text-slate-400">
                           <AlertTriangle size={32} />
                           <p className="text-[10px] font-black uppercase mt-2">未上传现场照片</p>
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
      ) : (
        <div className="bg-slate-900 rounded-[40px] h-[550px] relative overflow-hidden border border-slate-800 shadow-2xl">
          {/* Real Map Background Layer */}
          {filteredTransactions.length > 0 ? (
            <div className="absolute inset-0">
               <iframe 
                width="100%" 
                height="100%" 
                frameBorder="0" 
                scrolling="no" 
                src={`https://maps.google.com/maps?q=${mapCenter.lat},${mapCenter.lng}&z=14&output=embed&iwloc=near`}
                className="grayscale-[0.6] brightness-[0.7] contrast-[1.2] opacity-50 pointer-events-none"
              />
              
              {/* Overlay Interactive Markers */}
              <div className="absolute inset-0 z-10">
                {filteredTransactions.map((tx) => {
                  const coords = mapCoords(tx.gps.lat, tx.gps.lng);
                  const isActive = activeMapTx?.id === tx.id;
                  
                  return (
                    <div 
                      key={tx.id} 
                      className="absolute -translate-x-1/2 -translate-y-1/2 group transition-all duration-500" 
                      style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
                      onClick={() => setActiveMapTx(isActive ? null : tx)}
                    >
                      <div className={`p-2 rounded-2xl border-2 shadow-2xl transition-all cursor-pointer ${isActive ? 'bg-indigo-600 border-white scale-150 z-30' : 'bg-slate-900/80 border-indigo-500/50 hover:scale-110'}`}>
                        <MapPinned size={isActive ? 16 : 14} className={isActive ? 'text-white' : 'text-indigo-400'} />
                      </div>

                      {isActive && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-48 bg-white rounded-2xl p-4 shadow-2xl border border-indigo-100 animate-in zoom-in-95">
                           <h5 className="text-[11px] font-black text-slate-900 mb-1">{tx.locationName}</h5>
                           <p className="text-[9px] font-bold text-indigo-600 uppercase mb-3">应收: TZS {tx.netPayable.toLocaleString()}</p>
                           <div className="flex gap-2">
                             <a 
                               href={`https://www.google.com/maps?q=${tx.gps.lat},${tx.gps.lng}`} 
                               target="_blank" 
                               className="flex-1 bg-slate-900 text-white p-2 rounded-lg flex items-center justify-center gap-1 text-[8px] font-black uppercase"
                             >
                               <Navigation size={10} /> 导航
                             </a>
                             <button 
                               onClick={() => onAnalyze(tx.id)}
                               className="flex-1 bg-indigo-50 text-indigo-600 p-2 rounded-lg text-[8px] font-black uppercase flex items-center justify-center gap-1"
                             >
                               <BrainCircuit size={10} /> 审计
                             </button>
                           </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 space-y-4">
              <MapPinned size={48} className="opacity-20" />
              <p className="text-[10px] font-black uppercase tracking-widest">暂无地理轨迹数据</p>
            </div>
          )}

          {/* Map Controls / HUD */}
          <div className="absolute top-6 left-6 right-6 z-20 flex justify-between items-start pointer-events-none">
             <div className="bg-slate-900/80 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 pointer-events-auto">
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">全域打卡轨迹审计图</p>
                <p className="text-[8px] font-bold text-slate-500 uppercase mt-0.5">Tracking {filteredTransactions.length} Check-ins</p>
             </div>
             
             <div className="bg-slate-900/80 backdrop-blur-md p-2 rounded-xl border border-white/10 flex flex-col gap-2 pointer-events-auto">
                <button onClick={() => window.location.reload()} className="p-2 text-white hover:bg-white/10 rounded-lg transition-all" title="刷新数据"><RefreshCw size={14}/></button>
                <div className="h-px bg-white/10 mx-1"></div>
                <button onClick={() => setViewMode('list')} className="p-2 text-indigo-400 hover:bg-white/10 rounded-lg transition-all"><List size={14}/></button>
             </div>
          </div>
          
          <div className="absolute bottom-6 left-6 right-6 z-20 pointer-events-none flex justify-center">
             <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-3 pointer-events-auto">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_8px_#6366f1]"></div><span className="text-[8px] font-black text-white uppercase">已同步</span></div>
                <div className="w-px h-3 bg-white/10"></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-amber-500 rounded-full shadow-[0_0_8px_#f59e0b] animate-pulse"></div><span className="text-[8px] font-black text-white uppercase">离线队列</span></div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;
