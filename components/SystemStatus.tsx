import React, { useState, useEffect } from 'react';
import { Smartphone, Battery, Signal, Database, Globe, RefreshCcw, Cpu } from 'lucide-react';

const STATUS_API_BASE = import.meta.env.VITE_STATUS_API_BASE ?? 'http://localhost:5000';
const STATUS_API_URL = `${STATUS_API_BASE.replace(/\/$/, '')}/api/status`;

const SystemStatus: React.FC = () => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch(STATUS_API_URL);
      const data = await res.json();
      setStatus(data);
      setError(false);
    } catch (err) {
      console.error('Local Status API unreachable', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 30000);
    return () => clearInterval(timer);
  }, []);

  if (loading && !status) {
    return (
      <div className="bg-slate-900/5 p-6 rounded-[28px] border border-slate-200 animate-pulse">
        <div className="h-4 w-24 bg-slate-200 rounded mb-4"></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-12 bg-slate-200 rounded-xl"></div>
          <div className="h-12 bg-slate-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="bg-rose-50 p-6 rounded-[28px] border border-rose-100 flex items-center justify-between">
        <div className="flex items-center gap-3 text-rose-600">
          <Signal size={20} />
          <div>
            <p className="text-[10px] font-black uppercase">Local Agent Offline</p>
            <p className="text-[8px] font-bold opacity-70">Background monitoring service is not responding.</p>
          </div>
        </div>
        <button onClick={fetchStatus} className="p-2 bg-white rounded-xl shadow-sm text-rose-600 hover:bg-rose-100 transition-colors">
          <RefreshCcw size={16} />
        </button>
      </div>
    );
  }

  const battery = status?.hardware?.battery || {};
  const isCharging = battery.status === 'CHARGING' || battery.plugged !== 'UNPLUGGED';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
      <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm flex items-center justify-between group hover:border-indigo-200 transition-all">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-2xl ${battery.level < 20 ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-600'}`}> 
            <Battery size={20} />
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Device Power</p>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-slate-900">{battery.level}%</span>
              {isCharging && <span className="text-[8px] font-black text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full uppercase animate-pulse">Charging</span>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[8px] font-bold text-slate-400 uppercase">Temp: {battery.temperature}°C</p>
          <p className="text-[8px] font-bold text-slate-400 uppercase">Health: {battery.health}</p>
        </div>
      </div>

      <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm group hover:border-indigo-200 transition-all">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-indigo-500" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Environment Status</span>
          </div>
          <button onClick={fetchStatus} className="text-slate-300 hover:text-indigo-500 transition-colors">
            <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <Globe size={12} className={status?.services?.website === 'online' ? 'text-emerald-500' : 'text-rose-500'} />
            <span className="text-[10px] font-black text-slate-700 uppercase">Web: {status?.services?.website === 'online' ? 'OK' : 'ERR'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Database size={12} className={status?.services?.database === 'online' ? 'text-emerald-500' : 'text-rose-500'} />
            <span className="text-[10px] font-black text-slate-700 uppercase">DB: {status?.services?.database === 'online' ? 'OK' : 'ERR'}</span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <Smartphone size={12} className="text-indigo-400" />
            <span className="text-[10px] font-black text-slate-700 uppercase">Disk: {status?.hardware?.disk_free || 'N/A'}</span>
            <span className="text-slate-300 mx-1">|</span>
            <span className="text-[10px] font-black text-slate-700 uppercase">Mem: {status?.hardware?.mem_free || 'N/A'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemStatus;