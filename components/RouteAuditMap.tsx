import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Driver, Location, Transaction, TRANSLATIONS } from '../types';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

interface RouteAuditMapProps {
  driver: Driver;
  locations: Location[];
  transactions: Transaction[];
  date: string; // YYYY-MM-DD
  lang: 'zh' | 'sw';
}

const RouteAuditMap: React.FC<RouteAuditMapProps> = ({ driver, locations, transactions, date, lang }) => {
  const t = TRANSLATIONS[lang];
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

  const gpsAuditData = auditData.filter(item => item.tx.gps);

  const center: [number, number] = gpsAuditData.length > 0 && gpsAuditData[0].tx.gps
    ? [gpsAuditData[0].tx.gps!.lat, gpsAuditData[0].tx.gps!.lng]
    : [-6.7924, 39.2083];

  const offsiteCount = auditData.filter(d => d.isOffsite).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <div>
          <h3 className="text-sm font-black text-slate-900 uppercase text-center">{t.routeAuditTitle}</h3>
          <p className="text-caption font-bold text-slate-400 uppercase tracking-widest">{driver.name} • {date}</p>
        </div>
        {offsiteCount > 0 ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 animate-pulse">
            <AlertTriangle size={12} />
            <span className="text-caption font-black uppercase">{offsiteCount} {t.positionOffsetCount}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
            <CheckCircle2 size={12} />
            <span className="text-caption font-black uppercase">{t.routeCompliant}</span>
          </div>
        )}
      </div>

      {gpsAuditData.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
          <p className="text-sm font-black">{lang === 'zh' ? '当天没有可用 GPS 轨迹' : 'No GPS trail available for this day'}</p>
        </div>
      ) : (
      <div className="w-full h-[420px] rounded-[28px] overflow-hidden border-2 border-slate-100 relative shadow-inner">
        <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <Polyline 
            positions={gpsAuditData.map(d => [d.tx.gps!.lat, d.tx.gps!.lng])}
            pathOptions={{ color: '#6366f1', weight: 2, dashArray: '5, 10' }}
          />

          {gpsAuditData.map(({ tx, loc, distance, isOffsite }, idx) => (
            <React.Fragment key={tx.id}>
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
                    <p className="text-caption font-black text-slate-900 uppercase">{tx.locationName}</p>
                    <div className="flex items-center gap-2 text-caption font-bold text-slate-400">
                      <Clock size={10}/> {new Date(tx.timestamp).toLocaleTimeString()}
                    </div>
                    {isOffsite && (
                      <div className="p-2 bg-rose-50 text-rose-600 rounded-lg border border-rose-100">
                        <p className="text-caption font-black uppercase">⚠️ {t.offsiteDistance} {Math.round(distance)} {t.metersUnit}</p>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>

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
           <p className="text-caption font-bold text-slate-400 uppercase leading-tight">{t.mapLegend}</p>
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-indigo-600 border border-white"></div>
              <span className="text-caption font-black text-slate-600 uppercase">{t.normalCollectionPoint}</span>
           </div>
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-rose-500 border border-white animate-pulse"></div>
              <span className="text-caption font-black text-slate-600 uppercase">{t.offsitePoint}</span>
           </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default RouteAuditMap;
