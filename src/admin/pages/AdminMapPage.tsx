import React, { useState, useMemo, Suspense } from 'react';
import { Location, Driver, Transaction } from '../../types';
import { MapAuditState } from '../../maps/shared/mapTypes';
import { Map, AlertTriangle, Route } from 'lucide-react';

/**
 * Phase 4: Admin Map Audit Page
 * A dedicated tool for trajectory auditing and spatial risk analysis.
 * Uses lazy loading to prevent blocking the main dashboard.
 */

// Lazy load the heavy map component
const LazyMapComponent = React.lazy(() => import('../../maps/adminMap/MapCore'));

interface Props {
  locations: Location[];
  drivers: Driver[];
  transactions: Transaction[];
}

const AdminMapPage: React.FC<Props> = ({ locations, drivers, transactions }) => {
  const [mapState, setMapState] = useState<MapAuditState>({
    showRiskLayer: true,
    showMachineLayer: true,
    showDriverTrack: false,
  });

  return (
    <div className="flex h-full bg-[#f3f5f8] overflow-hidden">
      
      {/* Main Map Area */}
      <div className="flex-1 relative">
        <Suspense fallback={
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
            <p className="text-sm font-bold text-slate-400">Loading Audit Map Engine...</p>
          </div>
        }>
          {/* We will implement MapCore next using Leaflet */}
          {/* <LazyMapComponent state={mapState} locations={locations} drivers={drivers} transactions={transactions} /> */}
          <div className="absolute inset-0 flex items-center justify-center bg-slate-200">
             <span className="text-slate-400 font-bold">Map Core Placeholder (Pending Leaflet Integration)</span>
          </div>
        </Suspense>

        {/* Floating Toolbar */}
        <div className="absolute top-4 left-4 right-4 bg-white/90 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-white flex items-center space-x-4">
          <button 
            onClick={() => setMapState(s => ({ ...s, showMachineLayer: !s.showMachineLayer }))}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${mapState.showMachineLayer ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Machines
          </button>
          <button 
            onClick={() => setMapState(s => ({ ...s, showRiskLayer: !s.showRiskLayer }))}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${mapState.showRiskLayer ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Risk Heatmap
          </button>
          <button 
            onClick={() => setMapState(s => ({ ...s, showDriverTrack: !s.showDriverTrack }))}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${mapState.showDriverTrack ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Driver Trajectories
          </button>
        </div>
      </div>

      {/* Right Side Audit Panel */}
      <div className="w-96 bg-white border-l border-slate-200 shadow-xl flex flex-col z-10">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <Route className="text-indigo-500" />
            <span>Audit Control</span>
          </h2>
          <p className="text-xs font-medium text-slate-400 mt-1">Spatial Operations Analysis</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Driver Selection */}
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Driver</label>
            <select 
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
              value={mapState.selectedDriverId || ''}
              onChange={(e) => setMapState(s => ({ ...s, selectedDriverId: e.target.value, showDriverTrack: !!e.target.value }))}
            >
              <option value="">-- All Drivers --</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Coverage Summary Module */}
          <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-3">Today's Coverage (Demo)</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white rounded-lg p-2 shadow-sm">
                <p className="text-lg font-black text-slate-900">45</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase">Target</p>
              </div>
              <div className="bg-white rounded-lg p-2 shadow-sm border border-green-200">
                <p className="text-lg font-black text-green-600">32</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase">Visited</p>
              </div>
              <div className="bg-white rounded-lg p-2 shadow-sm border border-red-200">
                <p className="text-lg font-black text-red-500">13</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase">Missed</p>
              </div>
            </div>
          </div>

          {/* Anomaly Module */}
          <div>
             <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center space-x-1">
               <AlertTriangle size={12} className="text-orange-500" />
               <span>Spatial Anomalies</span>
             </h3>
             <div className="space-y-2">
               <div className="p-3 bg-orange-50 border border-orange-100 rounded-xl flex items-center justify-between cursor-pointer hover:bg-orange-100 transition-colors">
                  <div>
                    <p className="text-xs font-bold text-slate-800">GPS Deviation (>300m)</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">2 transactions found</p>
                  </div>
                  <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-1 rounded">Review</span>
               </div>
               <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center justify-between cursor-pointer hover:bg-red-100 transition-colors">
                  <div>
                    <p className="text-xs font-bold text-slate-800">Suspicious Stop</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Driver idle for 50 mins off-site</p>
                  </div>
                  <span className="bg-red-500 text-white text-[10px] font-black px-2 py-1 rounded">Trace</span>
               </div>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default AdminMapPage;
