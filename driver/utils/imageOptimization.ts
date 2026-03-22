/**
 * Driver-specific image optimization utilities
 * Optimized for low-performance mobile devices
 */

export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  targetFormat?: 'image/jpeg' | 'image/webp';
}

/**
 * Compress an image canvas to data URL with device-appropriate settings
 * @param canvas - The canvas element to compress
 * @param isLowPerformance - Whether the device is low-performance
 * @param options - Optional override settings
 * @returns Base64 encoded image data URL
 */
export function compressCanvasImage(
  canvas: HTMLCanvasElement,
  isLowPerformance: boolean,
  options: ImageOptimizationOptions = {}
): string {
  const defaultQuality = isLowPerformance ? 0.6 : 0.7;
  const quality = options.quality ?? defaultQuality;
  const format = options.targetFormat ?? 'image/jpeg';

  return canvas.toDataURL(format, quality);
}

/**
 * Get optimal video constraints based on device performance
 * @param isLowPerformance - Whether the device is low-performance
 * @returns MediaTrackConstraints for video
 */
export function getOptimalVideoConstraints(isLowPerformance: boolean): MediaTrackConstraints {
  return isLowPerformance
    ? { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
    : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } };
}

/**
 * Get optimal AI scan interval based on device performance
 * @param isLowPerformance - Whether the device is low-performance
 * @returns Interval in milliseconds
 */
export function getOptimalScanInterval(isLowPerformance: boolean): number {
  return isLowPerformance ? 3500 : 2500;
}

/**
 * Get optimal AI image processing size
 * @param isLowPerformance - Whether the device is low-performance
 * @returns Target size in pixels (width/height)
 */
export function getOptimalAIImageSize(isLowPerformance: boolean): number {
  return isLowPerformance ? 384 : 512;
}

/**
 * Get optimal evidence image width
 * @param isLowPerformance - Whether the device is low-performance
 * @returns Width in pixels
 */
export function getOptimalEvidenceWidth(isLowPerformance: boolean): number {
  return isLowPerformance ? 480 : 640;
}

/**
 * Clear canvas to free memory
 * @param canvas - The canvas element to clear
 */
export function clearCanvasMemory(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

/**
 * Calculate minimum interval between AI API calls to prevent quota exhaustion
 * @param isLowPerformance - Whether the device is low-performance
 * @returns Minimum interval in milliseconds
 */
export function getMinimumAICallInterval(isLowPerformance: boolean): number {
  return isLowPerformance ? 3000 : 2000;
}
