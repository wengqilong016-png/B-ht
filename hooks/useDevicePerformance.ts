import { useEffect, useState } from 'react';

export type PerformanceTier = 'high' | 'medium' | 'low';

/**
 * Detect device performance tier using available browser signals:
 *  - navigator.hardwareConcurrency (CPU cores)
 *  - navigator.deviceMemory          (RAM in GB, where available)
 *  - navigator.connection.effectiveType (network speed estimate)
 *
 * When the relevant browser APIs are unavailable (older devices / non-Chromium),
 * the function conservatively returns 'medium' rather than assuming 'high'.
 * This ensures older browsers that lack these APIs still benefit from
 * modest UI degradation rather than accidentally running at full cost.
 *
 * The detected tier is also written to `document.documentElement.dataset.perf`
 * so that pure-CSS degradation rules in styles.css apply without any React
 * re-render overhead.
 */
function detectPerformanceTier(): PerformanceTier {
  const cores: number | undefined = navigator.hardwareConcurrency;
  const memory: number | undefined = (navigator as any).deviceMemory;
  const effectiveType: string | undefined =
    (navigator as any).connection?.effectiveType;

  // When key APIs are absent, assume medium (conservative, not high)
  const apiAvailable = cores !== undefined || memory !== undefined || effectiveType !== undefined;
  if (!apiAvailable) return 'medium';

  const coresVal = cores ?? 4;

  if (
    coresVal <= 2 ||
    (memory !== undefined && memory <= 1) ||
    effectiveType === '2g' ||
    effectiveType === 'slow-2g'
  ) {
    return 'low';
  }

  if (
    coresVal <= 4 ||
    (memory !== undefined && memory <= 2) ||
    effectiveType === '3g'
  ) {
    return 'medium';
  }

  return 'high';
}

export function useDevicePerformance(): PerformanceTier {
  const [tier, setTier] = useState<PerformanceTier>('high');

  useEffect(() => {
    const detected = detectPerformanceTier();
    setTier(detected);
    // Write to the root element so CSS selectors in styles.css engage
    document.documentElement.dataset.perf = detected;
  }, []);

  return tier;
}
