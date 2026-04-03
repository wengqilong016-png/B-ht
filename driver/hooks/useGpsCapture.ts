import { useState, useCallback } from 'react';

export type GpsStatus =
  | 'idle'        // not yet requested
  | 'requesting'  // in-flight geolocation call
  | 'granted'     // coords available
  | 'denied'      // user blocked permission
  | 'timeout'     // request timed out (TIMEOUT error code)
  | 'error';      // other geolocation failure

export interface GpsCoords {
  lat: number;
  lng: number;
}

export interface UseGpsCaptureResult {
  coords: GpsCoords | null;
  status: GpsStatus;
  /** Fire a geolocation request. Safe to call multiple times (retry). */
  request: () => void;
}

/**
 * Manages GPS acquisition with full status tracking.
 *
 * Pass `initialCoords` when restoring from a draft so the hook starts
 * in the 'granted' state instead of 'idle'.
 */
export function useGpsCapture(initialCoords?: GpsCoords | null): UseGpsCaptureResult {
  const [coords, setCoords] = useState<GpsCoords | null>(initialCoords ?? null);
  const [status, setStatus] = useState<GpsStatus>(initialCoords ? 'granted' : 'idle');

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('error');
      return;
    }
    setStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus('granted');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
        } else if (err.code === err.TIMEOUT) {
          setStatus('timeout');
        } else {
          setStatus('error');
        }
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  }, []);

  return { coords, status, request };
}
