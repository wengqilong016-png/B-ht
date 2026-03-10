import { useState, useCallback } from 'react';
import { getDeviceProfile } from '../../shared/utils/deviceProfile';

export type PerformanceMode = 'low' | 'auto' | 'high';

const STORAGE_KEY = 'bahati_performance_mode';

function resolveEffectiveMode(mode: PerformanceMode): { mode: PerformanceMode; isLowPerformance: boolean } {
  if (mode === 'low') return { mode, isLowPerformance: true };
  if (mode === 'high') return { mode, isLowPerformance: false };
  // auto: detect from device
  const profile = getDeviceProfile();
  return { mode, isLowPerformance: profile.isLowEndLikely };
}

export function usePerformanceMode() {
  const [performanceMode, setMode] = useState<PerformanceMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'low' || saved === 'high') return saved;
    } catch { /* ignore */ }
    return 'auto';
  });

  const resolved = resolveEffectiveMode(performanceMode);

  const setPerformanceMode = useCallback((mode: PerformanceMode) => {
    setMode(mode);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
  }, []);

  return {
    performanceMode,
    isLowPerformance: resolved.isLowPerformance,
    setPerformanceMode,
  };
}
