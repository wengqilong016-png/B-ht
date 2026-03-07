
import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Driver, Location, Transaction } from '../types';
import { Navigation, Clock, ShieldCheck, Route } from 'lucide-react';

// Use plain SVG strings to avoid react-dom/server renderToString at module level
// (which crashes on iOS Safari before React is mounted)
const truckSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect x="9" y="11" width="14" height="10" rx="1"/><circle cx="12" cy="21" r="1"/><circle cx="20" cy="21" r="1"/></svg>`;
const mapPinSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
const alertSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

// 修复 Leaflet 默认图标在 Vite 中的路径问题
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

// 自动调整地图视角的组件
const ChangeView = ({ center, zoom }: { center: [number, number], zoom: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom]);
  return null;
};

const LiveMap: React.FC<LiveMapProps> = ({ drivers, locations, transactions }) => {
  // 默认中心点：达累斯萨拉姆 (Dar es Salaam, Tanzania)
  const defaultCenter: [number, number] = [-6.7924, 39.2083];

  const activeDrivers = useMemo(() => drivers.filter(d => d.currentGps), [drivers]);
  const mappedLocations = useMemo(() => locations.filter(l => l.coords), [locations]);

  // 计算今日所有司机的轨迹线数据
  const trajectories = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const grouped: Record<string, [number, number][]> = {};

    // 筛选出有有效 GPS 的交易，并按时间正序排列
    const validTxs = transactions
      .filter(t => t.gps && t.gps.lat && t.gps.lng && t.timestamp.startsWith(today))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    validTxs.forEach(t => {
      if (!grouped[t.driverId]) grouped[t.driverId] = [];
      grouped[t.driverId].push([t.gps.lat, t.gps.lng]);
    });

    // 为每个司机的当前实时位置添加最后一点，使线连到车子
    activeDrivers.forEach(d => {
       if (grouped[d.id] && d.currentGps) {
          grouped[d.id].push([d.currentGps.lat, d.currentGps.lng]);
       }
    });

    return grouped;
  }, [transactions, activeDrivers]);

  // 计算一个合适的中心点（所有司机的平均位置）
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
    <div className="w-full h-[600px] rounded-[40px] overflow-hidden border-4 border-white shadow-2xl relative">
      <MapContainer 
        center={dynamicCenter} 
        zoom={13} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* 渲染轨迹线 */}
        {Object.entries(trajectories).map(([driverId, path]) => (
          <Polyline 
            key={`path-${driverId}`}
            positions={path}
            pathOptions={{ 
              color: '#6366f1', 
              weight: 3, 
              opacity: 0.6, 
              dashArray: '10, 10',
              lineJoin: 'round'
            }}
          />
        ))}

        {/* 渲染司机标记 */}
        {activeDrivers.map(driver => (
          <Marker 
            key={driver.id} 
            position={[driver.currentGps!.lat, driver.currentGps!.lng]}
            icon={driver.status === 'active' ? driverIcon : inactiveDriverIcon}
          >
            <Popup className="custom-popup">
              <div className="p-2 min-w-[160px]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-black">
                    {driver.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900">{driver.name}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">{driver.vehicleInfo.plate}</p>
                  </div>
                </div>
                <div className="space-y-1 bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-400 flex items-center gap-1 font-bold uppercase"><Clock size={10}/> 更新时间</span>
                    <span className="text-slate-900 font-black">{getTimeAgo(driver.lastActive)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-400 flex items-center gap-1 font-bold uppercase"><Navigation size={10}/> 今日记录</span>
                    <span className="text-indigo-600 font-black">{trajectories[driver.id]?.length || 0} 个点</span>
                  </div>
                </div>
                <button className="w-full mt-2 py-2 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase flex items-center justify-center gap-1">
                   <ShieldCheck size={12} /> 联系司机
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* 渲染点位标记 */}
        {mappedLocations.map(loc => (
          <Marker 
            key={loc.id} 
            position={[loc.coords!.lat, loc.coords!.lng]}
            icon={loc.status === 'broken' ? brokenLocationIcon : locationIcon}
          >
            <Popup>
              <div className="p-1">
                <p className="text-xs font-black text-slate-900">{loc.name}</p>
                <p className="text-[9px] text-slate-400 uppercase font-bold">{loc.area} • {loc.machineId}</p>
                <div className="mt-1 flex items-center gap-1">
                   <div className={`w-2 h-2 rounded-full ${loc.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                   <span className="text-[9px] font-black uppercase text-slate-500">{loc.status}</span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* 悬浮状态栏 */}
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

      {/* Google Maps quick-open button */}
      {mappedLocations.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000]">
          <a
            href={(() => {
              const base = 'https://www.google.com/maps/dir/?api=1';
              const origin = `${mappedLocations[0].coords!.lat},${mappedLocations[0].coords!.lng}`;
              const dest   = `${mappedLocations[mappedLocations.length - 1].coords!.lat},${mappedLocations[mappedLocations.length - 1].coords!.lng}`;
              const waypoints = mappedLocations.slice(1, -1).map(l => `${l.coords!.lat},${l.coords!.lng}`).join('|');
              let url = `${base}&origin=${origin}&destination=${dest}&travelmode=driving`;
              if (waypoints) url += `&waypoints=${waypoints}`;
              return url;
            })()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 bg-white/95 backdrop-blur-sm border border-white/40 text-slate-700 rounded-2xl text-[10px] font-black uppercase shadow-lg hover:bg-white transition-all active:scale-95"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#4f46e5"/>
            </svg>
            Open in Google Maps
          </a>
        </div>
      )}
    </div>
  );
};

export default LiveMap;

