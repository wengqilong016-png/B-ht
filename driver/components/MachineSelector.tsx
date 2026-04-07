import React, { useMemo, useState, useEffect, useDeferredValue } from 'react';
import { Layers, Coins, ScanLine, AlertTriangle, WifiOff, DatabaseBackup } from 'lucide-react';
import { Location, Driver, Transaction, CONSTANTS, TRANSLATIONS, getDistance } from '../../types';
import { getTodayLocalDate } from '../../utils/dateUtils';
import { getPendingTransactions } from '../../offlineQueue';
import MachineFilterBar from './MachineFilterBar';
import MachineCard, { type MachineCardMeta } from './MachineCard';

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
  currentDraftLocation?: Location | null;
  hasDraftInProgress?: boolean;
  onSelectMachine: (locId: string) => void;
  onResumeDraft?: (locId: string) => void;
  onStartRegister: () => void;
  onRequestReset: (locId: string) => void;
  onRequestPayout: (locId: string) => void;
  onRegisterMachine?: (location: Location) => void;
  onUpdateLocation?: (locationId: string, updates: Partial<Location>) => Promise<void>;
}

const MachineSelector: React.FC<MachineSelectorProps> = ({
  locations, currentDriver, allTransactions, lang, isOnline, gpsCoords,
  currentDraftLocation, hasDraftInProgress = false,
  onSelectMachine, onResumeDraft, onStartRegister, onRequestReset, onRequestPayout, onRegisterMachine, onUpdateLocation,
}) => {
  const t = TRANSLATIONS[lang];
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
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

  const todayStr = getTodayLocalDate();
  const todayDriverTransactions = useMemo(
    () => allTransactions.filter(t => t.driverId === currentDriver.id && t.timestamp.startsWith(todayStr) && (t.type === undefined || t.type === 'collection')),
    [allTransactions, currentDriver.id, todayStr]
  );
  const visitedLocationIds = useMemo(() => new Set(todayDriverTransactions.map(t => t.locationId)), [todayDriverTransactions]);

  // Memoize location metadata calculations to avoid recalculating on every render
  const locationMetadata = useMemo(() => {
    const metadata = new Map<string, {
      distanceMeters: number | null;
      daysSinceActive: number | null;
      isUrgent: boolean;
      isNearby: boolean;
      isPending: boolean;
      isLocked: boolean;
      priorityScore: number;
    }>();

    assignedLocations.forEach(loc => {
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

      metadata.set(loc.id, {
        distanceMeters,
        daysSinceActive,
        isUrgent,
        isNearby,
        isPending,
        isLocked,
        priorityScore,
      });
    });

    return metadata;
  }, [assignedLocations, gpsCoords, visitedLocationIds]);

  const locationCards = useMemo(() => {
    const lowerSearch = deferredSearchQuery.toLowerCase();
    return assignedLocations
      .map(loc => {
        const meta = locationMetadata.get(loc.id)!;
        return { loc, ...meta };
      })
      .filter(({ loc, isPending, isUrgent, isNearby }) => {
        const matchSearch = !deferredSearchQuery ||
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
  }, [assignedLocations, locationMetadata, deferredSearchQuery, selectedArea, locationFilter]);

  const collectionOverview = useMemo(() => {
    // Single pass instead of three separate filter() calls
    let pendingStops = 0, urgentMachines = 0, nearbySites = 0;
    for (const item of locationCards) {
      if (item.isPending) pendingStops++;
      if (item.isUrgent) urgentMachines++;
      if (item.isNearby) nearbySites++;
    }
    return { totalMachines: assignedLocations.length, pendingStops, urgentMachines, nearbySites };
  }, [assignedLocations.length, locationCards]);

  return (
    <div className="max-w-md mx-auto py-3 px-3 animate-in fade-in space-y-2.5">
      {/* Offline status banner */}
      {!isOnline && (
        <div className="flex items-center gap-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-2xl">
          <WifiOff size={16} className="text-amber-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-caption font-black text-amber-700 uppercase">
              {lang === 'zh' ? '离线模式 — 数据已本地保存' : 'Offline Mode — Data saved locally'}
            </p>
            <p className="text-caption font-bold text-amber-600">
              {lang === 'zh' ? '恢复网络后自动同步到云端' : 'Auto-syncs when connection returns'}
            </p>
          </div>
          {offlineQueueCount > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 bg-amber-200 rounded-tag flex-shrink-0">
              <DatabaseBackup size={10} className="text-amber-700" />
              <span className="text-caption font-black text-amber-700">{offlineQueueCount}</span>
            </div>
          )}
        </div>
      )}

      {/* Online with pending queue */}
      {isOnline && offlineQueueCount > 0 && (
        <div className="flex items-center gap-3 px-3 py-2.5 bg-indigo-50 border border-indigo-200 rounded-2xl">
          <DatabaseBackup size={16} className="text-indigo-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-caption font-black text-indigo-700 uppercase">
              {lang === 'zh' ? `${offlineQueueCount} 条离线记录正在同步...` : `Syncing ${offlineQueueCount} offline records...`}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 rounded-3xl bg-white border border-slate-200 px-4 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2 uppercase">
            <ScanLine className="text-indigo-600" size={18} />
            {t.selectMachine}
          </h2>
          <p className="text-caption font-black text-slate-400 uppercase tracking-widest mt-1">
            {todayDriverTransactions.length} {t.todaysCollections}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-2xl shadow-[0_10px_24px_rgba(15,23,42,0.18)]">
          <Coins size={13} className="text-emerald-400" />
          <span className="text-xs font-black text-white">{(currentDriver?.dailyFloatingCoins ?? 0).toLocaleString()}</span>
        </div>
      </div>

      {hasDraftInProgress && currentDraftLocation && (
        <button
          type="button"
          onClick={() => (onResumeDraft ?? onSelectMachine)(currentDraftLocation.id)}
          className="flex w-full items-center justify-between gap-3 rounded-[24px] border border-indigo-200 bg-indigo-50 px-4 py-3 text-left shadow-[0_10px_24px_rgba(79,70,229,0.08)] transition-colors hover:bg-indigo-100"
        >
          <div className="min-w-0">
            <p className="text-caption font-black uppercase tracking-[0.22em] text-indigo-500">
              {t.resumeCurrentTask}
            </p>
            <p className="mt-1 truncate text-[11px] font-black uppercase text-slate-900">
              {currentDraftLocation.machineId}{' '}
              <span className="normal-case text-slate-500">{currentDraftLocation.name}</span>
            </p>
            <p className="mt-1 truncate text-caption font-bold uppercase tracking-wide text-slate-400">
              {currentDraftLocation.area || '—'} · {t.score} {(currentDraftLocation.lastScore ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-white px-3 py-2 text-caption font-black uppercase tracking-wide text-indigo-600">
            <ScanLine size={13} />
            {t.resumeEntry}
          </div>
        </button>
      )}

      {/* Search, filters, area dropdown, register button */}
      <MachineFilterBar
        t={t}
        lang={lang}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        locationFilter={locationFilter}
        onFilterChange={setLocationFilter}
        selectedArea={selectedArea}
        onAreaChange={setSelectedArea}
        availableAreas={availableAreas}
        counts={collectionOverview}
        showRegisterButton={!!onRegisterMachine}
        onStartRegister={onStartRegister}
      />

      <div className="space-y-2">
        {isShowingAllLocations && (
          <div className="px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-2">
            <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
            <p className="text-caption font-black text-amber-700 uppercase tracking-widest">
              {lang === 'zh' ? 'Showing all machines (none assigned)' : 'Showing all machines (none assigned)'}
            </p>
          </div>
        )}
        {locationCards.length === 0 && (
          <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <Layers size={36} className="mx-auto text-slate-200 mb-3" />
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{t.noMachinesAssigned}</p>
          </div>
        )}
        {locationCards.map((item) => (
          <MachineCard
            key={item.loc.id}
            item={item}
            lang={lang}
            t={t}
            onSelect={onSelectMachine}
            onRequestReset={(locId) => onRequestReset(locId)}
            onRequestPayout={(locId) => onRequestPayout(locId)}
            onUpdateLocation={onUpdateLocation}
          />
        ))}
      </div>

    </div>
  );
};

export default MachineSelector;
