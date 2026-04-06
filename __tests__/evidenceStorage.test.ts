/**
 * __tests__/evidenceStorage.test.ts
 *
 * Tests for services/evidenceStorage.ts
 *
 * Covers:
 *   - persistEvidencePhotoUrl: null / undefined / non-data-url pass-through
 *   - data-URL to Supabase storage path: success, upload error
 *   - parseDataUrl: invalid URL throws
 *   - getFileExtension: jpeg → jpg, other subtypes, missing subtype
 *   - buildObjectPath: with / without driverId
 *   - storage.from unavailable → returns original data-URL
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Supabase mock ──────────────────────────────────────────────────────────
const mockUpload = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetPublicUrl = jest.fn<(path: string) => unknown>();
const mockStorageFrom = jest.fn<(bucket: string) => unknown>(() => ({
  upload: mockUpload,
  getPublicUrl: mockGetPublicUrl,
}));

jest.mock('../supabaseClient', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => mockStorageFrom(bucket),
    },
  },
}));

import { persistEvidencePhotoUrl, EVIDENCE_BUCKET } from '../services/evidenceStorage';

// Minimal valid JPEG data-URL (1×1 pixel base64 encoded)
const JPEG_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAAR' +
  'CAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwAB/9k=';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

beforeEach(() => {
  jest.clearAllMocks();
  mockUpload.mockResolvedValue({ error: null });
  mockGetPublicUrl.mockImplementation((path: string) => ({
    data: { publicUrl: `https://storage.example.com/evidence/${path}` },
  }));
});

// ══ null / undefined / empty pass-through ════════════════════════════════════

describe('persistEvidencePhotoUrl() — pass-through cases', () => {
  it('returns null when photoUrl is null', async () => {
    const result = await persistEvidencePhotoUrl(null, { category: 'collection', entityId: 'e-1' });
    expect(result).toBeNull();
  });

  it('returns null when photoUrl is undefined', async () => {
    const result = await persistEvidencePhotoUrl(undefined, { category: 'collection', entityId: 'e-1' });
    expect(result).toBeNull();
  });

  it('returns the original URL when it is not a data-image URL', async () => {
    const url = 'https://cdn.example.com/photos/photo.jpg';
    const result = await persistEvidencePhotoUrl(url, { category: 'collection', entityId: 'e-1' });
    expect(result).toBe(url);
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it('returns the data-URL unchanged when supabase.storage.from is unavailable', async () => {
    const originalMock = jest.requireMock('../supabaseClient') as { supabase: any };
    const originalStorage = originalMock.supabase.storage;

    try {
      // Simulate storage.from being unavailable on the existing mocked module
      originalMock.supabase.storage = {};

      const result = await persistEvidencePhotoUrl(JPEG_DATA_URL, {
        category: 'collection',
        entityId: 'e-1',
      });

      // When storage.from is absent the function returns the original data-URL
      expect(result).toBe(JPEG_DATA_URL);
    } finally {
      originalMock.supabase.storage = originalStorage;
    }
  });
});

// ══ successful upload ══════════════════════════════════════════════════════════

describe('persistEvidencePhotoUrl() — successful upload', () => {
  it('uploads a JPEG data-URL and returns the public URL', async () => {
    const result = await persistEvidencePhotoUrl(JPEG_DATA_URL, {
      category: 'collection',
      entityId: 'tx-42',
      driverId: 'drv-1',
    });

    expect(mockStorageFrom).toHaveBeenCalledWith(EVIDENCE_BUCKET);
    expect(mockUpload).toHaveBeenCalledWith(
      'collection/drv-1/tx-42.jpg',
      expect.any(Blob),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: true }),
    );
    expect(result).toContain('collection/drv-1/tx-42.jpg');
  });

  it('uploads a PNG data-URL and uses "png" extension', async () => {
    await persistEvidencePhotoUrl(PNG_DATA_URL, {
      category: 'reset-request',
      entityId: 'req-7',
      driverId: 'drv-2',
    });

    expect(mockUpload).toHaveBeenCalledWith(
      'reset-request/drv-2/req-7.png',
      expect.any(Blob),
      expect.any(Object),
    );
  });

  it('uses "unknown-driver" segment when driverId is null', async () => {
    await persistEvidencePhotoUrl(JPEG_DATA_URL, {
      category: 'payroll',
      entityId: 'pay-1',
      driverId: null,
    });

    expect(mockUpload).toHaveBeenCalledWith(
      'payroll/unknown-driver/pay-1.jpg',
      expect.any(Blob),
      expect.any(Object),
    );
  });

  it('uses "unknown-driver" when driverId is an empty string', async () => {
    await persistEvidencePhotoUrl(JPEG_DATA_URL, {
      category: 'collection',
      entityId: 'e-2',
      driverId: '   ', // whitespace-only
    });

    expect(mockUpload).toHaveBeenCalledWith(
      'collection/unknown-driver/e-2.jpg',
      expect.any(Blob),
      expect.any(Object),
    );
  });

  it('uses "unknown-driver" when driverId is omitted', async () => {
    await persistEvidencePhotoUrl(JPEG_DATA_URL, {
      category: 'collection',
      entityId: 'e-3',
    });

    expect(mockUpload).toHaveBeenCalledWith(
      'collection/unknown-driver/e-3.jpg',
      expect.any(Blob),
      expect.any(Object),
    );
  });
});

// ══ upload error ════════════════════════════════════════════════════════════════

describe('persistEvidencePhotoUrl() — upload error', () => {
  it('returns null (non-blocking) when the bucket upload returns an error', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'Storage quota exceeded' } });

    const result = await persistEvidencePhotoUrl(JPEG_DATA_URL, {
      category: 'collection',
      entityId: 'e-1',
    });

    // Upload failures are non-blocking: the function logs a warning and
    // returns null so a Storage outage cannot freeze the sync pipeline.
    expect(result).toBeNull();
  });
});

// ══ invalid data-URL (parseDataUrl branch) ════════════════════════════════════

describe('persistEvidencePhotoUrl() — invalid data-URL', () => {
  it('throws when the data-URL is malformed', async () => {
    // This matches isDataImageUrl but not parseDataUrl's stricter regex
    const badUrl = 'data:image/jpeg;base64,'; // no payload after comma

    await expect(
      persistEvidencePhotoUrl(badUrl, { category: 'collection', entityId: 'e-bad' }),
    ).rejects.toThrow('Unsupported image data URL');
  });
});
