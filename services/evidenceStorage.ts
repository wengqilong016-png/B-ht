import { supabase } from '../supabaseClient';

export const EVIDENCE_BUCKET = 'evidence';

interface EvidenceUploadOptions {
  category: 'collection' | 'reset-request';
  entityId: string;
  driverId?: string | null;
}

interface ParsedDataUrl {
  mimeType: string;
  bytes: Uint8Array;
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

export async function persistEvidencePhotoUrl(
  photoUrl: string | null | undefined,
  options: EvidenceUploadOptions,
): Promise<string | null> {
  if (!photoUrl) return null;
  if (!isDataImageUrl(photoUrl)) return photoUrl;
  if (!supabase) throw new Error('Supabase client unavailable');

  const storage = (supabase as typeof supabase & {
    storage?: {
      from?: (bucket: string) => {
        upload: (path: string, body: Blob, options?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
        getPublicUrl: (path: string) => { data: { publicUrl: string } };
      };
    };
  }).storage;

  if (!storage?.from) {
    return photoUrl;
  }

  const { mimeType, bytes } = parseDataUrl(photoUrl);
  const extension = getFileExtension(mimeType);
  const objectPath = buildObjectPath(options, extension);
  const blob = new Blob([bytes], { type: mimeType });
  const bucket = storage.from(EVIDENCE_BUCKET);

  const { error } = await bucket.upload(objectPath, blob, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Evidence upload failed: ${error.message}`);
  }

  return bucket.getPublicUrl(objectPath).data.publicUrl;
}
