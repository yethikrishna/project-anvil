/**
 * @anvil/image-wasm — WASM image processing pipeline
 *
 * High-performance image processing powered by Rust + WebAssembly.
 * Operations run 10-50x faster than equivalent JavaScript.
 *
 * Operations: resize, compress, grayscale, blur, brightness,
 * contrast, crop, rotate, flip, sepia, invert, metadata
 *
 * Usage:
 * ```ts
 * import { initWasm, resize, compress } from '@anvil/image-wasm';
 * await initWasm();
 * const result = resize(imageBytes, 800, 600, 'lanczos3', 'jpeg');
 * ```
 */

export interface ProcessedImage {
  data: Uint8Array;
  width: number;
  height: number;
  format: string;
  originalSize: number;
  processedSize: number;
  compressionRatio: number;
}

export interface ImageMetadata {
  width: number;
  height: number;
  colorType: string;
  fileSize: number;
  megapixels: number;
}

export type ResizeFilter = 'nearest' | 'triangle' | 'catmullrom' | 'gaussian' | 'lanczos3';
export type OutputFormat = 'png' | 'jpeg' | 'webp' | 'gif';

let wasmReady = false;
let wasmModule: any = null;

/**
 * Initialize the WASM module. Must be called before any operation.
 */
export async function initWasm(): Promise<void> {
  if (wasmReady) return;

  try {
    const mod = await import('./pkg/anvil_image.js');
    await mod.default();
    wasmModule = mod;
    wasmReady = true;
  } catch (err) {
    throw new Error(`Failed to initialize image WASM module: ${err}`);
  }
}

/**
 * Check if the WASM module is initialized.
 */
export function isReady(): boolean {
  return wasmReady;
}

function requireReady(): void {
  if (!wasmReady) throw new Error('WASM module not initialized. Call initWasm() first.');
}

function convertResult(raw: any): ProcessedImage {
  return {
    data: new Uint8Array(raw.data),
    width: raw.width,
    height: raw.height,
    format: raw.format,
    originalSize: raw.original_size,
    processedSize: raw.processed_size,
    compressionRatio: raw.compression_ratio,
  };
}

/**
 * Resize an image to the specified dimensions.
 *
 * Pass 0 for width or height to maintain aspect ratio.
 */
export function resize(
  input: Uint8Array | ArrayBuffer,
  width: number,
  height: number,
  filter: ResizeFilter = 'lanczos3',
  outputFormat: OutputFormat = 'png',
): ProcessedImage {
  requireReady();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const raw = wasmModule.resize(bytes, width, height, filter, outputFormat);
  return convertResult(raw);
}

/**
 * Compress an image with quality control (1-100, JPEG only).
 */
export function compress(
  input: Uint8Array | ArrayBuffer,
  quality: number = 80,
  outputFormat: OutputFormat = 'jpeg',
): ProcessedImage {
  requireReady();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const raw = wasmModule.compress(bytes, quality, outputFormat);
  return convertResult(raw);
}

/**
 * Apply a grayscale filter.
 */
export function grayscale(
  input: Uint8Array | ArrayBuffer,
  outputFormat: OutputFormat = 'png',
): ProcessedImage {
  requireReady();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const raw = wasmModule.grayscale(bytes, outputFormat);
  return convertResult(raw);
}

/**
 * Apply a Gaussian blur.
 */
export function blur(
  input: Uint8Array | ArrayBuffer,
  sigma: number = 1.0,
  outputFormat: OutputFormat = 'png',
): ProcessedImage {
  requireReady();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const raw = wasmModule.blur(bytes, sigma, outputFormat);
  return convertResult(raw);
}

/**
 * Adjust brightness (-255 to 255).
 */
export function adjustBrightness(
  input: Uint8Array | ArrayBuffer,
  brightness: number,
  outputFormat: OutputFormat = 'png',
): ProcessedImage {
  requireReady();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const raw = wasmModule.adjust_brightness(bytes, brightness, outputFormat);
  return convertResult(raw);
}

/**
 * Adjust contrast (0.0 = gray, 1.0 = original, 2.0 = double).
 */
export function adjustContrast(
  input: Uint8Array | ArrayBuffer,
  contrast: number,
  outputFormat: OutputFormat = 'png',
): ProcessedImage {
  requireReady();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const raw = wasmModule.adjust_contrast(bytes, contrast, outputFormat);
  return convertResult(raw);
}

/**
 * Crop an image to the specified region.
 */
export function crop(
  input: Uint8Array | ArrayBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  outputFormat: OutputFormat = 'png',
): ProcessedImage {
  requireReady();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const raw = wasmModule.crop(bytes, x, y, width, height, outputFormat);
  return convertResult(raw);
}

/**
 * Rotate an image (90, 180, or 270 degrees).
 */
export function rotate(
  input: Uint8Array | ArrayBuffer,
  degrees: 90 | 180 | 270,
  outputFormat: OutputFormat = 'png',
): ProcessedImage {
  requireReady();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const raw = wasmModule.rotate(bytes, degrees, outputFormat);
  return convertResult(raw);
}

/**
 * Flip an image horizontally.
 */
export function flipHorizontal(
  input: Uint8Array | ArrayBuffer,
  outputFormat: OutputFormat = 'png',
): ProcessedImage {
  requireReady();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const raw = wasmModule.flip_horizontal(bytes, outputFormat);
  return convertResult(raw);
}

/**
 * Flip an image vertically.
 */
export function flipVertical(
  input: Uint8Array | ArrayBuffer,
  outputFormat: OutputFormat = 'png',
): ProcessedImage {
  requireReady();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const raw = wasmModule.flip_vertical(bytes, outputFormat);
  return convertResult(raw);
}

/**
 * Apply a sepia tone filter.
 */
export function sepia(
  input: Uint8Array | ArrayBuffer,
  outputFormat: OutputFormat = 'png',
): ProcessedImage {
  requireReady();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const raw = wasmModule.sepia(bytes, outputFormat);
  return convertResult(raw);
}

/**
 * Invert all colors.
 */
export function invert(
  input: Uint8Array | ArrayBuffer,
  outputFormat: OutputFormat = 'png',
): ProcessedImage {
  requireReady();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const raw = wasmModule.invert(bytes, outputFormat);
  return convertResult(raw);
}

/**
 * Get image metadata without full decode.
 */
export function getMetadata(input: Uint8Array | ArrayBuffer): ImageMetadata {
  requireReady();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const raw = wasmModule.get_metadata(bytes);
  return {
    width: raw.width,
    height: raw.height,
    colorType: raw.colorType,
    fileSize: raw.fileSize,
    megapixels: raw.megapixels,
  };
}

/**
 * Create a thumbnail (resize to fit within max dimensions, maintaining aspect ratio).
 */
export function thumbnail(
  input: Uint8Array | ArrayBuffer,
  maxWidth: number = 200,
  maxHeight: number = 200,
  outputFormat: OutputFormat = 'jpeg',
  quality: number = 80,
): ProcessedImage {
  const meta = getMetadata(input);
  const scale = Math.min(maxWidth / meta.width, maxHeight / meta.height, 1.0);
  const targetW = Math.round(meta.width * scale);
  const targetH = Math.round(meta.height * scale);
  const resized = resize(input, targetW, targetH, 'lanczos3', outputFormat);

  if (outputFormat === 'jpeg') {
    return compress(resized.data, quality, 'jpeg');
  }
  return resized;
}

/**
 * Auto-optimize an image for web (smart resize + compress).
 */
export function optimizeForWeb(
  input: Uint8Array | ArrayBuffer,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    format?: OutputFormat;
  } = {},
): ProcessedImage {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 80,
    format = 'jpeg',
  } = options;

  const meta = getMetadata(input);
  let processed: Uint8Array | ArrayBuffer = input;

  // Resize if needed
  if (meta.width > maxWidth || meta.height > maxHeight) {
    const scale = Math.min(maxWidth / meta.width, maxHeight / meta.height);
    const targetW = Math.round(meta.width * scale);
    const targetH = Math.round(meta.height * scale);
    const resized = resize(processed, targetW, targetH, 'lanczos3', format);
    processed = resized.data;
  } else {
    // Just convert format
    const resized = resize(processed, meta.width, meta.height, 'lanczos3', format);
    processed = resized.data;
  }

  // Compress
  if (format === 'jpeg' || format === 'webp') {
    return compress(processed, quality, format);
  }

  return resize(processed, 0, 0, 'lanczos3', format);
}
