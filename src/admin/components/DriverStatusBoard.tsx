import React, { useMemo } from 'react';
import { Driver, Transaction } from '../../types';
import { getDriverStatus, DriverStatus } from '../../shared/utils/driverStatus';
import { Clock, Navigation, AlertTriangle, WifiOff, Activity } from 'lucide-react';

/**
 * Phase 3: Admin Dashboard - Driver Status Board
 * Provides real-time visibility into the operational state of all drivers.
 */

interface Props {
  drivers: Driver[];
  transactions: Transaction[];
}

const DriverStatusBoard: React.FC<Props> = ({ drivers, transactions }) => {
  // 1. Group drivers by status
  const groupedDrivers = useMemo(() => {
    const groups: Record<DriverStatus, Driver[]> = {
      abnormal: [],
      active: [],
      online: [],
      idle: [],
      offline: []
    };

    drivers.forEach(driver => {
      const status = getDriverStatus(driver, transactions);
      groups[status].push(driver);
    });

    return groups;
  }, [drivers, transactions]);

  // 2. Status Config for UI Rendering
  const statusConfig: Record<DriverStatus, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
    abnormal: { label: 'Abnormal', color: 'bg-red-500', icon: <AlertTriangle size={14} className="text-white" />, desc: 'Critical anomalies detected' },
    active: { label: 'Active', color: 'bg-green-500', icon: <Activity size={14} className="text-white" />, desc: '< 10 mins activity' },
    online: { label: 'Online', color: 'bg-blue-500', icon: <Navigation size={14} className="text-white" />, desc: '10 - 30 mins activity' },
    idle: { label: 'Idle', color: 'bg-yellow-500', icon: <Clock size={14} className="text-white" />, desc: '30 - 45 mins inactive' },
    offline: { label: 'Offline', color: 'bg-slate-400', icon: <WifiOff size={14} className="text-white" />, desc: '> 45 mins disconnected' }
  };

  const renderDriverCard = (driver: Driver, status: DriverStatus) => {
    const config = statusConfig[status];
    const todayTxs = transactions.filter(t => t.driverId === driver.id && t.timestamp.startsWith(new Date().toISOString().split('T')[0])).length;

    return (
      <div key={driver.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.color} shadow-inner`}>
            {config.icon}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">{driver.name}</p>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${config.color} bg-opacity-10 ${config.color.replace('bg-', 'text-')}`}>
                {config.label}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {driver.lastActive ? new Date(driver.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
              </span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Today</p>
          <p className="text-lg font-black text-slate-700 leading-none">{todayTxs}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
      <h2 className="text-lg font-black text-slate-900 tracking-tight mb-6 flex items-center space-x-2">
        <Navigation className="text-indigo-500" />
        <span>Driver Fleet Status</span>
      </h2>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Render columns in priority order */}
        {(['abnormal', 'active', 'online', 'idle', 'offline'] as DriverStatus[]).map(status => {
          const list = groupedDrivers[status];
          if (list.length === 0 && status !== 'abnormal') return null; // Always show abnormal column if it exists, else hide empty to save space

          return (
            <div key={status} className="flex flex-col h-full bg-slate-50 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${statusConfig[status].color}`} />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700">{statusConfig[status].label}</span>
                </div>
                <span className="text-xs font-bold text-slate-400">{list.length}</span>
              </div>
              
              <div className="flex-1 space-y-2 overflow-y-auto max-h-[400px] pr-1 custom-scrollbar">
                {list.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium text-center py-4 italic">No drivers</p>
                ) : (
                  list.map(d => renderDriverCard(d, status))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DriverStatusBoard;
