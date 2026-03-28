/**
 * OfflineRouteMap.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Shows the driver's daily route from GPS-tagged transactions.
 * Works 100% offline — uses an SVG canvas, no map tiles needed.
 * When internet is available, shows an embedded Google/OSM static map link.
 */

import React, { useMemo, useRef, useState } from 'react';
import { MapPin, Clock, Wifi, WifiOff, Navigation, Route, ChevronDown, ChevronUp } from 'lucide-react';
import { Transaction } from '../types';

interface OfflineRouteMapProps {
  transactions: Transaction[];
  driverId: string;
  driverName: string;
  date?: string;          // YYYY-MM-DD, defaults to today
  isOnline?: boolean;
  lang?: 'zh' | 'sw';
}

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

interface RoutePoint {
  tx: Transaction;
  lat: number;
  lng: number;
  label: string;
  time: string;
}

const OfflineRouteMap: React.FC<OfflineRouteMapProps> = ({
  transactions,
  driverId,
  driverName,
  date,
  isOnline = false,
  lang = 'sw',
}) => {
  const targetDate = date || new Date().toISOString().split('T')[0];
  const [expanded, setExpanded] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);

  // ── Build route points from today's GPS-tagged transactions ────────────────
  const routePoints: RoutePoint[] = useMemo(() => {
    return transactions
      .filter(
        (t) =>
          t.driverId === driverId &&
          t.timestamp.startsWith(targetDate) &&
          t.gps &&
          t.gps.lat !== 0 &&
          t.gps.lng !== 0
      )
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((tx, i) => ({
        tx,
        lat: tx.gps.lat,
        lng: tx.gps.lng,
        label: tx.locationName || `Stop ${i + 1}`,
        time: new Date(tx.timestamp).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }),
      }));
  }, [transactions, driverId, targetDate]);

  // ── SVG projection ─────────────────────────────────────────────────────────
  const SVG_W = 400;
  const SVG_H = 260;
  const PADDING = 32;

  const projection = useMemo(() => {
    if (routePoints.length === 0) return null;
    const lats = routePoints.map((p) => p.lat);
    const lngs = routePoints.map((p) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

    // Add padding
    const latSpan = Math.max(maxLat - minLat, 0.002);
    const lngSpan = Math.max(maxLng - minLng, 0.002);

    const toSvg = (lat: number, lng: number) => ({
      x: PADDING + ((lng - minLng) / lngSpan) * (SVG_W - PADDING * 2),
      // Invert Y axis (SVG top = north)
      y: PADDING + ((maxLat - lat) / latSpan) * (SVG_H - PADDING * 2),
    });

    return { toSvg, minLat, maxLat, minLng, maxLng };
  }, [routePoints]);

  const svgPoints = useMemo(
    () => (projection ? routePoints.map((p) => projection.toSvg(p.lat, p.lng)) : []),
    [routePoints, projection]
  );

  const polylinePoints = useMemo(
    () => svgPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    [svgPoints]
  );

  // ── Google Maps link (online only) ────────────────────────────────────────
  const googleMapsUrl = useMemo(() => {
    if (!isOnline || routePoints.length < 2) return null;
    const waypoints = routePoints
      .slice(1, -1)
      .map((p) => encodeURIComponent(`${p.lat},${p.lng}`))
      .join('|');
    const origin = encodeURIComponent(`${routePoints[0].lat},${routePoints[0].lng}`);
    const dest   = encodeURIComponent(`${routePoints[routePoints.length - 1].lat},${routePoints[routePoints.length - 1].lng}`);
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`;
    if (waypoints) url += `&waypoints=${waypoints}`;
    return url;
  }, [isOnline, routePoints]);

  const totalRevenue = useMemo(() => routePoints.reduce((s, p) => s + p.tx.revenue, 0), [routePoints]);

  // ── Summary strip ─────────────────────────────────────────────────────────
  const summary = (
    <div className="flex items-center gap-4 px-4 py-3 bg-slate-50 border-t border-slate-100 text-[9px] font-black text-slate-500 uppercase overflow-x-auto scrollbar-hide">
      <span className="flex items-center gap-1 whitespace-nowrap">
        <Route size={10} className="text-indigo-500" /> {routePoints.length} stops
      </span>
      <span className="flex items-center gap-1 whitespace-nowrap">
        <MapPin size={10} className="text-amber-500" /> TZS {totalRevenue.toLocaleString()}
      </span>
      {routePoints.length >= 2 && (
        <span className="flex items-center gap-1 whitespace-nowrap">
          <Clock size={10} className="text-slate-400" /> {routePoints[0].time} → {routePoints[routePoints.length - 1].time}
        </span>
      )}
      <span className={`flex items-center gap-1 ml-auto whitespace-nowrap ${isOnline ? 'text-emerald-600' : 'text-amber-500'}`}>
        {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
        {isOnline ? 'Online' : 'Offline Map'}
      </span>
    </div>
  );

  return (
    <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-indigo-50 rounded-xl text-indigo-600">
            <Navigation size={14} />
          </div>
          <div className="text-left">
            <p className="text-[11px] font-black text-slate-900 uppercase">
              {lang === 'zh' ? '今日线路图' : "Today's Route"}
            </p>
            <p className="text-[8px] font-bold text-slate-400 uppercase">{targetDate} • {driverName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {routePoints.length > 0 && (
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg text-[8px] font-black">
              {routePoints.length}
            </span>
          )}
          {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <>
          {routePoints.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <MapPin size={32} className="mx-auto text-slate-200 mb-3" />
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                {lang === 'zh' ? '今日暂无带GPS的记录' : 'No GPS records for today yet'}
              </p>
              <p className="text-[8px] font-bold text-slate-300 mt-1">
                {lang === 'zh' ? '提交采集记录后将在此显示路线' : 'Submit collections to see route'}
              </p>
            </div>
          ) : (
            <>
              {/* SVG Route Map */}
              <div className="relative bg-slate-900 mx-3 mb-3 mt-1 rounded-[18px] overflow-hidden" style={{ height: '200px' }}>
                {/* Grid background */}
                <svg width="100%" height="100%" className="absolute inset-0 opacity-10">
                  <defs>
                    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#ffffff" strokeWidth="0.5"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>

                {/* Compass */}
                <div className="absolute top-2 right-2 text-white/30 text-[8px] font-black flex flex-col items-center">
                  <span>N</span>
                  <span className="text-[6px]">↑</span>
                </div>

                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                  className="w-full h-full"
                  preserveAspectRatio="xMidYMid meet"
                >
                  {/* Route polyline */}
                  {svgPoints.length >= 2 && (
                    <polyline
                      points={polylinePoints}
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="2"
                      strokeDasharray="6 3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.8"
                    />
                  )}

                  {/* Stop points */}
                  {svgPoints.map((pt, i) => {
                    const rp = routePoints[i];
                    const isFirst = i === 0;
                    const isLast  = i === routePoints.length - 1;
                    const color   = isFirst ? '#10b981' : isLast ? '#ef4444' : COLORS[i % COLORS.length];
                    return (
                      <g key={rp.tx.id}>
                        {/* Outer glow */}
                        <circle cx={pt.x} cy={pt.y} r={8} fill={color} opacity="0.2" />
                        {/* Main dot */}
                        <circle cx={pt.x} cy={pt.y} r={5} fill={color} stroke="white" strokeWidth="1.5" />
                        {/* Label */}
                        <text
                          x={pt.x}
                          y={pt.y - 10}
                          textAnchor="middle"
                          fill="white"
                          fontSize="7"
                          fontWeight="900"
                          fontFamily="system-ui, sans-serif"
                        >
                          {rp.time}
                        </text>
                        <text
                          x={pt.x}
                          y={pt.y + 18}
                          textAnchor="middle"
                          fill="rgba(255,255,255,0.6)"
                          fontSize="6"
                          fontFamily="system-ui, sans-serif"
                        >
                          {rp.label.length > 12 ? rp.label.substring(0, 10) + '…' : rp.label}
                        </text>
                        {/* Start / End label */}
                        {(isFirst || isLast) && (
                          <text
                            x={pt.x}
                            y={pt.y - 20}
                            textAnchor="middle"
                            fill={color}
                            fontSize="7"
                            fontWeight="900"
                            fontFamily="system-ui, sans-serif"
                          >
                            {isFirst ? '▶ START' : '■ END'}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* Legend */}
                <div className="absolute bottom-2 left-3 flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[7px] font-black text-emerald-400">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" /> Start
                  </span>
                  <span className="flex items-center gap-1 text-[7px] font-black text-rose-400">
                    <div className="w-2 h-2 rounded-full bg-rose-400" /> End
                  </span>
                  <span className="flex items-center gap-1 text-[7px] font-black text-slate-400">
                    <div className="w-4 border-t border-dashed border-indigo-400" /> Route
                  </span>
                </div>

                {/* Offline badge */}
                {!isOnline && (
                  <div className="absolute top-2 left-3 flex items-center gap-1 px-2 py-1 bg-amber-500/20 border border-amber-500/30 rounded-lg">
                    <WifiOff size={8} className="text-amber-400" />
                    <span className="text-[7px] font-black text-amber-400 uppercase">Offline Map</span>
                  </div>
                )}
              </div>

              {/* Timeline list */}
              <div className="px-3 mb-3 space-y-1.5 max-h-40 overflow-y-auto">
                {routePoints.map((rp, i) => (
                  <div key={rp.tx.id} className="flex items-center gap-2.5 bg-slate-50 rounded-xl px-3 py-2">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-black text-white flex-shrink-0"
                      style={{ background: i === 0 ? '#10b981' : i === routePoints.length - 1 ? '#ef4444' : COLORS[i % COLORS.length] }}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-slate-900 truncate">{rp.label}</p>
                      <p className="text-[8px] font-bold text-slate-400">{rp.time}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[9px] font-black text-indigo-600">TZS {rp.tx.revenue.toLocaleString()}</p>
                      <p className="text-[7px] font-bold text-slate-400">
                        {rp.lat.toFixed(4)}, {rp.lng.toFixed(4)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Open in Google Maps (online only) */}
              {googleMapsUrl && (
                <div className="px-3 mb-3">
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase active:scale-95 transition-all"
                  >
                    <Navigation size={12} />
                    {lang === 'zh' ? '在谷歌地图中查看完整路线' : 'Open Full Route in Google Maps'}
                  </a>
                </div>
              )}
            </>
          )}
          {summary}
        </>
      )}
    </div>
  );
};

export default OfflineRouteMap;
