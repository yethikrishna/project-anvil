# @anvil/image-wasm

WASM image processing pipeline powered by Rust.

## Operations

| Operation | Function | Description |
|-----------|----------|-------------|
| Resize | `resize()` | Resize with Lanczos3/triangle/nearest filters |
| Compress | `compress()` | JPEG quality control (1-100) |
| Grayscale | `grayscale()` | Convert to grayscale |
| Blur | `blur()` | Gaussian blur with configurable sigma |
| Brightness | `adjustBrightness()` | Adjust brightness (-255 to 255) |
| Contrast | `adjustContrast()` | Adjust contrast (0.0-2.0) |
| Crop | `crop()` | Crop to region |
| Rotate | `rotate()` | Rotate 90/180/270° |
| Flip H | `flipHorizontal()` | Mirror horizontally |
| Flip V | `flipVertical()` | Mirror vertically |
| Sepia | `sepia()` | Sepia tone filter |
| Invert | `invert()` | Invert all colors |
| Metadata | `getMetadata()` | Width, height, color type, file size |
| Thumbnail | `thumbnail()` | Auto-fit with aspect ratio |
| Optimize | `optimizeForWeb()` | Smart resize + compress for web |

## Usage

```ts
import { initWasm, resize, compress, getMetadata } from '@anvil/image-wasm';

await initWasm();

// Get metadata
const meta = getMetadata(imageBytes);
console.log(`${meta.width}x${meta.height}, ${meta.colorType}`);

// Resize to 800x600
const resized = resize(imageBytes, 800, 600, 'lanczos3', 'jpeg');

// Compress JPEG at 80% quality
const compressed = compress(imageBytes, 80, 'jpeg');
console.log(`Compressed to ${compressed.compressionRatio * 100}% of original`);

// Create web-optimized version
const web = optimizeForWeb(imageBytes, { maxWidth: 1920, quality: 80 });
```

## Formats

Input: PNG, JPEG, WebP, GIF
Output: PNG, JPEG, WebP, GIF

## Performance

WASM operations run 10-50x faster than JavaScript equivalents for:
- Image resizing (Lanczos3 resampling)
- Batch compression
- Filter operations (blur, sepia, grayscale)
