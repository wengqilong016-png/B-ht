/**
 * imageUtils.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Utilities for client-side image compression and resizing, 
 * optimized for weak network environments in East Africa.
 */

const MAX_IMAGE_WIDTH = 1024; // Target max width for mobile display
const MAX_IMAGE_HEIGHT = 1024; // Target max height
const JPEG_QUALITY = 0.6; // High compression for fast uploads

/**
 * Resizes and compresses an image file before upload.
 * Reduces 5MB+ photos to ~100KB-200KB.
 */
export const compressAndResizeImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Maintain aspect ratio while resizing
        if (width > height) {
          if (width > MAX_IMAGE_WIDTH) {
            height *= MAX_IMAGE_WIDTH / width;
            width = MAX_IMAGE_WIDTH;
          }
        } else {
          if (height > MAX_IMAGE_HEIGHT) {
            width *= MAX_IMAGE_HEIGHT / height;
            height = MAX_IMAGE_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to get canvas 2d context'));
        }
        
        // Use high-quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas to Blob conversion failed'));
            }
          },
          'image/jpeg',
          JPEG_QUALITY
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

/**
 * Generates a Supabase-optimized image URL with transformations if available.
 * Also appends a cache-friendly timestamp if needed.
 */
export const getOptimizedImageUrl = (
  originalUrl: string, 
  width: number = 400, 
  height: number = 400, 
  quality: number = 70
): string => {
  if (!originalUrl) return '';
  
  // Basic optimization: if it's a Supabase public URL, we can attempt render transformations
  // Format: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
  const isSupabase = originalUrl.includes('.supabase.co/storage/v1/object/public/');
  
  if (isSupabase) {
    const parts = originalUrl.split('/storage/v1/object/public/');
    if (parts.length === 2) {
      const baseUrl = parts[0];
      const bucketAndPath = parts[1];
      // Note: This requires Supabase Image Transformation to be enabled on the project
      return `${baseUrl}/storage/v1/render/image/public/${bucketAndPath}?width=${width}&height=${height}&quality=${quality}`;
    }
  }
  
  return originalUrl;
};
