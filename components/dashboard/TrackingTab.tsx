import { MapPin, Radio, Search, Pencil, ChevronRight, Navigation } from 'lucide-react';
import React, { Suspense, lazy, useState } from 'react';

import { Driver, Location, Transaction, TRANSLATIONS } from '../../types';
import { MapErrorBoundary, MapLoadingFallback } from '../MapErrorBoundary';

const LiveMap = lazy(() => import('../LiveMap'));

interface TrackingDriverCard {
  driver: Driver;
  driverLocs: Location[];
  driverTxsToday: Transaction[];
  todayRevenue: number;
  attentionLocations: Location[];
  lastActiveMinutes: number | null;
  hasStaleGps: boolean;
  searchBlob: string;
}

interface TrackingOverview {
  liveDrivers: number;
  staleDrivers: number;
  todayCollections: number;
  attentionSites: number;
}

interface TrackingTabProps {
  trackingDriverCards: TrackingDriverCard[];
  trackingOverview: TrackingOverview;
  trackingVisibleLocations: Location[];
  trackingVisibleTransactions: Transaction[];
  trackingSearch: string;
  setTrackingSearch: (v: string) => void;
  trackingStatusFilter: 'all' | 'attention' | 'active' | 'stale';
  setTrackingStatusFilter: (v: 'all' | 'attention' | 'active' | 'stale') => void;
  locations: Location[];
  onUpdateLocations: (locations: Location[]) => void;
  lang: 'zh' | 'sw';
}

const TrackingTab: React.FC<TrackingTabProps> = ({
  trackingDriverCards,
  trackingOverview,
  trackingVisibleLocations,
  trackingVisibleTransactions,
  trackingSearch,
  setTrackingSearch,
  trackingStatusFilter,
  setTrackingStatusFilter,
  locations,
  onUpdateLocations,
  lang,
}) => {
  const t = TRANSLATIONS[lang];
  const [expandedDriverTracking, setExpandedDriverTracking] = useState<string | null>(null);
  const [trackingEditLocId, setTrackingEditLocId] = useState<string | null>(null);
  const [trackingLocForm, setTrackingLocForm] = useState({ commissionRate: '', status: 'active' as Location['status'] });

  return (
    <div className="space-y-3 animate-in fade-in">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">{t.trackingTitle}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-1">
              <Radio size={12} className="text-amber-600 animate-pulse" /> {t.trackingSubtitle}
            </p>
          </div>
          <div className="relative w-full lg:w-80">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={trackingSearch}
              onChange={(e) => setTrackingSearch(e.target.value)}
              placeholder={t.trackingSearch}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-11 pr-4 text-xs font-bold outline-none focus:border-amber-200"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
            <p className="text-caption font-black text-emerald-500 uppercase">{t.liveNow}</p>
            <p className="text-xl font-black text-emerald-700 mt-0.5">{trackingOverview.liveDrivers}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
            <p className="text-caption font-black text-amber-500 uppercase">{t.staleGps}</p>
            <p className="text-xl font-black text-amber-700 mt-0.5">{trackingOverview.staleDrivers}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
            <p className="text-caption font-black text-amber-500 uppercase">{t.todaysCollections}</p>
            <p className="text-xl font-black text-amber-700 mt-0.5">{trackingOverview.todayCollections}</p>
          </div>
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5">
            <p className="text-caption font-black text-rose-500 uppercase">{t.attentionSites}</p>
            <p className="text-xl font-black text-rose-700 mt-0.5">{trackingOverview.attentionSites}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {([
            ['all', t.driverFilterAll],
            ['attention', t.driverFilterAttention],
            ['active', t.driverFilterActive],
            ['stale', t.driverFilterStale],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTrackingStatusFilter(key)}
              className={`px-3 py-2 rounded-2xl text-caption font-black uppercase border transition-all ${
                trackingStatusFilter === key
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-500 border-slate-200 hover:text-amber-600 hover:border-amber-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {trackingDriverCards.length === 0 && (
          <div className="py-8 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <Search size={24} className="mx-auto text-slate-300 mb-3" />
            <p className="text-caption font-black text-slate-400 uppercase tracking-widest">
              {t.noDriversFound}
            </p>
          </div>
        )}
        {trackingDriverCards.map(({ driver, driverLocs, driverTxsToday, todayRevenue, attentionLocations, hasStaleGps, lastActiveMinutes }) => {
          const isExpanded = expandedDriverTracking === driver.id;
          return (
            <div key={driver.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <button
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                onClick={() => { setExpandedDriverTracking(isExpanded ? null : driver.id); setTrackingEditLocId(null); }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-base shadow-md ${driver.status === 'active' ? 'bg-amber-600' : 'bg-slate-400'}`}>
                    {driver.name.charAt(0)}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-slate-900">{driver.name}</p>
                    <p className="text-caption font-bold text-slate-400 uppercase">
                      {driverLocs.length} locations • {driver.status === 'active'
                        ? (driver.lastActive ? `${lastActiveMinutes} min ago` : t.liveNow)
                        : t.driverOffline}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden md:grid grid-cols-3 gap-2 text-left">
                    <div className="bg-slate-50 rounded-xl px-3 py-2 min-w-[86px]">
                      <p className="text-caption font-black text-slate-400 uppercase">{t.todaysCollections}</p>
                      <p className="text-caption font-black text-slate-900 mt-1">{driverTxsToday.length}</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl px-3 py-2 min-w-[86px] border border-amber-100">
                      <p className="text-caption font-black text-amber-400 uppercase">{t.todaysCash}</p>
                      <p className="text-caption font-black text-amber-700 mt-1">TZS {todayRevenue.toLocaleString()}</p>
                    </div>
                    <div className={`rounded-xl px-3 py-2 min-w-[86px] ${attentionLocations.length > 0 || hasStaleGps ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                      <p className={`text-caption font-black uppercase ${attentionLocations.length > 0 || hasStaleGps ? 'text-rose-400' : 'text-emerald-400'}`}>{t.attentionSites}</p>
                      <p className={`text-caption font-black mt-1 ${attentionLocations.length > 0 || hasStaleGps ? 'text-rose-700' : 'text-emerald-700'}`}>{attentionLocations.length + (hasStaleGps ? 1 : 0)}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-caption font-black uppercase ${hasStaleGps ? 'bg-amber-50 text-amber-600' : driver.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {hasStaleGps ? t.staleGps : driver.status}
                  </span>
                  <ChevronRight size={16} className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-100 p-5 space-y-3 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-50 rounded-2xl px-4 py-3 border border-slate-100">
                      <p className="text-caption font-black text-slate-400 uppercase">{t.todaysCollections}</p>
                      <p className="text-sm font-black text-slate-900 mt-1">{driverTxsToday.length}</p>
                    </div>
                    <div className="bg-amber-50 rounded-2xl px-4 py-3 border border-amber-100">
                      <p className="text-caption font-black text-amber-400 uppercase">{t.todaysCash}</p>
                      <p className="text-sm font-black text-amber-700 mt-1">TZS {todayRevenue.toLocaleString()}</p>
                    </div>
                    <div className="bg-amber-50 rounded-2xl px-4 py-3 border border-amber-100">
                      <p className="text-caption font-black text-amber-400 uppercase">{t.staleGps}</p>
                      <p className="text-sm font-black text-amber-700 mt-1">{hasStaleGps ? `${lastActiveMinutes ?? 0} min` : t.liveNow}</p>
                    </div>
                    <div className="bg-rose-50 rounded-2xl px-4 py-3 border border-rose-100">
                      <p className="text-caption font-black text-rose-400 uppercase">{t.attentionSites}</p>
                      <p className="text-sm font-black text-rose-700 mt-1">{attentionLocations.length}</p>
                    </div>
                  </div>
                  {driverLocs.length === 0 ? (
                    <p className="text-center text-caption font-black text-slate-300 uppercase py-6">{t.noDriverLocations}</p>
                  ) : (
                    driverLocs.map(loc => {
                      const isEditingThis = trackingEditLocId === loc.id;
                      return (
                        <div key={loc.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${loc.status === 'active' ? 'bg-emerald-500' : loc.status === 'maintenance' ? 'bg-amber-500' : 'bg-rose-500'}`}></div>
                              <p className="text-xs font-black text-slate-900">{loc.name}</p>
                            </div>
                            <button
                              onClick={() => {
                                if (isEditingThis) {
                                  setTrackingEditLocId(null);
                                } else {
                                  setTrackingEditLocId(loc.id);
                                  setTrackingLocForm({ commissionRate: (loc.commissionRate * 100).toFixed(0), status: loc.status });
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-amber-600 transition-colors"
                            >
                              <Pencil size={12} />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-caption">
                            <div><span className="text-slate-400 font-bold uppercase block">{t.machineIdLabel}</span><span className="font-black text-slate-700">{loc.machineId}</span></div>
                            <div><span className="text-slate-400 font-bold uppercase block">{t.lastScore}</span><span className="font-black text-slate-700">{loc.lastScore.toLocaleString()}</span></div>
                            <div><span className="text-slate-400 font-bold uppercase block">{t.commissionLabel}</span><span className="font-black text-amber-600">{(loc.commissionRate * 100).toFixed(0)}%</span></div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {loc.status !== 'active' && (
                              <span className="px-2 py-1 rounded-lg text-caption font-black uppercase bg-amber-50 text-amber-700 border border-amber-100">
                                {loc.status}
                              </span>
                            )}
                            {loc.resetLocked && (
                              <span className="px-2 py-1 rounded-lg text-caption font-black uppercase bg-rose-50 text-rose-700 border border-rose-100">
                                {t.resetLocked}
                              </span>
                            )}
                            {loc.lastScore >= 9000 && (
                              <span className="px-2 py-1 rounded-lg text-caption font-black uppercase bg-rose-50 text-rose-700 border border-rose-100">
                                {t.risk9999}
                              </span>
                            )}
                            {loc.area && (
                              <span className="px-2 py-1 rounded-lg text-caption font-black uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                {loc.area}
                              </span>
                            )}
                          </div>
                          {isEditingThis && (
                            <div className="mt-3 border-t border-slate-200 pt-3 space-y-3 animate-in slide-in-from-top-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-caption font-black text-slate-400 uppercase mb-1 block">{t.commissionLabel} (%)</label>
                                  <input
                                    type="number"
                                    value={trackingLocForm.commissionRate}
                                    onChange={e => setTrackingLocForm(f => ({ ...f, commissionRate: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-black outline-none"
                                    placeholder="15"
                                  />
                                </div>
                                <div>
                                  <label className="text-caption font-black text-slate-400 uppercase mb-1 block">{lang === 'zh' ? '状态' : 'Status'}</label>
                                  <select
                                    value={trackingLocForm.status}
                                    onChange={e => setTrackingLocForm(f => ({ ...f, status: e.target.value as Location['status'] }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-black outline-none"
                                  >
                                    <option value="active">Active</option>
                                    <option value="maintenance">Maintenance</option>
                                    <option value="broken">Broken</option>
                                  </select>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  const rate = parseFloat(trackingLocForm.commissionRate) / 100;
                                  if (!isNaN(rate) && rate >= 0 && rate <= 1) {
                                    const updated = locations.map(l => l.id === loc.id ? { ...l, commissionRate: rate, status: trackingLocForm.status, isSynced: false } : l);
                                    onUpdateLocations(updated);
                                    setTrackingEditLocId(null);
                                  }
                                }}
                                className="w-full py-2.5 bg-amber-600 text-white rounded-xl text-caption font-black uppercase"
                              >
                                {t.saveChanges}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  {driver.currentGps && (
                    <div className="flex items-center gap-2 text-caption font-bold text-slate-400 uppercase pt-1">
                      <Navigation size={10} className="text-amber-500 animate-pulse" />
                      GPS: {driver.currentGps.lat.toFixed(4)}, {driver.currentGps.lng.toFixed(4)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-sm select-none">
          <div className="flex items-center gap-3">
            <MapPin size={18} className="text-amber-500" />
            <span className="text-sm font-black text-slate-900 uppercase">{t.liveMapTitle}</span>
          </div>
          <span className="text-caption font-black text-slate-400 uppercase group-open:hidden">{t.mapExpand} ▼</span>
          <span className="text-caption font-black text-slate-400 uppercase hidden group-open:block">{t.mapCollapse} ▲</span>
        </summary>
        <div className="mt-4">
          <MapErrorBoundary>
            <Suspense fallback={<MapLoadingFallback />}>
              <LiveMap drivers={trackingDriverCards.map(item => item.driver)} locations={trackingVisibleLocations} transactions={trackingVisibleTransactions} lang={lang} />
            </Suspense>
          </MapErrorBoundary>
        </div>
      </details>
    </div>
  );
};

export default React.memo(TrackingTab);
