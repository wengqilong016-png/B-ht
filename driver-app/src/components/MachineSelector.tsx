import React from 'react';
import { Location } from '../types';

interface MachineSelectorProps {
  locations: Location[];
  isLoading: boolean;
  onSelect: (location: Location) => void;
}

export default function MachineSelector({ locations, isLoading, onSelect }: MachineSelectorProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p className="text-4xl mb-3">🎰</p>
        <p className="text-sm">无分配机器 / Hakuna mashine zilizopangwa</p>
      </div>
    );
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return { text: '正常', color: 'text-green-400', bg: 'bg-green-900/30' };
      case 'maintenance':
        return { text: '维修', color: 'text-yellow-400', bg: 'bg-yellow-900/30' };
      case 'broken':
        return { text: '损坏', color: 'text-red-400', bg: 'bg-red-900/30' };
      default:
        return { text: status, color: 'text-slate-400', bg: 'bg-slate-700' };
    }
  };

  return (
    <div className="space-y-2">
      {locations.map((loc) => {
        const status = statusLabel(loc.status);
        return (
          <button
            key={loc.id}
            onClick={() => onSelect(loc)}
            className="w-full bg-slate-800 hover:bg-slate-700 rounded-xl p-4 text-left transition-colors"
            style={{ minHeight: '72px' }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-slate-100 font-semibold text-base truncate">
                    {loc.name}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${status.color} ${status.bg}`}
                  >
                    {status.text}
                  </span>
                </div>
                <p className="text-slate-400 text-sm">
                  {loc.area}
                  {loc.machineId ? ` · #${loc.machineId}` : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-slate-500">上次分数</p>
                <p className="text-amber-400 font-mono font-bold">
                  {loc.lastScore.toLocaleString()}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
