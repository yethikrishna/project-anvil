//! Anvil Image Processing — WASM module
//!
//! High-performance image processing compiled to WebAssembly.
//! Provides resize, compress, filter, and format conversion
//! operations that run 10-50x faster than JavaScript equivalents.

use wasm_bindgen::prelude::*;
use image::{DynamicImage, GenericImageView, ImageFormat, imageops::FilterType};

/// Helper to build a ProcessedImage, computing size before moving data.
fn build_result(
    data: Vec<u8>,
    width: u32,
    height: u32,
    format: String,
    original_size: usize,
) -> ProcessedImage {
    let processed_size = data.len();
    ProcessedImage {
        data,
        width,
        height,
        format,
        original_size,
        processed_size,
    }
}

/// Image processing result returned to JavaScript
#[wasm_bindgen]
pub struct ProcessedImage {
    data: Vec<u8>,
    width: u32,
    height: u32,
    format: String,
    original_size: usize,
    processed_size: usize,
}

#[wasm_bindgen]
impl ProcessedImage {
    #[wasm_bindgen(getter)]
    pub fn data(&self) -> Vec<u8> {
        self.data.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 {
        self.width
    }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.height
    }

    #[wasm_bindgen(getter)]
    pub fn format(&self) -> String {
        self.format.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn original_size(&self) -> usize {
        self.original_size
    }

    #[wasm_bindgen(getter)]
    pub fn processed_size(&self) -> usize {
        self.processed_size
    }

    #[wasm_bindgen(getter)]
    pub fn compression_ratio(&self) -> f64 {
        if self.original_size == 0 { return 0.0; }
        self.processed_size as f64 / self.original_size as f64
    }
}

/// Encode a DynamicImage to bytes in the given format.
fn encode_image(img: &DynamicImage, fmt: ImageFormat) -> Result<Vec<u8>, JsValue> {
    let mut buf = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut buf), fmt)
        .map_err(|e| JsValue::from_str(&format!("Encoding failed: {}", e)))?;
    Ok(buf)
}

/// Encode with JPEG quality.
fn encode_jpeg(img: &DynamicImage, quality: u8) -> Result<Vec<u8>, JsValue> {
    let mut buf = Vec::new();
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
    img.write_with_encoder(encoder)
        .map_err(|e| JsValue::from_str(&format!("JPEG encoding failed: {}", e)))?;
    Ok(buf)
}

/// Resize an image to the specified dimensions.
#[wasm_bindgen]
pub fn resize(
    input: &[u8],
    width: u32,
    height: u32,
    filter: &str,
    output_format: &str,
) -> Result<ProcessedImage, JsValue> {
    let original_size = input.len();
    let img = image::load_from_memory(input)
        .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;

    let (orig_w, orig_h) = img.dimensions();
    let target_w = if width == 0 { (height as f64 * orig_w as f64 / orig_h as f64) as u32 } else { width };
    let target_h = if height == 0 { (width as f64 * orig_h as f64 / orig_w as f64) as u32 } else { height };

    let filter_type = match filter {
        "nearest" => FilterType::Nearest,
        "triangle" => FilterType::Triangle,
        "catmullrom" => FilterType::CatmullRom,
        "gaussian" => FilterType::Gaussian,
        _ => FilterType::Lanczos3,
    };

    let resized = img.resize_exact(target_w, target_h, filter_type);
    let (fmt, fmt_str) = parse_format(output_format);
    let data = encode_image(&resized, fmt)?;

    Ok(build_result(data, target_w, target_h, fmt_str, original_size))
}

/// Compress an image with quality control.
#[wasm_bindgen]
pub fn compress(
    input: &[u8],
    quality: u8,
    output_format: &str,
) -> Result<ProcessedImage, JsValue> {
    let original_size = input.len();
    let img = image::load_from_memory(input)
        .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;

    let (w, h) = img.dimensions();
    let (fmt, fmt_str) = parse_format(output_format);

    let data = if matches!(fmt, ImageFormat::Jpeg) {
        encode_jpeg(&img, quality)?
    } else {
        encode_image(&img, fmt)?
    };

    Ok(build_result(data, w, h, fmt_str, original_size))
}

/// Apply a grayscale filter.
#[wasm_bindgen]
pub fn grayscale(input: &[u8], output_format: &str) -> Result<ProcessedImage, JsValue> {
    let original_size = input.len();
    let img = image::load_from_memory(input)
        .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;

    let (w, h) = img.dimensions();
    let gray = img.grayscale();
    let (fmt, fmt_str) = parse_format(output_format);
    let data = encode_image(&gray, fmt)?;

    Ok(build_result(data, w, h, fmt_str, original_size))
}

/// Apply a Gaussian blur.
#[wasm_bindgen]
pub fn blur(input: &[u8], sigma: f32, output_format: &str) -> Result<ProcessedImage, JsValue> {
    let original_size = input.len();
    let img = image::load_from_memory(input)
        .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;

    let (w, h) = img.dimensions();
    let blurred = img.blur(sigma);
    let (fmt, fmt_str) = parse_format(output_format);
    let data = encode_image(&blurred, fmt)?;

    Ok(build_result(data, w, h, fmt_str, original_size))
}

/// Adjust brightness (-255 to 255).
#[wasm_bindgen]
pub fn adjust_brightness(input: &[u8], brightness: i32, output_format: &str) -> Result<ProcessedImage, JsValue> {
    let original_size = input.len();
    let img = image::load_from_memory(input)
        .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;

    let (w, h) = img.dimensions();
    let adjusted = img.brighten(brightness);
    let (fmt, fmt_str) = parse_format(output_format);
    let data = encode_image(&adjusted, fmt)?;

    Ok(build_result(data, w, h, fmt_str, original_size))
}

/// Adjust contrast (0.0 = gray, 1.0 = original, 2.0 = double).
#[wasm_bindgen]
pub fn adjust_contrast(input: &[u8], contrast: f32, output_format: &str) -> Result<ProcessedImage, JsValue> {
    let original_size = input.len();
    let img = image::load_from_memory(input)
        .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;

    let (w, h) = img.dimensions();
    let adjusted = img.adjust_contrast(contrast);
    let (fmt, fmt_str) = parse_format(output_format);
    let data = encode_image(&adjusted, fmt)?;

    Ok(build_result(data, w, h, fmt_str, original_size))
}

/// Crop an image to the specified region.
#[wasm_bindgen]
pub fn crop(
    input: &[u8],
    x: u32,
    y: u32,
    crop_width: u32,
    crop_height: u32,
    output_format: &str,
) -> Result<ProcessedImage, JsValue> {
    let original_size = input.len();
    let mut img = image::load_from_memory(input)
        .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;

    let cropped = img.crop(x, y, crop_width, crop_height);
    let (fmt, fmt_str) = parse_format(output_format);
    let data = encode_image(&cropped, fmt)?;

    Ok(build_result(data, crop_width, crop_height, fmt_str, original_size))
}

/// Rotate an image by 90, 180, or 270 degrees.
#[wasm_bindgen]
pub fn rotate(input: &[u8], degrees: u32, output_format: &str) -> Result<ProcessedImage, JsValue> {
    let original_size = input.len();
    let img = image::load_from_memory(input)
        .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;

    let rotated = match degrees {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 => img.rotate270(),
        _ => img,
    };

    let (w, h) = rotated.dimensions();
    let (fmt, fmt_str) = parse_format(output_format);
    let data = encode_image(&rotated, fmt)?;

    Ok(build_result(data, w, h, fmt_str, original_size))
}

/// Flip an image horizontally.
#[wasm_bindgen]
pub fn flip_horizontal(input: &[u8], output_format: &str) -> Result<ProcessedImage, JsValue> {
    let original_size = input.len();
    let img = image::load_from_memory(input)
        .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;

    let (w, h) = img.dimensions();
    let flipped = img.fliph();
    let (fmt, fmt_str) = parse_format(output_format);
    let data = encode_image(&flipped, fmt)?;

    Ok(build_result(data, w, h, fmt_str, original_size))
}

/// Flip an image vertically.
#[wasm_bindgen]
pub fn flip_vertical(input: &[u8], output_format: &str) -> Result<ProcessedImage, JsValue> {
    let original_size = input.len();
    let img = image::load_from_memory(input)
        .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;

    let (w, h) = img.dimensions();
    let flipped = img.flipv();
    let (fmt, fmt_str) = parse_format(output_format);
    let data = encode_image(&flipped, fmt)?;

    Ok(build_result(data, w, h, fmt_str, original_size))
}

/// Get image metadata.
#[wasm_bindgen]
pub fn get_metadata(input: &[u8]) -> Result<JsValue, JsValue> {
    let img = image::load_from_memory(input)
        .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;

    let (w, h) = img.dimensions();
    let color_type = match img.color() {
        image::ColorType::L8 => "Grayscale 8-bit",
        image::ColorType::La8 => "Grayscale+Alpha 8-bit",
        image::ColorType::Rgb8 => "RGB 8-bit",
        image::ColorType::Rgba8 => "RGBA 8-bit",
        image::ColorType::L16 => "Grayscale 16-bit",
        image::ColorType::La16 => "Grayscale+Alpha 16-bit",
        image::ColorType::Rgb16 => "RGB 16-bit",
        image::ColorType::Rgba16 => "RGBA 16-bit",
        _ => "Unknown",
    };

    let result = js_sys::Object::new();
    js_sys::Reflect::set(&result, &"width".into(), &w.into()).unwrap();
    js_sys::Reflect::set(&result, &"height".into(), &h.into()).unwrap();
    js_sys::Reflect::set(&result, &"colorType".into(), &color_type.into()).unwrap();
    js_sys::Reflect::set(&result, &"fileSize".into(), &input.len().into()).unwrap();
    js_sys::Reflect::set(&result, &"megapixels".into(), &((w as f64 * h as f64) / 1_000_000.0).into()).unwrap();

    Ok(result.into())
}

/// Apply a sepia tone filter.
#[wasm_bindgen]
pub fn sepia(input: &[u8], output_format: &str) -> Result<ProcessedImage, JsValue> {
    let original_size = input.len();
    let img = image::load_from_memory(input)
        .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;

    let (w, h) = img.dimensions();
    let mut rgba = img.to_rgba8();

    for pixel in rgba.pixels_mut() {
        let r = pixel[0] as f32;
        let g = pixel[1] as f32;
        let b = pixel[2] as f32;

        pixel[0] = (r * 0.393 + g * 0.769 + b * 0.189).min(255.0) as u8;
        pixel[1] = (r * 0.349 + g * 0.686 + b * 0.168).min(255.0) as u8;
        pixel[2] = (r * 0.272 + g * 0.534 + b * 0.131).min(255.0) as u8;
    }

    let result_img = DynamicImage::ImageRgba8(rgba);
    let (fmt, fmt_str) = parse_format(output_format);
    let data = encode_image(&result_img, fmt)?;

    Ok(build_result(data, w, h, fmt_str, original_size))
}

/// Invert all colors in the image.
#[wasm_bindgen]
pub fn invert(input: &[u8], output_format: &str) -> Result<ProcessedImage, JsValue> {
    let original_size = input.len();
    let mut img = image::load_from_memory(input)
        .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;

    let (w, h) = img.dimensions();
    img.invert();
    let (fmt, fmt_str) = parse_format(output_format);
    let data = encode_image(&img, fmt)?;

    Ok(build_result(data, w, h, fmt_str, original_size))
}

// ── Helpers ──────────────────────────────────────────────

fn parse_format(format: &str) -> (ImageFormat, String) {
    match format.to_lowercase().as_str() {
        "jpeg" | "jpg" => (ImageFormat::Jpeg, "jpeg".to_string()),
        "webp" => (ImageFormat::WebP, "webp".to_string()),
        "gif" => (ImageFormat::Gif, "gif".to_string()),
        _ => (ImageFormat::Png, "png".to_string()),
    }
}
