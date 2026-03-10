/**
 * maps/shared/mapUtils.ts
 * Pure mathematical utilities for spatial auditing.
 */

// Haversine formula to calculate distance in meters between two coordinates
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (value: number) => (value * Math.PI) / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
            
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 0-100m: Normal, 100-300m: Suspicious, >300m: Anomaly
export function checkGpsDeviation(
  transactionGps?: { lat: number; lng: number } | null, 
  machineCoords?: { lat: number; lng: number } | null
): { isDeviated: boolean; distance: number; status: 'normal' | 'suspicious' | 'anomaly' | 'unknown' } {
  if (!transactionGps || !machineCoords) {
    return { isDeviated: false, distance: 0, status: 'unknown' };
  }

  const dist = calculateDistance(transactionGps.lat, transactionGps.lng, machineCoords.lat, machineCoords.lng);
  
  if (dist > 300) {
    return { isDeviated: true, distance: dist, status: 'anomaly' };
  } else if (dist > 100) {
    return { isDeviated: false, distance: dist, status: 'suspicious' };
  } else {
    return { isDeviated: false, distance: dist, status: 'normal' };
  }
}
