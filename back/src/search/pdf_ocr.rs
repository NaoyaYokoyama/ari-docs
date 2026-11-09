// PDF の中の文字を、文字認識で読む（FN0202-BR14）。次のページを画像に描いて読む。
// - 文字がほとんど無いページ（スキャンした書類・白黒の複合機の形式・JPEG 2000・文字を図形にしたもの）
// - 大きな画像（画面の写しなど）を貼り付けたページ
// 画像を取り出して読むのではなくページごと描くのは、画像の入り方（色の表・透明の重ね・Form でくるんだもの・
// CCITT・JBIG2 など）にかかわらず、画面に見えるとおりに読むため。文字のある部分も読むが、同じ単語は 1 つにまとまる
use std::collections::HashSet;

use hayro::hayro_interpret::InterpreterSettings;
use hayro::hayro_syntax::Pdf;
use hayro::hayro_syntax::page::Page;
use hayro::vello_cpu::color::palette::css::WHITE;
use hayro::{PixmapSettings, RenderCache, RenderSettings, render};
use image::{DynamicImage, RgbImage};
use lopdf::{Dictionary, Document, Object, ObjectId};

use crate::search::ocr::{self, Engine};

// これより文字（空白を除く）が少ないページを、文字の無いページとみなす
const MIN_PAGE_CHARS: usize = 10;
// これ以上の大きさの画像があるページを描いて読む（アイコン・ロゴなどの小さな画像では読まない）
const MIN_IMAGE_WIDTH: i64 = 200;
const MIN_IMAGE_HEIGHT: i64 = 60;
// Form の中の Form をたどる深さの上限（壊れた PDF で止まらないように）
const MAX_FORM_DEPTH: usize = 8;
// ページを描く大きさ。200 dpi を目安にし、長い辺を 2200〜4000 画素に収める
// （ページの大きさが正しく入っていない PDF でも小さくなりすぎないように）
const RENDER_DPI: f32 = 200.0;
const MIN_RENDER_SIDE: f32 = 2200.0;
const MAX_RENDER_SIDE: f32 = 4000.0;

// page_texts はページごとの文字（pdf-extract で取り出したもの。取り出せなければ None で、すべてのページを描いて読む）
pub fn recognize(
    bytes: &[u8],
    page_texts: Option<&[String]>,
    engine: &mut Engine,
) -> Result<String, String> {
    let pdf = Pdf::new(bytes.to_vec()).map_err(|e| format!("PDF を読めません: {e:?}"))?;
    // ページの画像を調べるため（読めなければ、画像は無いものとする）
    let doc = Document::load_mem(bytes).ok();
    let page_ids: Vec<ObjectId> = doc
        .as_ref()
        .map(|doc| doc.get_pages().into_values().collect())
        .unwrap_or_default();
    let pages = pdf.pages();
    let total = pages.len();
    let cache = RenderCache::new();
    let mut texts = Vec::new();
    for (index, page) in pages.iter().enumerate() {
        ocr::report(index, total, "ページ");
        let has_image = match (&doc, page_ids.get(index)) {
            (Some(doc), Some(page_id)) => has_large_image(doc, *page_id),
            _ => false,
        };
        let needs_ocr = has_image
            || !page_texts
                .and_then(|texts| texts.get(index))
                .is_some_and(|text| has_text(text));
        if needs_ocr {
            let image = DynamicImage::ImageRgb8(render_page(page, &cache));
            engine.recognize_into(image, &mut texts)?;
        }
    }
    ocr::report(total, total, "ページ");
    Ok(texts.join("\n"))
}

// 文字のあるページか（lopdf の取り出しは日本語のフォントを読めないことが多いので、pdf-extract の結果で見る）
fn has_text(text: &str) -> bool {
    text.chars().filter(|c| !c.is_whitespace()).count() >= MIN_PAGE_CHARS
}

// ページに大きな画像があるか。Form（画像や図をまとめたもの）の中もたどる
fn has_large_image(doc: &Document, page_id: ObjectId) -> bool {
    let Ok((direct, inherited)) = doc.get_page_resources(page_id) else {
        return false;
    };
    let mut seen = HashSet::new();
    direct
        .into_iter()
        .chain(
            inherited
                .iter()
                .filter_map(|id| doc.get_dictionary(*id).ok()),
        )
        .any(|resources| resources_have_large_image(doc, resources, 0, &mut seen))
}

fn resources_have_large_image(
    doc: &Document,
    resources: &Dictionary,
    depth: usize,
    seen: &mut HashSet<ObjectId>,
) -> bool {
    if depth > MAX_FORM_DEPTH {
        return false;
    }
    let Ok(xobjects) = resources
        .get(b"XObject")
        .and_then(|o| resolve(doc, o).as_dict())
    else {
        return false;
    };
    for (_, value) in xobjects.iter() {
        if let Object::Reference(id) = value
            && !seen.insert(*id)
        {
            continue;
        }
        let Ok(stream) = resolve(doc, value).as_stream() else {
            continue;
        };
        let dict = &stream.dict;
        match dict.get(b"Subtype").and_then(Object::as_name) {
            Ok(b"Image") => {
                let size = |key: &[u8]| dict.get(key).and_then(Object::as_i64).unwrap_or(0);
                if size(b"Width") >= MIN_IMAGE_WIDTH && size(b"Height") >= MIN_IMAGE_HEIGHT {
                    return true;
                }
            }
            Ok(b"Form") => {
                if let Ok(inner) = dict
                    .get(b"Resources")
                    .and_then(|o| resolve(doc, o).as_dict())
                    && resources_have_large_image(doc, inner, depth + 1, seen)
                {
                    return true;
                }
            }
            _ => {}
        }
    }
    false
}

// 参照（12 0 R など）なら指している先
fn resolve<'a>(doc: &'a Document, object: &'a Object) -> &'a Object {
    match object {
        Object::Reference(id) => doc.get_object(*id).unwrap_or(object),
        _ => object,
    }
}

fn render_page<'a>(page: &'a Page<'a>, cache: &RenderCache<'a>) -> RgbImage {
    let (width, height) = page.render_dimensions();
    let long = width.max(height).max(1.0);
    let side = (long / 72.0 * RENDER_DPI).clamp(MIN_RENDER_SIDE, MAX_RENDER_SIDE);
    let scale = side / long;
    let pixmap = render(
        page,
        cache,
        &InterpreterSettings::default(),
        &RenderSettings::default(),
        &PixmapSettings {
            x_scale: scale,
            y_scale: scale,
            bg_color: WHITE,
        },
    );
    let (w, h) = (u32::from(pixmap.width()), u32::from(pixmap.height()));
    // 白い背景に描くので透明な部分は無い（RGBA の A を捨てる）
    let rgb = pixmap
        .data_as_u8_slice()
        .chunks_exact(4)
        .flat_map(|px| [px[0], px[1], px[2]])
        .collect();
    RgbImage::from_raw(w, h, rgb).unwrap_or_else(|| RgbImage::new(1, 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    // 白黒の複合機の形式（CCITT G4）でスキャンした、文字の入っていない PDF。モデルがあるときだけ
    #[test]
    fn recognizes_scanned_pdf() {
        if !ocr::available() {
            eprintln!("文字認識のモデルが無いので飛ばす");
            return;
        }
        let bytes = std::fs::read("src/search/testdata/scan_ccitt.pdf").unwrap();
        let text = recognize(&bytes, None, &mut Engine::new()).unwrap();
        for expected in [
            "業務委託契約書",
            "3,850,000円",
            "秘密保持",
            "令和8年11月8日",
        ] {
            assert!(text.contains(expected), "{expected} が無い: {text}");
        }
    }

    // 文字のあるページに、色の表（Indexed）の PNG で画面の写しを貼った PDF（LibreOffice で作ったもの）
    #[test]
    fn recognizes_pasted_screenshot_on_text_page() {
        let bytes = std::fs::read("src/search/testdata/pasted_screenshot.pdf").unwrap();
        let doc = Document::load_mem(&bytes).unwrap();
        let page_id = *doc.get_pages().values().next().unwrap();
        let pages = pdf_extract::extract_text_from_mem_by_pages(&bytes).unwrap();
        assert!(has_text(&pages[0]));
        assert!(has_large_image(&doc, page_id));
        if !ocr::available() {
            eprintln!("文字認識のモデルが無いので飛ばす");
            return;
        }
        let text = recognize(&bytes, Some(&pages), &mut Engine::new()).unwrap();
        assert!(text.contains("オカピ連携"), "{text}");
    }

    #[test]
    fn scanned_page_has_no_text_and_no_large_image_check_needed() {
        let bytes = std::fs::read("src/search/testdata/scan_ccitt.pdf").unwrap();
        let pages = pdf_extract::extract_text_from_mem_by_pages(&bytes).unwrap_or_default();
        assert!(pages.iter().all(|page| !has_text(page)));
        assert!(has_text("文字の入っているページの本文です。"));
    }
}
