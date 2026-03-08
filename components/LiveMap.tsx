
import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Driver, Location, Transaction } from '../types';
import { Navigation, Clock, ShieldCheck, Route, Map as MapIcon, Satellite } from 'lucide-react';
import RouteAuditMap from './RouteAuditMap';

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
}

const LiveMap: React.FC<LiveMapProps> = ({ drivers, locations, transactions }) => {
  const [auditDriverId, setAuditDriverId] = useState<string | null>(null);
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split('T')[0]);
  const [mapMode, setMapMode] = useState<'standard' | 'satellite'>('standard');

  const defaultCenter: [number, number] = [-6.7924, 39.2083];
  const activeDrivers = useMemo(() => drivers.filter(d => d.currentGps), [drivers]);
  const mappedLocations = useMemo(() => locations.filter(l => l.coords), [locations]);

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
    if (activeDrivers.length === 0) return defaultCenter;
    const avgLat = activeDrivers.reduce((sum, d) => sum + (d.currentGps?.lat || 0), 0) / activeDrivers.length;
    const avgLng = activeDrivers.reduce((sum, d) => sum + (d.currentGps?.lng || 0), 0) / activeDrivers.length;
    return [avgLat, avgLng];
  }, [activeDrivers]);

  const getTimeAgo = (dateStr?: string) => {
    if (!dateStr) return '未知';
    const seconds = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return '刚刚';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
    return `${Math.floor(seconds / 3600)}小时前`;
  };

  return (
    <div className="space-y-6">
      {/* 顶部综合控制栏 */}
      <div className="bg-slate-900 rounded-[32px] p-4 flex flex-wrap items-center justify-between gap-4 border border-white/10 shadow-xl">
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 border-r border-white/10">
               <ShieldCheck size={18} className="text-indigo-400" />
               <span className="text-[10px] font-black text-white uppercase tracking-widest">审计与全览</span>
            </div>
            
            <select 
              value={auditDriverId || ''} 
              onChange={e => setAuditDriverId(e.target.value || null)}
              className="bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black text-white outline-none focus:border-indigo-500"
            >
               <option value="" className="text-slate-900">实时模式 (Real-time)</option>
               {drivers.map(d => <option key={d.id} value={d.id} className="text-slate-900">{d.name}</option>)}
            </select>

            {auditDriverId && (
              <input 
                type="date" 
                value={auditDate} 
                onChange={e => setAuditDate(e.target.value)}
                className="bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black text-white outline-none focus:border-indigo-500"
              />
            )}
         </div>

         <div className="flex bg-white/5 p-1 rounded-xl">
            <button 
              onClick={() => setMapMode('standard')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${mapMode === 'standard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
               <MapIcon size={12}/> Standard
            </button>
            <button 
              onClick={() => setMapMode('satellite')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${mapMode === 'satellite' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
               <Satellite size={12}/> Satellite
            </button>
         </div>
      </div>

      {auditDriverId ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <RouteAuditMap 
            driver={drivers.find(d => d.id === auditDriverId)!}
            locations={locations}
            transactions={transactions}
            date={auditDate}
          />
        </div>
      ) : (
        <div className="w-full h-[650px] rounded-[40px] overflow-hidden border-4 border-white shadow-2xl relative">
          <MapContainer center={dynamicCenter} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            {mapMode === 'standard' ? (
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            ) : (
              <TileLayer
                url="https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}"
                subdomains={['mt0','mt1','mt2','mt3']}
                attribution='&copy; Google Maps'
              />
            )}
            
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
                    <p className="text-[9px] font-bold text-slate-400 uppercase">{driver.vehicleInfo.plate}</p>
                    <div className="mt-2 text-[10px] space-y-1">
                      <div className="flex justify-between"><span>上次活跃:</span><b>{getTimeAgo(driver.lastActive)}</b></div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {mappedLocations.map(loc => (
              <Marker key={loc.id} position={[loc.coords!.lat, loc.coords!.lng]} icon={loc.status === 'broken' ? brokenLocationIcon : locationIcon}>
                <Popup>
                  <div className="p-1">
                    <p className="text-xs font-black text-slate-900">{loc.name}</p>
                    <p className="text-[9px] text-slate-400 uppercase font-bold">{loc.machineId}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-md p-4 rounded-3xl border border-white/20 shadow-xl pointer-events-none">
             <div className="flex items-center gap-4">
                <div className="flex flex-col items-center">
                   <span className="text-[10px] font-black text-slate-400 uppercase leading-none">活跃司机</span>
                   <span className="text-lg font-black text-indigo-600">{activeDrivers.length}</span>
                </div>
                <div className="w-px h-8 bg-slate-200"></div>
                <div className="flex flex-col items-center">
                   <span className="text-[10px] font-black text-slate-400 uppercase leading-none">巡检路径</span>
                   <span className="text-lg font-black text-indigo-600 flex items-center gap-1"><Route size={16}/> {Object.keys(trajectories).length}</span>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveMap;
