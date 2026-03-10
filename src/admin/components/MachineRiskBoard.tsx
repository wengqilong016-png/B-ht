import React, { useMemo } from 'react';
import { Location } from '../../types';
import { evaluateMachineRisks, RiskSeverity } from '../../shared/utils/machineRisk';
import { AlertTriangle, Lock, Clock, TrendingDown } from 'lucide-react';

/**
 * Phase 3: Admin Dashboard - Machine Risk Board
 * Highlights high-priority issues that need immediate admin attention.
 */

interface Props {
  locations: Location[];
}

const MachineRiskBoard: React.FC<Props> = ({ locations }) => {
  const risks = useMemo(() => evaluateMachineRisks(locations), [locations]);

  // Show only top 10 risks to avoid cluttering the dashboard
  const topRisks = risks.slice(0, 10);

  const getSeverityStyles = (severity: RiskSeverity) => {
    switch (severity) {
      case 'Critical': return 'bg-red-50 border-red-200 text-red-700';
      case 'Warning': return 'bg-orange-50 border-orange-200 text-orange-700';
      case 'Info': return 'bg-blue-50 border-blue-200 text-blue-700';
      default: return 'bg-slate-50 border-slate-200 text-slate-700';
    }
  };

  const getRiskIcon = (type: string, severity: RiskSeverity) => {
    const colorClass = severity === 'Critical' ? 'text-red-500' : severity === 'Warning' ? 'text-orange-500' : 'text-blue-500';
    switch (type) {
      case 'locked': return <Lock size={16} className={colorClass} />;
      case 'stale': return <Clock size={16} className={colorClass} />;
      case 'overflow': return <TrendingDown size={16} className={colorClass} />; // using TrendingDown to represent score approaching limit
      default: return <AlertTriangle size={16} className={colorClass} />;
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center space-x-2">
          <AlertTriangle className="text-red-500" />
          <span>Machine Risk Board</span>
        </h2>
        <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-full">
          {risks.filter(r => r.severity === 'Critical').length} Critical
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
        {topRisks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <CheckCircle size={32} className="mb-2 text-green-400" />
            <p className="text-sm font-bold">All systems nominal</p>
          </div>
        ) : (
          topRisks.map((risk, idx) => (
            <div 
              key={`${risk.locationId}-${risk.riskType}-${idx}`} 
              className={`p-3 rounded-xl border flex items-start space-x-3 transition-colors hover:shadow-sm cursor-pointer ${getSeverityStyles(risk.severity)}`}
            >
              <div className="mt-0.5 bg-white p-1.5 rounded-lg shadow-sm">
                {getRiskIcon(risk.riskType, risk.severity)}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black tracking-tight">{risk.name}</p>
                  <span className="text-[10px] font-black uppercase bg-white px-1.5 py-0.5 rounded shadow-sm opacity-80">
                    {risk.severity}
                  </span>
                </div>
                <p className="text-[11px] font-medium opacity-90 mt-1 leading-snug">
                  {risk.description}
                </p>
                <div className="flex items-center space-x-2 mt-2">
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-60">ID: {risk.machineId}</span>
                  {risk.daysIdle !== undefined && risk.daysIdle !== 999 && (
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-60">• {risk.daysIdle} days idle</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Mock CheckCircle since it wasn't imported initially to avoid breaking changes if not in lucide
import { CheckCircle } from 'lucide-react';

export default MachineRiskBoard;
