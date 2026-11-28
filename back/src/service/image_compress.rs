// 画像を縮めて送る（Docs の本文の画像。FN0801-BR16・FN0902-BR09）。元のファイルは変えない。
// 長い辺をサーバーの設定の上限までにし、透明の無いものは JPEG（画質はサーバーの設定）、透明のあるものは PNG にする。
// 縮めたほうが大きければ元のまま。GIF（動き）・SVG（図）は縮めない
use std::io::Cursor;

use image::{DynamicImage, ImageFormat, codecs::jpeg::JpegEncoder, imageops::FilterType};

const SHRINKABLE: [&str; 4] = ["image/png", "image/jpeg", "image/webp", "image/bmp"];

pub fn shrink(
    bytes: &[u8],
    mime: &str,
    quality: i64,
    max_side: i64,
) -> Option<(Vec<u8>, &'static str)> {
    if !SHRINKABLE.contains(&mime) {
        return None;
    }
    let image = image::load_from_memory(bytes).ok()?;
    let max_side = max_side.clamp(1, u32::MAX as i64) as u32;
    let image = if image.width().max(image.height()) > max_side {
        image.resize(max_side, max_side, FilterType::Lanczos3)
    } else {
        image
    };
    let transparent =
        image.color().has_alpha() && image.to_rgba8().pixels().any(|pixel| pixel.0[3] < 255);
    let mut out = Vec::new();
    let mime = if transparent {
        image
            .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
            .ok()?;
        "image/png"
    } else {
        let rgb = DynamicImage::ImageRgb8(image.to_rgb8());
        let encoder = JpegEncoder::new_with_quality(&mut out, quality.clamp(10, 100) as u8);
        rgb.write_with_encoder(encoder).ok()?;
        "image/jpeg"
    };
    (out.len() < bytes.len()).then_some((out, mime))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage, Rgba, RgbaImage};

    fn png(image: DynamicImage) -> Vec<u8> {
        let mut out = Vec::new();
        image
            .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
            .unwrap();
        out
    }

    #[test]
    fn large_photos_become_smaller_jpeg_within_the_limit() {
        let photo = RgbImage::from_fn(3000, 2000, |x, y| {
            Rgb([(x % 251) as u8, (y % 241) as u8, ((x + y) % 239) as u8])
        });
        let bytes = png(DynamicImage::ImageRgb8(photo));
        let (out, mime) = shrink(&bytes, "image/png", 85, 1920).unwrap();
        assert_eq!(mime, "image/jpeg");
        assert!(out.len() < bytes.len());
        let back = image::load_from_memory(&out).unwrap();
        assert_eq!((back.width(), back.height()), (1920, 1280));
    }

    #[test]
    fn transparent_images_stay_png_and_others_are_left_alone() {
        let icon = RgbaImage::from_fn(2400, 2400, |x, _| {
            Rgba([0, 0, 0, if x % 2 == 0 { 0 } else { 255 }])
        });
        let bytes = png(DynamicImage::ImageRgba8(icon));
        let (out, mime) = shrink(&bytes, "image/png", 85, 1200).unwrap();
        assert_eq!(mime, "image/png");
        assert_eq!(image::load_from_memory(&out).unwrap().width(), 1200);
        assert!(shrink(b"<svg/>", "image/svg+xml", 85, 1920).is_none());
        assert!(shrink(b"GIF89a", "image/gif", 85, 1920).is_none());
        // 小さな図は、縮めたほうが大きくなるので元のまま
        let small = png(DynamicImage::ImageRgb8(RgbImage::from_pixel(
            10,
            10,
            Rgb([255, 255, 255]),
        )));
        assert!(shrink(&small, "image/png", 85, 1920).is_none());
    }
}
