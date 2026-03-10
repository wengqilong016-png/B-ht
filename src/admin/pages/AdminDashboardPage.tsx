import React from 'react';
import { Transaction, Driver, Location, DailySettlement } from '../../types';

// Cockpit Modules
import OperationsOverview from '../components/OperationsOverview';
import DriverStatusBoard from '../components/DriverStatusBoard';
import MachineRiskBoard from '../components/MachineRiskBoard';
import ActionQueue from '../components/ActionQueue';

/**
 * Phase 3: Admin Operations Cockpit
 * The unified "single-pane-of-glass" view for administrators.
 */

interface Props {
  transactions: Transaction[];
  drivers: Driver[];
  locations: Location[];
  dailySettlements: DailySettlement[];
}

const AdminDashboardPage: React.FC<Props> = ({ transactions, drivers, locations, dailySettlements }) => {
  return (
    <div className="flex flex-col h-full bg-[#f3f5f8] overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Operations Cockpit</h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time system overview</p>
      </div>

      {/* Top Row: KPI Overview */}
      <OperationsOverview 
        transactions={transactions} 
        drivers={drivers} 
        locations={locations} 
        dailySettlements={dailySettlements} 
      />

      {/* Middle Row: Driver Fleet Status (Full Width) */}
      <div className="w-full">
        <DriverStatusBoard 
          drivers={drivers} 
          transactions={transactions} 
        />
      </div>

      {/* Bottom Row: Risks and Actions (Split View) */}
      <div className="grid lg:grid-cols-2 gap-6 h-[500px]">
        {/* Left: Machine Risks */}
        <MachineRiskBoard locations={locations} />

        {/* Right: Approval/Action Inbox */}
        <ActionQueue 
          transactions={transactions} 
          dailySettlements={dailySettlements} 
        />
      </div>

    </div>
  );
};

export default AdminDashboardPage;
