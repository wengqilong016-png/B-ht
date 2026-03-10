import { Location } from '../../types';

/**
 * shared/utils/machineRisk.ts
 * Machine risk identification logic based on DOCS_DATABASE_SCHEMA.md.
 */

export type RiskSeverity = 'Critical' | 'Warning' | 'Info';
export type RiskType = 'locked' | 'overflow' | 'stale' | 'low_income';

export interface MachineRisk {
  locationId: string;
  name: string;
  machineId: string;
  riskType: RiskType;
  severity: RiskSeverity;
  description: string;
  daysIdle?: number;
}

export function evaluateMachineRisks(locations: Location[]): MachineRisk[] {
  const risks: MachineRisk[] = [];
  const now = Date.now();
  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  locations.forEach(loc => {
    // 1. Locked Risk (Critical)
    if (loc.resetLocked) {
      risks.push({
        locationId: loc.id,
        name: loc.name,
        machineId: loc.machineId,
        riskType: 'locked',
        severity: 'Critical',
        description: 'Machine is locked pending a 9999 reset approval.'
      });
      // If locked, it usually supersedes other warnings, but we evaluate all
    }

    // 2. Overflow Risk (Critical/Warning)
    if (loc.lastScore >= 9000) {
      risks.push({
        locationId: loc.id,
        name: loc.name,
        machineId: loc.machineId,
        riskType: 'overflow',
        severity: loc.lastScore >= 9500 ? 'Critical' : 'Warning',
        description: `Score is ${loc.lastScore}, approaching maximum 9999.`
      });
    }

    // 3. Stale Risk (Warning)
    if (loc.lastRevenueDate) {
      const daysIdle = Math.floor((now - new Date(loc.lastRevenueDate).getTime()) / MS_PER_DAY);
      if (daysIdle >= 7) {
        risks.push({
          locationId: loc.id,
          name: loc.name,
          machineId: loc.machineId,
          riskType: 'stale',
          severity: daysIdle >= 14 ? 'Critical' : 'Warning',
          description: `No revenue collected for ${daysIdle} days.`,
          daysIdle
        });
      }
    } else {
      // Never collected
      risks.push({
        locationId: loc.id,
        name: loc.name,
        machineId: loc.machineId,
        riskType: 'stale',
        severity: 'Info',
        description: 'New machine, never collected.',
        daysIdle: 999
      });
    }
  });

  // Sort by severity (Critical > Warning > Info)
  const severityWeight = { Critical: 3, Warning: 2, Info: 1 };
  return risks.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);
}
