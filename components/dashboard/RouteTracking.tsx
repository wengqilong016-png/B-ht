
import React from 'react';
import { Truck, Map as MapIcon, Navigation } from 'lucide-react';

interface RouteLeg {
  locationName: string;
  time: string;
  distanceFromPrev: number;
  gps: { lat: number; lng: number };
}

interface DriverRoute {
  driverId: string;
  driverName: string;
  legs: RouteLeg[];
  totalKm: number;
}

interface RouteTrackingProps {
  routes: DriverRoute[];
  onOpenMap: () => void;
}

const RouteTracking: React.FC<RouteTrackingProps> = ({ routes, onOpenMap }) => (
  <div className="bg-white p-6 rounded-[35px] border border-slate-200 shadow-sm space-y-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600"><Truck size={20} /></div>
        <h3 className="text-lg font-black text-slate-900 uppercase">今日轨迹监控 TRACKING</h3>
      </div>
      <button onClick={onOpenMap} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-2">
        <MapIcon size={14} /> 全网地图
      </button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {routes.filter(r => r.legs.length > 0).map(route => (
        <div key={route.driverId} className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm font-black text-slate-900">{route.driverName}</p>
            <div className="text-right">
              <p className="text-[10px] font-black text-indigo-600 uppercase">预估里程</p>
              <p className="text-base font-black text-indigo-900">{route.totalKm.toFixed(1)} KM</p>
            </div>
          </div>
          <div className="space-y-3 relative">
            <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-slate-200"></div>
            {route.legs.map((leg, idx) => (
              <div key={idx} className="flex items-start gap-4 relative z-10">
                <div className={`w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[8px] font-black ${idx === 0 ? 'bg-emerald-500 text-white' : 'bg-slate-300'}`}>{idx + 1}</div>
                <div className="flex-1">
                  <div className="flex justify-between">
                    <p className="text-xs font-bold text-slate-700">{leg.locationName}</p>
                    <p className="text-[10px] font-black text-slate-400">{leg.time}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button 
            onClick={() => {
              const url = `https://www.google.com/maps/dir/${route.legs.map(l => `${l.gps.lat},${l.gps.lng}`).join('/')}`;
              window.open(url, '_blank');
            }}
            className="w-full mt-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-slate-50"
          >
            <Navigation size={12} /> Google Maps 轨迹
          </button>
        </div>
      ))}
    </div>
  </div>
);

export default RouteTracking;
