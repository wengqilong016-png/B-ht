import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Driver, Location, Transaction } from '../types';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

interface RouteAuditMapProps {
  driver: Driver;
  locations: Location[];
  transactions: Transaction[];
  date: string; // YYYY-MM-DD
}

const RouteAuditMap: React.FC<RouteAuditMapProps> = ({ driver, locations, transactions, date }) => {
  // 1. 筛选该司机当日的所有交易
  const dailyTxs = useMemo(() => {
    return transactions
      .filter(t => t.driverId === driver.id && t.timestamp.startsWith(date))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [transactions, driver.id, date]);

  // 2. 构建审计数据：对比交易 GPS 与网点实际坐标
  const auditData = useMemo(() => {
    return dailyTxs.map(tx => {
      const loc = locations.find(l => l.id === tx.locationId);
      let distance = 0;
      let isOffsite = false;

      if (tx.gps && loc?.coords) {
        // 简单的球面距离计算 (meters)
        const R = 6371e3;
        const φ1 = tx.gps.lat * Math.PI/180;
        const φ2 = loc.coords.lat * Math.PI/180;
        const Δφ = (loc.coords.lat - tx.gps.lat) * Math.PI/180;
        const Δλ = (loc.coords.lng - tx.gps.lng) * Math.PI/180;
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distance = R * c;
        isOffsite = distance > 200; // 偏移超过200米标记为异常
      }

      return { tx, loc, distance, isOffsite };
    });
  }, [dailyTxs, locations]);

  const center: [number, number] = auditData.length > 0 && auditData[0].tx.gps
    ? [auditData[0].tx.gps.lat, auditData[0].tx.gps.lng]
    : [-6.7924, 39.2083];

  const offsiteCount = auditData.filter(d => d.isOffsite).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <div>
          <h3 className="text-sm font-black text-slate-900 uppercase text-center">巡检审计地图 (Google Maps 底图)</h3>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{driver.name} • {date}</p>
        </div>
        {offsiteCount > 0 ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 animate-pulse">
            <AlertTriangle size={12} />
            <span className="text-[10px] font-black uppercase">{offsiteCount} 处位置偏移异常</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
            <CheckCircle2 size={12} />
            <span className="text-[10px] font-black uppercase">轨迹合规</span>
          </div>
        )}
      </div>

      <div className="w-full h-[450px] rounded-[32px] overflow-hidden border-2 border-slate-100 relative shadow-inner">
        <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          {/* 使用 Google Maps 卫星混合图层 */}
          <TileLayer
            url="https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}"
            subdomains={['mt0','mt1','mt2','mt3']}
            attribution='&copy; Google Maps'
          />
          
          {/* 渲染连接线（巡检路径） */}
          <Polyline 
            positions={auditData.filter(d => d.tx.gps).map(d => [d.tx.gps!.lat, d.tx.gps!.lng])}
            pathOptions={{ color: '#6366f1', weight: 2, dashArray: '5, 10' }}
          />

          {auditData.map(({ tx, loc, distance, isOffsite }, idx) => (
            <React.Fragment key={tx.id}>
              {/* 交易发生点 */}
              <Marker 
                position={[tx.gps!.lat, tx.gps!.lng]}
                icon={L.divIcon({
                  className: 'custom-audit-icon',
                  html: `<div style="background: ${isOffsite ? '#ef4444' : '#4f46e5'}; width: 24px; height: 24px; border-radius: 50%; display: flex; items-center; justify-center; color: white; font-size: 10px; font-weight: 900; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); line-height: 24px; text-align: center;">${idx + 1}</div>`,
                  iconSize: [24, 24],
                  iconAnchor: [12, 12]
                })}
              >
                <Popup>
                  <div className="p-2 space-y-2">
                    <p className="text-[10px] font-black text-slate-900 uppercase">{tx.locationName}</p>
                    <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400">
                      <Clock size={10}/> {new Date(tx.timestamp).toLocaleTimeString()}
                    </div>
                    {isOffsite && (
                      <div className="p-2 bg-rose-50 text-rose-600 rounded-lg border border-rose-100">
                        <p className="text-[8px] font-black uppercase">⚠️ 偏离网点 {Math.round(distance)} 米</p>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>

              {/* 渲染偏移线 */}
              {isOffsite && loc?.coords && (
                <>
                  <Polyline 
                    positions={[[tx.gps!.lat, tx.gps!.lng], [loc.coords.lat, loc.coords.lng]]}
                    pathOptions={{ color: '#ef4444', weight: 1, dashArray: '2, 4' }}
                  />
                  <Circle 
                    center={[loc.coords.lat, loc.coords.lng]} 
                    radius={20}
                    pathOptions={{ color: '#94a3b8', fillColor: '#94a3b8', fillOpacity: 0.2 }}
                  />
                </>
              )}
            </React.Fragment>
          ))}
        </MapContainer>

        {/* 悬浮图例 */}
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-md p-3 rounded-2xl border border-slate-200 shadow-lg z-[1000] space-y-2">
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-indigo-600 border border-white"></div>
              <span className="text-[8px] font-black text-slate-600 uppercase">正常采集点</span>
           </div>
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-rose-500 border border-white animate-pulse"></div>
              <span className="text-[8px] font-black text-slate-600 uppercase">异常偏移点</span>
           </div>
           <div className="w-full h-px bg-slate-100"></div>
           <p className="text-[7px] font-bold text-slate-400 uppercase leading-tight">基于 Google 卫星图层分析</p>
        </div>
      </div>
    </div>
  );
};

export default RouteAuditMap;
