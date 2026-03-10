export interface DeviceProfile {
  isLowEndLikely: boolean;
  supportsCamera: boolean;
  supportsServiceWorker: boolean;
  platform: 'android' | 'ios' | 'desktop' | 'unknown';
}

export function getDeviceProfile(): DeviceProfile {
  const ua = navigator.userAgent || '';
  const isAndroid = /android/i.test(ua);
  const isIOS = /iP(hone|od|ad)/i.test(ua) || (/Mac/i.test(ua) && 'ontouchend' in document);
  const platform: DeviceProfile['platform'] = isAndroid ? 'android' : isIOS ? 'ios' :
    /Win|Mac|Linux/i.test(ua) && !('ontouchend' in document) ? 'desktop' : 'unknown';

  const cores: number | undefined = navigator.hardwareConcurrency;
  const memory: number | undefined = (navigator as any).deviceMemory;

  const isLowEndLikely =
    (cores !== undefined && cores <= 2) ||
    (memory !== undefined && memory <= 1) ||
    ((navigator as any).connection?.effectiveType === '2g') ||
    ((navigator as any).connection?.effectiveType === 'slow-2g');

  const supportsCamera =
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function';

  const supportsServiceWorker = 'serviceWorker' in navigator;

  return { isLowEndLikely, supportsCamera, supportsServiceWorker, platform };
}
