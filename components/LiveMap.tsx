import L from 'leaflet';
import { Navigation, Route, ShieldCheck } from 'lucide-react';
import React, { Suspense, lazy, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';

import 'leaflet/dist/leaflet.css';
import { Driver, Location, Transaction, TRANSLATIONS } from '../types';

import { MapErrorBoundary, MapLoadingFallback } from './MapErrorBoundary';

const RouteAuditMap = lazy(() => import('./RouteAuditMap'));
const DEFAULT_CENTER: [number, number] = [-6.7924, 39.2083];

// Use plain SVG strings to avoid react-dom/server renderToString at module level
const truckSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect x="9" y="11" width="14" height="10" rx="1"/><circle cx="12" cy="21" r="1"/><circle cx="20" cy="21" r="1"/></svg>`;
const mapPinSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
const alertSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

const driverIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #4f46e5; padding: 8px; border-radius: 12px; border: 2px solid white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); color: white;">${truckSvg}</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const inactiveDriverIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #94a3b8; padding: 8px; border-radius: 12px; border: 2px solid white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); color: white;">${truckSvg}</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const locationIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #06b6d4; padding: 6px; border-radius: 50%; border: 2px solid white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); color: white;">${mapPinSvg}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const brokenLocationIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #ef4444; padding: 6px; border-radius: 50%; border: 2px solid white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); color: white;">${alertSvg}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

interface LiveMapProps {
  drivers: Driver[];
  locations: Location[];
  transactions: Transaction[];
  onNavigate?: (id: string) => void;
  lang: 'zh' | 'sw';
}

const LiveMap: React.FC<LiveMapProps> = ({ drivers, locations, transactions, lang }) => {
  const [auditDriverId, setAuditDriverId] = useState<string | null>(null);
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split('T')[0]);
  const t = TRANSLATIONS[lang];

  const activeDrivers = useMemo(() => drivers.filter(d => d.currentGps), [drivers]);
  const mappedLocations = useMemo(() => locations.filter(l => l.coords), [locations]);
  const isUsingDefaultCenter = activeDrivers.length === 0;

  const trajectories = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const grouped: Record<string, [number, number][]> = {};
    const validTxs = transactions
      .filter(t => t.gps && t.gps.lat && t.gps.lng && t.timestamp.startsWith(today))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    validTxs.forEach(t => {
      if (!grouped[t.driverId]) grouped[t.driverId] = [];
      grouped[t.driverId].push([t.gps.lat, t.gps.lng]);
    });

    activeDrivers.forEach(d => {
       if (grouped[d.id] && d.currentGps) {
          grouped[d.id].push([d.currentGps.lat, d.currentGps.lng]);
       }
    });
    return grouped;
  }, [transactions, activeDrivers]);

  const dynamicCenter = useMemo((): [number, number] => {
    if (activeDrivers.length === 0) return DEFAULT_CENTER;
    const avgLat = activeDrivers.reduce((sum, d) => sum + (d.currentGps?.lat || 0), 0) / activeDrivers.length;
    const avgLng = activeDrivers.reduce((sum, d) => sum + (d.currentGps?.lng || 0), 0) / activeDrivers.length;
    return [avgLat, avgLng];
  }, [activeDrivers]);

  const getTimeAgo = (dateStr?: string) => {
    if (!dateStr) return lang === 'zh' ? '未知' : 'Unknown';
    const seconds = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return lang === 'zh' ? '刚刚' : 'Just now';
    if (seconds < 3600) return lang === 'zh' ? `${Math.floor(seconds / 60)}分钟前` : `${Math.floor(seconds / 60)} min ago`;
    return lang === 'zh' ? `${Math.floor(seconds / 3600)}小时前` : `${Math.floor(seconds / 3600)} hr ago`;
  };

  return (
    <div className="space-y-4">
      {/* GPS unavailable banner */}
      {isUsingDefaultCenter && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          <span>⚠️</span>
          <span>{t.gpsUnavailableBanner}</span>
        </div>
      )}
      <div className="bg-slate-900 rounded-card p-4 flex flex-wrap items-center justify-between gap-4 border border-white/10 shadow-xl">
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 border-r border-white/10">
               <ShieldCheck size={18} className="text-amber-400" />
               <span className="text-[10px] font-black text-white uppercase tracking-widest">{t.trackingTitle}</span>
            </div>
            
            <select 
              value={auditDriverId || ''} 
              onChange={e => setAuditDriverId(e.target.value || null)}
              className="bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black text-white outline-none focus:border-amber-500"
            >
               <option value="" className="text-slate-900">实时模式 (Real-time)</option>
               {drivers.map(d => <option key={d.id} value={d.id} className="text-slate-900">{d.name}</option>)}
            </select>

            {auditDriverId && (
              <input 
                type="date" 
                value={auditDate} 
                onChange={e => setAuditDate(e.target.value)}
                className="bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black text-white outline-none focus:border-amber-500"
              />
            )}
         </div>
         <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-caption font-black uppercase text-slate-300">
           {activeDrivers.length} {t.liveNow} · {mappedLocations.length} {t.mappedSites}
         </div>
      </div>

      {auditDriverId ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <MapErrorBoundary>
            <Suspense fallback={<MapLoadingFallback />}>
              <RouteAuditMap 
                driver={drivers.find(d => d.id === auditDriverId)!}
                locations={locations}
                transactions={transactions}
                date={auditDate}
                lang={lang}
              />
            </Suspense>
          </MapErrorBoundary>
        </div>
      ) : (
        <div className="w-full h-[520px] rounded-card overflow-hidden border-2 border-white shadow-xl relative">
          <MapContainer center={dynamicCenter} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {Object.entries(trajectories).map(([driverId, path]) => (
              <Polyline 
                key={`path-${driverId}`}
                positions={path}
                pathOptions={{ color: '#6366f1', weight: 3, opacity: 0.6, dashArray: '10, 10' }}
              />
            ))}

            {activeDrivers.map(driver => (
              <Marker key={driver.id} position={[driver.currentGps!.lat, driver.currentGps!.lng]} icon={driver.status === 'active' ? driverIcon : inactiveDriverIcon}>
                <Popup>
                  <div className="p-2 min-w-[160px]">
                    <p className="text-xs font-black text-slate-900">{driver.name}</p>
                    <p className="text-caption font-bold text-slate-400 uppercase">{driver.vehicleInfo.plate}</p>
                    <div className="mt-2 text-[10px] space-y-1">
                      <div className="flex justify-between"><span>{lang === 'zh' ? '上次活跃:' : 'Last active:'}</span><b>{getTimeAgo(driver.lastActive)}</b></div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {mappedLocations.map(loc => (
              <Marker key={loc.id} position={[loc.coords!.lat, loc.coords!.lng]} icon={loc.status === 'broken' ? brokenLocationIcon : locationIcon}>
                <Popup>
                  <div className="p-1 min-w-[140px]">
                    <p className="text-xs font-black text-slate-900">{loc.name}</p>
                    <p className="text-caption text-slate-400 uppercase font-bold">{loc.machineId}</p>
                    <button
                      onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${loc.coords!.lat},${loc.coords!.lng}`, '_blank')}
                      className="mt-2 w-full flex items-center justify-center gap-1 rounded-lg bg-amber-600 px-2 py-1.5 text-[10px] font-black uppercase text-white hover:bg-amber-700 transition-colors"
                    >
                      <Navigation size={11} />
                      {t.navigateTo}
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-md p-4 rounded-3xl border border-white/20 shadow-xl pointer-events-none">
             <div className="flex items-center gap-4">
                <div className="flex flex-col items-center">
                   <span className="text-[10px] font-black text-slate-400 uppercase leading-none">{t.liveNow}</span>
                   <span className="text-lg font-black text-amber-600">{activeDrivers.length}</span>
                </div>
                <div className="w-px h-8 bg-slate-200"></div>
                <div className="flex flex-col items-center">
                   <span className="text-[10px] font-black text-slate-400 uppercase leading-none">{t.trackedRoutes}</span>
                   <span className="text-lg font-black text-amber-600 flex items-center gap-1"><Route size={16}/> {Object.keys(trajectories).length}</span>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveMap;
