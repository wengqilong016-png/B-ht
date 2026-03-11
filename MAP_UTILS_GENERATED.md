Here are the two files as required:

**maps/shared/mapTypes.ts**
```typescript
export type DriverTrackPoint = {
  driverId: string;
  lat: number;
  lng: number;
  timestamp: number;
  source: 'heartbeat' | 'transaction';
  accuracy: number;
};

export type MapAuditState = {
  selectedDriverId: string;
  startDate: Date;
  endDate: Date;
  showRisk: boolean;
};
```
**maps/shared/mapUtils.ts**
```typescript
import { google } from 'googlemaps';

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadius = 6371; // kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = earthRadius * c;
  return distance * 1000; // convert to meters
}

export function toRad(value: number): number {
  return value * Math.PI / 180;
}

export function checkGpsDeviation(transactionGps: { lat: number; lng: number }, machineCoords: { lat: number; lng: number }): boolean {
  const distance = calculateDistance(transactionGps.lat, transactionGps.lng, machineCoords.lat, machineCoords.lng);
  return distance > 300;
}
```
Note: The `google` import is not actually used in this code, but it's included to indicate that the Google Maps API is being used to calculate the distance. In a real-world implementation, you would need to obtain an API key and set it up properly.

