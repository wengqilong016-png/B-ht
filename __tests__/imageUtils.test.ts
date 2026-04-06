/**
 * __tests__/imageUtils.test.ts
 *
 * Tests for utils/imageUtils.ts and driver/utils/imageOptimization.ts
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { getOptimizedImageUrl, compressAndResizeImage } from '../utils/imageUtils';
import {
  compressCanvasImage,
  getOptimalVideoConstraints,
  getOptimalScanInterval,
  getOptimalAIImageSize,
  getOptimalEvidenceWidth,
  clearCanvasMemory,
  getMinimumAICallInterval,
} from '../utils/imageOptimization';

// ── getOptimizedImageUrl ──────────────────────────────────────────────────────

describe('getOptimizedImageUrl()', () => {
  it('returns empty string for empty URL', () => {
    expect(getOptimizedImageUrl('')).toBe('');
  });

  it('returns the original URL when it is not a Supabase storage URL', () => {
    const url = 'https://cdn.example.com/images/photo.jpg';
    expect(getOptimizedImageUrl(url)).toBe(url);
  });

  it('transforms a Supabase public storage URL to render URL', () => {
    const url = 'https://abc123.supabase.co/storage/v1/object/public/photos/image.jpg';
    const result = getOptimizedImageUrl(url, 200, 300, 80);
    expect(result).toBe(
      'https://abc123.supabase.co/storage/v1/render/image/public/photos/image.jpg?width=200&height=300&quality=80',
    );
  });

  it('uses default width, height, quality when not specified', () => {
    const url = 'https://abc123.supabase.co/storage/v1/object/public/photos/img.jpg';
    const result = getOptimizedImageUrl(url);
    expect(result).toContain('width=400');
    expect(result).toContain('height=400');
    expect(result).toContain('quality=70');
  });

  it('preserves the bucket-and-path segment after transformation', () => {
    const url = 'https://project.supabase.co/storage/v1/object/public/bucket/folder/file.png';
    const result = getOptimizedImageUrl(url, 100, 100, 50);
    expect(result).toContain('/render/image/public/bucket/folder/file.png');
  });
});

// ── imageOptimization (driver/utils) ─────────────────────────────────────────

describe('compressCanvasImage()', () => {
  function makeCanvas(width = 100, height = 100): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    // jsdom doesn't implement canvas — mock toDataURL
    (canvas as any).toDataURL = jest.fn().mockReturnValue('data:image/jpeg;base64,mock');
    return canvas;
  }

  it('uses lower quality (0.6) for low-performance devices', () => {
    const canvas = makeCanvas();
    compressCanvasImage(canvas, true);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.6);
  });

  it('uses higher quality (0.7) for high-performance devices', () => {
    const canvas = makeCanvas();
    compressCanvasImage(canvas, false);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.7);
  });

  it('respects explicit quality override', () => {
    const canvas = makeCanvas();
    compressCanvasImage(canvas, true, { quality: 0.9 });
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9);
  });

  it('respects explicit format override', () => {
    const canvas = makeCanvas();
    compressCanvasImage(canvas, false, { targetFormat: 'image/webp' });
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/webp', 0.7);
  });

  it('returns the data URL string', () => {
    const canvas = makeCanvas();
    const result = compressCanvasImage(canvas, false);
    expect(result).toBe('data:image/jpeg;base64,mock');
  });
});

describe('getOptimalVideoConstraints()', () => {
  it('returns low-res constraints for low-performance devices', () => {
    const constraints = getOptimalVideoConstraints(true);
    expect((constraints as any).width.ideal).toBe(640);
    expect((constraints as any).height.ideal).toBe(480);
    expect(constraints.facingMode).toBe('environment');
  });

  it('returns high-res constraints for high-performance devices', () => {
    const constraints = getOptimalVideoConstraints(false);
    expect((constraints as any).width.ideal).toBe(1280);
    expect((constraints as any).height.ideal).toBe(720);
  });
});

describe('getOptimalScanInterval()', () => {
  it('returns 3500ms for low-performance', () => {
    expect(getOptimalScanInterval(true)).toBe(3500);
  });

  it('returns 2500ms for high-performance', () => {
    expect(getOptimalScanInterval(false)).toBe(2500);
  });
});

describe('getOptimalAIImageSize()', () => {
  it('returns 384 for low-performance', () => {
    expect(getOptimalAIImageSize(true)).toBe(384);
  });

  it('returns 512 for high-performance', () => {
    expect(getOptimalAIImageSize(false)).toBe(512);
  });
});

describe('getOptimalEvidenceWidth()', () => {
  it('returns 480 for low-performance', () => {
    expect(getOptimalEvidenceWidth(true)).toBe(480);
  });

  it('returns 640 for high-performance', () => {
    expect(getOptimalEvidenceWidth(false)).toBe(640);
  });
});

describe('clearCanvasMemory()', () => {
  it('calls clearRect on the canvas context', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 150;
    // jsdom doesn't implement canvas — mock getContext
    const mockClearRect = jest.fn();
    (canvas as any).getContext = jest.fn().mockReturnValue({ clearRect: mockClearRect });
    clearCanvasMemory(canvas);
    expect(mockClearRect).toHaveBeenCalledWith(0, 0, 200, 150);
  });

  it('does not throw when context is null', () => {
    const canvas = document.createElement('canvas');
    // getContext returns null in jsdom by default
    expect(() => clearCanvasMemory(canvas)).not.toThrow();
  });
});

describe('getMinimumAICallInterval()', () => {
  it('returns 3000ms for low-performance', () => {
    expect(getMinimumAICallInterval(true)).toBe(3000);
  });

  it('returns 2000ms for high-performance', () => {
    expect(getMinimumAICallInterval(false)).toBe(2000);
  });
});

// ── compressAndResizeImage ────────────────────────────────────────────────────

/**
 * compressAndResizeImage uses FileReader, Image, and HTMLCanvasElement — none of
 * which are fully implemented by jsdom.  We mock them at the module boundary so
 * we can exercise every code path (success, canvas null, toBlob null, img error,
 * reader error) without touching real browser APIs.
 */
describe('compressAndResizeImage()', () => {
  // ── helpers ──────────────────────────────────────────────────────────────

  function makeFile(name = 'photo.jpg', type = 'image/jpeg', size = 1024): File {
    const buf = new Uint8Array(size);
    return new File([buf], name, { type });
  }

  /**
   * Install a FileReader mock that synchronously triggers onload with a
   * fake data-URL result.
   */
  function mockFileReader(dataUrl: string): void {
    (global as any).FileReader = class {
      result = dataUrl;
      readAsDataURL(_blob: Blob) {
        // trigger onload in the next microtask to match real async behaviour
        Promise.resolve().then(() => this.onload?.({ target: this } as any));
      }
      onload: ((e: any) => void) | null = null;
      onerror: ((e: any) => void) | null = null;
    };
  }

  /**
   * Install an Image mock that triggers onload synchronously with the given
   * pixel dimensions.
   */
  function mockImage(width: number, height: number): void {
    (global as any).Image = class {
      width = 0;
      height = 0;
      onload: (() => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      set src(_val: string) {
        this.width = width;
        this.height = height;
        Promise.resolve().then(() => this.onload?.());
      }
    };
  }

  /**
   * Install an Image mock that triggers onerror.
   */
  function mockImageError(): void {
    (global as any).Image = class {
      width = 0;
      height = 0;
      onload: (() => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      set src(_val: string) {
        Promise.resolve().then(() => this.onerror?.(new Error('Image load error')));
      }
    };
  }

  /**
   * Build a canvas mock whose toBlob callback receives `blobResult`.
   * getContext returns a fully-functional stub.
   */
  function mockCanvas(blobResult: Blob | null, contextNull = false): void {
    const origCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string, ...rest: any[]) => {
      if (tag === 'canvas') {
        const canvas = origCreate(tag) as HTMLCanvasElement;
        canvas.getContext = contextNull
          ? () => null
          : () =>
              ({
                imageSmoothingEnabled: false,
                imageSmoothingQuality: 'low',
                drawImage: jest.fn(),
              } as any);
        canvas.toBlob = (cb: (blob: Blob | null) => void) => {
          Promise.resolve().then(() => cb(blobResult));
        };
        return canvas;
      }
      return origCreate(tag, ...rest);
    });
  }

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves with a Blob for a small image (no resize needed)', async () => {
    mockFileReader('data:image/jpeg;base64,/9j/');
    mockImage(800, 600); // both dimensions under 1024
    const fakeBlob = new Blob(['data'], { type: 'image/jpeg' });
    mockCanvas(fakeBlob);

    const file = makeFile();
    const result = await compressAndResizeImage(file);
    expect(result).toBe(fakeBlob);
  });

  it('scales down a landscape image wider than 1024px', async () => {
    mockFileReader('data:image/jpeg;base64,/9j/');
    mockImage(2048, 512); // width > 1024
    const fakeBlob = new Blob(['scaled'], { type: 'image/jpeg' });

    let capturedWidth = 0;
    const origCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string, ...rest: any[]) => {
      if (tag === 'canvas') {
        const canvas = origCreate(tag) as HTMLCanvasElement;
        Object.defineProperty(canvas, 'width', {
          set(v: number) { capturedWidth = v; },
          get() { return capturedWidth; },
        });
        canvas.getContext = () => ({
          imageSmoothingEnabled: false,
          imageSmoothingQuality: 'low',
          drawImage: jest.fn(),
        } as any);
        canvas.toBlob = (cb: (blob: Blob | null) => void) => Promise.resolve().then(() => cb(fakeBlob));
        return canvas;
      }
      return origCreate(tag, ...rest);
    });

    await compressAndResizeImage(makeFile());
    expect(capturedWidth).toBe(1024);
  });

  it('scales down a portrait image taller than 1024px', async () => {
    mockFileReader('data:image/jpeg;base64,/9j/');
    mockImage(400, 2000); // height > 1024
    const fakeBlob = new Blob(['scaled'], { type: 'image/jpeg' });

    let capturedHeight = 0;
    const origCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string, ...rest: any[]) => {
      if (tag === 'canvas') {
        const canvas = origCreate(tag) as HTMLCanvasElement;
        Object.defineProperty(canvas, 'height', {
          set(v: number) { capturedHeight = v; },
          get() { return capturedHeight; },
        });
        canvas.getContext = () => ({
          imageSmoothingEnabled: false,
          imageSmoothingQuality: 'low',
          drawImage: jest.fn(),
        } as any);
        canvas.toBlob = (cb: (blob: Blob | null) => void) => Promise.resolve().then(() => cb(fakeBlob));
        return canvas;
      }
      return origCreate(tag, ...rest);
    });

    await compressAndResizeImage(makeFile());
    expect(capturedHeight).toBe(1024);
  });

  it('rejects when canvas.getContext returns null', async () => {
    mockFileReader('data:image/jpeg;base64,/9j/');
    mockImage(100, 100);
    mockCanvas(null, true /* contextNull */);

    await expect(compressAndResizeImage(makeFile())).rejects.toThrow(
      'Failed to get canvas 2d context',
    );
  });

  it('rejects when toBlob returns null', async () => {
    mockFileReader('data:image/jpeg;base64,/9j/');
    mockImage(100, 100);
    mockCanvas(null /* blob = null */);

    await expect(compressAndResizeImage(makeFile())).rejects.toThrow(
      'Canvas to Blob conversion failed',
    );
  });

  it('rejects when Image fires onerror', async () => {
    mockFileReader('data:image/jpeg;base64,/9j/');
    mockImageError();

    await expect(compressAndResizeImage(makeFile())).rejects.toBeTruthy();
  });

  it('rejects when FileReader fires onerror', async () => {
    (global as any).FileReader = class {
      result = null;
      readAsDataURL(_blob: Blob) {
        Promise.resolve().then(() => this.onerror?.(new Error('Read error')));
      }
      onload: ((e: any) => void) | null = null;
      onerror: ((e: any) => void) | null = null;
    };

    await expect(compressAndResizeImage(makeFile())).rejects.toBeTruthy();
  });
});
