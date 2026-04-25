/** Profile avatar image compression & validation utility.
 *
 * Constraints:
 *   - Max final size: 100KB
 *   - Output dimensions: 256×256 (center-cropped square)
 *   - Format: WebP (JPEG fallback)
 *   - Progressive quality: 0.7 → 0.6 → 0.5 → 0.4
 */

const MAX_FILE_SIZE = 100 * 1024; // 100KB hard limit
const MAX_DIM = 256; // 256×256 square
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'];

export type ImageValidationResult =
  | {
      ok: true;
      file: File;
      preview: string;
      compressed: boolean;
      originalSize: number;
      finalSize: number;
    }
  | {
      ok: false;
      error: string;
    };

// ─── Helpers ──────────────────────────────────────────────

/** Load a File into an HTMLImageElement */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to read image'));
    };
    img.src = url;
  });
}

/** Check if browser supports WebP canvas export */
function supportsWebP(): boolean {
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

/** Convert canvas to Blob (async wrapper) */
function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

/** Format bytes for human display */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

/** Sanitize filename: strip path traversal, special chars, limit length */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')  // Only safe chars
    .replace(/\.{2,}/g, '.')            // No double dots
    .replace(/^[-._]+/, '')             // No leading dots/dashes
    .slice(0, 64);                      // Max length
}

// ─── Core Compression ─────────────────────────────────────

/**
 * Center-crop an image to a square, resize to 256×256, compress to ≤100KB.
 *
 * Strategy:
 *  1. Draw center-cropped square onto 256×256 canvas
 *  2. Try WebP at progressive quality levels (fallback to JPEG)
 *  3. Return compressed File or null if impossible
 */
async function compressAvatar(file: File): Promise<{ file: File; blob: Blob } | null> {
  try {
    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = MAX_DIM;
    canvas.height = MAX_DIM;

    // Center-crop to square
    const srcSize = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - srcSize) / 2;
    const sy = (img.naturalHeight - srcSize) / 2;

    // Draw cropped + resized
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, MAX_DIM, MAX_DIM);

    // Determine output format
    const useWebP = supportsWebP();
    const mime = useWebP ? 'image/webp' : 'image/jpeg';
    const ext = useWebP ? 'webp' : 'jpg';

    // Progressive quality reduction
    const qualities = [0.7, 0.6, 0.5, 0.4];
    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, mime, quality);
      if (blob && blob.size <= MAX_FILE_SIZE) {
        const safeName = sanitizeFileName(file.name.replace(/\.[^.]+$/, '')) || 'avatar';
        const outputName = `${safeName}.${ext}`;
        return {
          file: new File([blob], outputName, { type: mime }),
          blob,
        };
      }
    }

    // If WebP failed, try JPEG as a last resort
    if (useWebP) {
      const jpegQualities = [0.5, 0.4, 0.3];
      for (const quality of jpegQualities) {
        const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
        if (blob && blob.size <= MAX_FILE_SIZE) {
          const safeName = sanitizeFileName(file.name.replace(/\.[^.]+$/, '')) || 'avatar';
          return {
            file: new File([blob], `${safeName}.jpg`, { type: 'image/jpeg' }),
            blob,
          };
        }
      }
    }

    return null; // Could not compress enough
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────

/**
 * Validate, center-crop, resize, and compress a profile image.
 *
 * Returns either a success result with the processed file + preview + size info,
 * or an error result with a user-friendly message.
 *
 * Runs async to avoid blocking UI — compression completes in <1s for typical images.
 */
export async function validateAndCompressImage(file: File): Promise<ImageValidationResult> {
  // ── MIME type validation ──
  if (!ACCEPTED_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
    return {
      ok: false,
      error: 'Please select an image file (JPEG, PNG, or WebP).',
    };
  }

  const originalSize = file.size;

  // ── Always compress to get square-cropped 256×256 version ──
  // Even small files need cropping + resizing for consistency
  const result = await compressAvatar(file);

  if (result) {
    return {
      ok: true,
      file: result.file,
      preview: URL.createObjectURL(result.blob),
      compressed: true,
      originalSize,
      finalSize: result.file.size,
    };
  }

  // Compression wasn't enough
  return {
    ok: false,
    error: 'Image is too large even after compression. Please choose a smaller image.',
  };
}
