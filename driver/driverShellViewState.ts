import type { Driver } from '../types';

export function resolveCurrentDriver(drivers: Driver[], activeDriverId?: string): Driver | undefined {
  if (activeDriverId) {
    const activeDriver = drivers.find(driver => driver.id === activeDriverId);
    if (activeDriver) {
      return activeDriver;
    }
  }
  return drivers.length > 0 ? drivers[0] : undefined;
}
