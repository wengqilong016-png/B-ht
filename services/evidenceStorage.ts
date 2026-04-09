import { supabase } from '../supabaseClient';

export const EVIDENCE_BUCKET = 'evidence';

interface EvidenceUploadOptions {
  category: 'collection' | 'reset-request' | 'payroll';
  entityId: string;
  driverId?: string | null;
}

interface ParsedDataUrl {
  mimeType: string;
  bytes: Uint8Array;
}

interface EvidenceBucket {
  upload: (path: string, body: Blob, options?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  getPublicUrl: (path: string) => { data: { publicUrl: string } };
}

function isDataImageUrl(value: string): boolean {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
}

function parseDataUrl(dataUrl: string): ParsedDataUrl {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Unsupported image data URL');
  }

  const [, mimeType, base64Payload] = match;
  const binary = atob(base64Payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return { mimeType, bytes };
}

function getFileExtension(mimeType: string): string {
  const subtype = mimeType.split('/')[1] ?? 'jpeg';
  if (subtype === 'jpeg') return 'jpg';
  return subtype.replace(/[^a-zA-Z0-9]+/g, '-');
}

function buildObjectPath(options: EvidenceUploadOptions, extension: string): string {
  const driverSegment = options.driverId?.trim() ? options.driverId.trim() : 'unknown-driver';
  return `${options.category}/${driverSegment}/${options.entityId}.${extension}`;
}

function createBlobFromBytes(bytes: Uint8Array, mimeType: string): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: mimeType });
}

function getEvidenceStorageBucket(): EvidenceBucket | null {
  const storage = (supabase as typeof supabase & {
    storage?: {
      from?: (bucket: string) => EvidenceBucket;
    };
  }).storage;

  if (!storage?.from) {
    return null;
  }

  return storage.from(EVIDENCE_BUCKET);
}

async function uploadWithRetry(
  bucket: EvidenceBucket,
  objectPath: string,
  blob: Blob,
  mimeType: string,
): Promise<{ message: string } | null> {
  const MAX_RETRIES = 2;
  let uploadError: { message: string } | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    uploadError = null;
    try {
      const { error } = await bucket.upload(objectPath, blob, {
        contentType: mimeType,
        upsert: true,
        signal: AbortSignal.timeout(15_000),
      });
      uploadError = error;
    } catch (error) {
      uploadError = { message: error instanceof Error ? error.message : String(error) };
    }

    if (!uploadError) {
      return null;
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  console.warn(
    `[evidenceStorage] Upload failed for ${objectPath} after ${MAX_RETRIES + 1} attempts — proceeding without photo URL.`,
    uploadError?.message,
  );
  return uploadError;
}

export async function persistEvidencePhotoUrl(
  photoUrl: string | null | undefined,
  options: EvidenceUploadOptions,
): Promise<string | null> {
  if (!photoUrl) return null;
  if (!isDataImageUrl(photoUrl)) return photoUrl;
  if (!supabase) throw new Error('Supabase client unavailable');

  const bucket = getEvidenceStorageBucket();
  if (!bucket) {
    return photoUrl;
  }

  const { mimeType, bytes } = parseDataUrl(photoUrl);
  const extension = getFileExtension(mimeType);
  const objectPath = buildObjectPath(options, extension);
  const blob = createBlobFromBytes(bytes, mimeType);

  const uploadError = await uploadWithRetry(bucket, objectPath, blob, mimeType);
  if (uploadError) {
    return null;
  }

  return bucket.getPublicUrl(objectPath).data.publicUrl;
}
