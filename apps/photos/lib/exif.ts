/**
 * EXIF extraction and perceptual hash utilities.
 *
 * - Uses `exifr` for robust EXIF parsing (browser + Node)
 * - pHash: 8×8 DCT-based hash for duplicate detection
 *   (pure TypeScript — no native deps, WASM-ready)
 */

export interface ExifData {
  takenAt?: Date;
  camera?: string;
  focalLength?: number;
  aperture?: number;
  iso?: number;
  shutterSpeed?: string;
  lat?: number;
  lng?: number;
  width?: number;
  height?: number;
}

/** Extract EXIF metadata from a JPEG/HEIC buffer */
export async function extractExif(buffer: ArrayBuffer): Promise<ExifData> {
  try {
    // Dynamic import — exifr is ESM
    const exifr = await import('exifr');
    const raw = await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      reviveValues: true,
      translateValues: true,
    });

    if (!raw) return {};

    const lat = raw.latitude ?? raw.GPSLatitude;
    const lng = raw.longitude ?? raw.GPSLongitude;

    return {
      takenAt: raw.DateTimeOriginal ?? raw.CreateDate ?? undefined,
      camera: [raw.Make, raw.Model].filter(Boolean).join(' ') || undefined,
      focalLength: raw.FocalLength,
      aperture: raw.FNumber ?? raw.ApertureValue,
      iso: raw.ISO,
      shutterSpeed: raw.ExposureTime != null
        ? formatShutterSpeed(raw.ExposureTime)
        : undefined,
      lat: typeof lat === 'number' ? lat : undefined,
      lng: typeof lng === 'number' ? lng : undefined,
      width: raw.ExifImageWidth ?? raw.PixelXDimension ?? undefined,
      height: raw.ExifImageHeight ?? raw.PixelYDimension ?? undefined,
    };
  } catch {
    return {};
  }
}

function formatShutterSpeed(seconds: number): string {
  if (seconds >= 1) return `${seconds}s`;
  const denom = Math.round(1 / seconds);
  return `1/${denom}`;
}

/**
 * Perceptual hash (pHash) — 64-bit DCT-based hash.
 * Input: 8×8 grayscale pixel array (64 values, 0-255).
 * Returns a 16-char hex string.
 *
 * In the browser, use canvas to scale and read pixels.
 * On the server, use sharp or canvas-compatible lib.
 */
export function computePHashFromPixels(pixels8x8: number[]): string {
  if (pixels8x8.length !== 64) {
    throw new Error('pHash expects exactly 64 pixels (8×8 grayscale)');
  }

  // DCT on 8×8 grid
  const dct: number[] = new Array(64).fill(0);
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
          sum +=
            pixels8x8[x * 8 + y] *
            Math.cos(((2 * x + 1) * u * Math.PI) / 16) *
            Math.cos(((2 * y + 1) * v * Math.PI) / 16);
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      dct[u * 8 + v] = (cu * cv * sum) / 4;
    }
  }

  // Top-left 8×8 (skip DC component at [0,0])
  const top32 = dct.slice(1, 33);
  const mean = top32.reduce((a, b) => a + b, 0) / top32.length;

  // Build 64-bit hash
  let bits = '';
  for (const val of dct.slice(0, 64)) {
    bits += val > mean ? '1' : '0';
  }

  // Convert to 16-char hex
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/** Hamming distance between two hex pHash strings */
export function pHashDistance(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    dist += xor.toString(2).split('').filter(c => c === '1').length;
  }
  return dist;
}

/** Threshold: photos within distance ≤ 10 are considered duplicates */
export const DUPLICATE_THRESHOLD = 10;
