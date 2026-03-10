import React, { useMemo, useState, useEffect } from 'react';
import { Search, Layers, Coins, ScanLine, ChevronRight, AlertTriangle, Lock, RefreshCw, Wallet, WifiOff, DatabaseBackup, Plus } from 'lucide-react';
import { Location, Driver, Transaction, CONSTANTS, TRANSLATIONS, getDistance } from '../../types';
import { getPendingTransactions } from '../../offlineQueue';
import OfflineRouteMap from '../../components/OfflineRouteMap';

const NEARBY_DISTANCE_METERS = 1500;
// Large penalty distance assigned when GPS is unavailable, so GPS-less machines sort later.
const PRIORITY_DISTANCE_FALLBACK = 99999;
const PRIORITY_DISTANCE_CAP_KM = 9;
const PRIORITY_PENDING_WEIGHT = 100;
const PRIORITY_URGENT_WEIGHT = 50;
const PRIORITY_LOCKED_PENALTY = -200;
const PRIORITY_NEARBY_WEIGHT = 20;
const PRIORITY_ACTIVE_WEIGHT = 10;

interface MachineSelectorProps {
  locations: Location[];
  currentDriver: Driver;
  allTransactions: Transaction[];
  lang: 'zh' | 'sw';
  isOnline: boolean;
  gpsCoords: { lat: number; lng: number } | null;
  onSelectMachine: (locId: string) => void;
  onStartRegister: () => void;
  onRequestReset: (locId: string) => void;
  onRequestPayout: (locId: string) => void;
  onRegisterMachine?: (location: Location) => void;
}

const MachineSelector: React.FC<MachineSelectorProps> = ({
  locations, currentDriver, allTransactions, lang, isOnline, gpsCoords,
  onSelectMachine, onStartRegister, onRequestReset, onRequestPayout, onRegisterMachine,
}) => {
  const t = TRANSLATIONS[lang];
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<'all' | 'pending' | 'urgent' | 'nearby'>('all');
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  useEffect(() => {
    getPendingTransactions().then((list) => setOfflineQueueCount(list.length)).catch(() => {});
  }, []);

  const driverSpecificLocations = useMemo(() => locations.filter(l => l.assignedDriverId === currentDriver.id), [locations, currentDriver.id]);
  const isShowingAllLocations = driverSpecificLocations.length === 0 && locations.length > 0;
  const assignedLocations = isShowingAllLocations ? locations : driverSpecificLocations;
  const availableAreas = useMemo(() => Array.from(new Set(assignedLocations.map(l => l.area).filter(Boolean))).sort(), [assignedLocations]);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayDriverTransactions = useMemo(
    () => allTransactions.filter(t => t.driverId === currentDriver.id && t.timestamp.startsWith(todayStr) && (t.type === undefined || t.type === 'collection')),
    [allTransactions, currentDriver.id, todayStr]
  );
  const visitedLocationIds = useMemo(() => new Set(todayDriverTransactions.map(t => t.locationId)), [todayDriverTransactions]);

  const locationCards = useMemo(() => {
    const lowerSearch = searchQuery.toLowerCase();
    return assignedLocations
      .map(loc => {
        const distanceMeters = gpsCoords && loc.coords
          ? getDistance(gpsCoords.lat, gpsCoords.lng, loc.coords.lat, loc.coords.lng)
          : null;
        const daysSinceActive = loc.lastRevenueDate
          ? Math.floor((Date.now() - new Date(loc.lastRevenueDate).getTime()) / 86400000)
          : null;
        const isUrgent = loc.lastScore >= 9000 || loc.status === 'broken' || (daysSinceActive !== null && daysSinceActive >= CONSTANTS.STAGNANT_DAYS_THRESHOLD);
        const isNearby = distanceMeters !== null && distanceMeters <= NEARBY_DISTANCE_METERS;
        const isPending = !visitedLocationIds.has(loc.id);
        const isLocked = loc.resetLocked === true;
        const priorityScore =
          (isPending ? PRIORITY_PENDING_WEIGHT : 0) +
          (isUrgent ? PRIORITY_URGENT_WEIGHT : 0) +
          (isLocked ? PRIORITY_LOCKED_PENALTY : 0) +
          (isNearby ? PRIORITY_NEARBY_WEIGHT : 0) +
          (loc.status === 'active' ? PRIORITY_ACTIVE_WEIGHT : 0) -
          Math.min(PRIORITY_DISTANCE_CAP_KM, Math.floor((distanceMeters ?? PRIORITY_DISTANCE_FALLBACK) / 1000));
        return { loc, distanceMeters, daysSinceActive, isUrgent, isNearby, isPending, isLocked, priorityScore };
      })
      .filter(({ loc, isPending, isUrgent, isNearby }) => {
        const matchSearch = !searchQuery ||
          loc.name.toLowerCase().includes(lowerSearch) ||
          loc.machineId.toLowerCase().includes(lowerSearch) ||
          loc.area.toLowerCase().includes(lowerSearch);
        const matchArea = selectedArea === 'all' || loc.area === selectedArea;
        const matchQuickFilter =
          locationFilter === 'all' ||
          (locationFilter === 'pending' && isPending) ||
          (locationFilter === 'urgent' && isUrgent) ||
          (locationFilter === 'nearby' && isNearby);
        return matchSearch && matchArea && matchQuickFilter;
      })
      .sort((a, b) => {
        const distanceA = a.distanceMeters ?? Number.MAX_SAFE_INTEGER;
        const distanceB = b.distanceMeters ?? Number.MAX_SAFE_INTEGER;
        if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
        if (distanceA !== distanceB) return distanceA - distanceB;
        return a.loc.name.localeCompare(b.loc.name);
      });
  }, [assignedLocations, gpsCoords, searchQuery, selectedArea, locationFilter, visitedLocationIds]);

  const collectionOverview = useMemo(() => ({
    totalMachines: assignedLocations.length,
    pendingStops: locationCards.filter(item => item.isPending).length,
    urgentMachines: locationCards.filter(item => item.isUrgent).length,
    nearbySites: locationCards.filter(item => item.isNearby).length,
  }), [assignedLocations.length, locationCards]);

  return (
    <div className="max-w-md mx-auto py-4 px-4 animate-in fade-in space-y-4">
      {/* Offline status banner */}
      {!isOnline && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-subcard">
          <WifiOff size={16} className="text-amber-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-black text-amber-700 uppercase">
              {lang === 'zh' ? '离线模式 — 数据已本地保存' : 'Offline Mode — Data saved locally'}
            </p>
            <p className="text-[8px] font-bold text-amber-600">
              {lang === 'zh' ? '恢复网络后自动同步到云端' : 'Auto-syncs when connection returns'}
            </p>
          </div>
          {offlineQueueCount > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 bg-amber-200 rounded-tag flex-shrink-0">
              <DatabaseBackup size={10} className="text-amber-700" />
              <span className="text-[8px] font-black text-amber-700">{offlineQueueCount}</span>
            </div>
          )}
        </div>
      )}

      {/* Online with pending queue */}
      {isOnline && offlineQueueCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-subcard">
          <DatabaseBackup size={16} className="text-indigo-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-indigo-700 uppercase">
              {lang === 'zh' ? `${offlineQueueCount} 条离线记录正在同步...` : `Syncing ${offlineQueueCount} offline records...`}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2 px-1">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase">
            <ScanLine className="text-indigo-600" size={20} />
            {t.selectMachine}
          </h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
            {todayDriverTransactions.length} {t.todaysCollections}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-subcard shadow-field">
          <Coins size={13} className="text-emerald-400" />
          <span className="text-xs font-black text-white">{(currentDriver?.dailyFloatingCoins ?? 0).toLocaleString()}</span>
        </div>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-subcard border border-slate-200 p-3.5 shadow-field">
          <p className="text-[9px] font-black text-slate-400 uppercase">{t.totalMachines}</p>
          <p className="text-xl font-black text-slate-900 mt-1">{collectionOverview.totalMachines}</p>
        </div>
        <div className="bg-white rounded-subcard border border-slate-200 p-3.5 shadow-field">
          <p className="text-[9px] font-black text-slate-400 uppercase">{t.pendingStops}</p>
          <p className="text-xl font-black text-indigo-600 mt-1">{collectionOverview.pendingStops}</p>
        </div>
        <div className="bg-amber-50 rounded-subcard border border-amber-200 p-3.5 shadow-field">
          <p className="text-[9px] font-black text-amber-500 uppercase">{t.urgentMachines}</p>
          <p className="text-xl font-black text-amber-700 mt-1">{collectionOverview.urgentMachines}</p>
        </div>
        <div className="bg-emerald-50 rounded-subcard border border-emerald-200 p-3.5 shadow-field">
          <p className="text-[9px] font-black text-emerald-500 uppercase">{t.nearbySites}</p>
          <p className="text-xl font-black text-emerald-700 mt-1">
            {gpsCoords ? collectionOverview.nearbySites : '-'}
          </p>
          {!gpsCoords && (
            <p className="text-[8px] font-bold text-emerald-500 uppercase mt-0.5">{t.awaitingGps}</p>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative group">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.enterId}
          className="w-full bg-white border border-slate-200 rounded-card py-4 pl-12 pr-5 text-sm font-bold shadow-field outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_130px] gap-3">
        <div className="flex flex-wrap gap-2">
          {([
            ['all', t.quickFilterAll, collectionOverview.totalMachines],
            ['pending', t.quickFilterPending, collectionOverview.pendingStops],
            ['urgent', t.quickFilterUrgent, collectionOverview.urgentMachines],
            ['nearby', t.quickFilterNearby, collectionOverview.nearbySites],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setLocationFilter(key)}
              className={`px-3 py-1.5 rounded-btn text-[10px] font-black uppercase transition-all border ${
                locationFilter === key
                  ? 'bg-slate-900 text-white border-slate-900 shadow-field'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:text-indigo-600'
              }`}
            >
              {label} <span className="ml-1 opacity-60">{count}</span>
            </button>
          ))}
        </div>
        <select
          value={selectedArea}
          onChange={(e) => setSelectedArea(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-btn px-4 py-2.5 text-[10px] font-black uppercase text-slate-600 outline-none shadow-field"
        >
          <option value="all">{t.allAreas}</option>
          {availableAreas.map(area => (
            <option key={area} value={area}>{area}</option>
          ))}
        </select>
      </div>

      {/* Register new machine */}
      {onRegisterMachine && (
        <button
          onClick={onStartRegister}
          className="w-full py-3.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-btn font-black uppercase text-xs hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={15} />
          {t.registerNewMachine}
        </button>
      )}

      <div className="space-y-3">
        {isShowingAllLocations && (
          <div className="px-4 py-2 bg-amber-50 border border-amber-100 rounded-subcard flex items-center gap-2">
            <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
            <p className="text-[9px] font-black text-amber-700 uppercase tracking-widest">
              {lang === 'zh' ? 'Showing all machines (none assigned)' : 'Showing all machines (none assigned)'}
            </p>
          </div>
        )}
        {locationCards.length === 0 && (
          <div className="py-14 text-center bg-white rounded-card border border-dashed border-slate-200">
            <Layers size={36} className="mx-auto text-slate-200 mb-3" />
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{t.noMachinesAssigned}</p>
          </div>
        )}
        {locationCards.map(({ loc, daysSinceActive, distanceMeters, isLocked, isUrgent, isPending }) => {
          const machineShortId = loc.machineId ? loc.machineId.substring(0, 6).toUpperCase() : '---';
          const isNear9999 = loc.lastScore >= 9000;
          return (
            <div key={loc.id} className="bg-white rounded-subcard border border-slate-200 shadow-field hover:shadow-field-md transition-shadow overflow-hidden">
              <button
                onClick={() => { if (!isLocked) onSelectMachine(loc.id); }}
                disabled={isLocked}
                className={`w-full group active:scale-[0.98] transition-transform ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-stretch">
                  <div className={`relative w-16 shrink-0 flex flex-col items-center justify-center p-2 rounded-l-subcard transition-colors ${isLocked ? 'bg-rose-800' : 'bg-slate-900 group-hover:bg-indigo-700'}`}>
                    {loc.machinePhotoUrl ? (
                      <img src={loc.machinePhotoUrl} alt={loc.name} className="w-full h-full object-cover absolute inset-0 opacity-40 rounded-l-subcard" />
                    ) : null}
                    {isLocked ? (
                      <Lock size={14} className="relative z-10 text-white" />
                    ) : (
                      <span className="relative z-10 text-white font-black text-[9px] text-center leading-tight">{machineShortId}</span>
                    )}
                    <div className={`relative z-10 mt-1 w-2 h-2 rounded-full ${isLocked ? 'bg-rose-400 animate-pulse' : loc.status === 'active' ? 'bg-emerald-400' : loc.status === 'maintenance' ? 'bg-amber-400' : 'bg-rose-400'}`} />
                  </div>
                  <div className="flex-1 p-3.5 text-left">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-slate-900 text-sm font-black leading-tight">{loc.name}</span>
                      {isLocked ? (
                        <span className="text-[8px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-tag uppercase">{t.resetLocked}</span>
                      ) : (
                        <ChevronRight size={15} className="text-slate-300 group-hover:text-indigo-500 mt-0.5 transition-colors shrink-0" />
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <p className="text-[7px] font-black text-slate-400 uppercase">Last</p>
                        <p className={`text-[10px] font-black ${isNear9999 ? 'text-rose-600' : 'text-indigo-600'}`}>{loc.lastScore.toLocaleString()}</p>
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
                        {distanceMeters !== null ? (
                          <span className="text-[8px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-tag border border-emerald-100">
                            {Math.round(distanceMeters)}m
                          </span>
                        ) : (
                          <span className="text-[8px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-tag border border-slate-200">
                            {t.awaitingGps}
                          </span>
                        )}
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
              {/* Action buttons: Reset / Payout */}
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
        })}
      </div>

      {/* Offline Route Map */}
      {allTransactions.length > 0 && (
        <OfflineRouteMap
          transactions={allTransactions}
          driverId={currentDriver.id}
          driverName={currentDriver.name}
          isOnline={isOnline}
          lang={lang}
        />
      )}
    </div>
  );
};

export default MachineSelector;
