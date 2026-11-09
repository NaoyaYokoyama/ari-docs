// 画像の中の文字を読む（文字認識。FN0202-BR14）。PaddleOCR の PP-OCRv6 small を ONNX Runtime で動かす。
// ONNX Runtime はアプリに組み込み、モデルは models フォルダ（exe の横。開発時は back/models）に置く。
// モデルが無いときは文字認識だけを飛ばす（ほかの取り込みはいつもどおり）
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};

use image::{DynamicImage, ImageReader, RgbImage, imageops::FilterType};
use oar_ocr::core::config::OrtSessionConfig;
use oar_ocr::domain::tasks::TextDetectionConfig;
use oar_ocr::prelude::{OAROCR, OAROCRBuilder};
use serde::Serialize;

// models フォルダに置くファイル（build_models.rs が用意する）
pub const DETECTION_MODEL: &str = "pp-ocrv6_small_det.onnx";
pub const RECOGNITION_MODEL: &str = "pp-ocrv6_small_rec.onnx";
pub const CHARACTER_DICT: &str = "ppocrv6_dict.txt";
pub const MODEL_NAME: &str = "PaddleOCR PP-OCRv6 small";

// 文字認識する画像ファイルの拡張子
pub const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "bmp", "gif", "tif", "tiff", "webp"];

// これより自信の低い読み取りは登録しない（ゴミの単語を減らす）
const MIN_CONFIDENCE: f32 = 0.5;
// これより画素の多い画像は読まない（メモリを使いすぎないように。約 4,000 万画素 = 8000×5000）
const MAX_PIXELS: u64 = 40_000_000;
// 長い辺がこれより大きい画像は縮めてから読む
const MAX_SIDE: u32 = 4000;
// これより小さい画像（アイコン・飾りなど）は読まない
const MIN_WIDTH: u32 = 48;
const MIN_HEIGHT: u32 = 16;

// 文字認識した版の印。辞書の版と組み合わせ、モデルを置いたら PDF・画像・Office だけを取り込み直す
const VERSION_SALT: i64 = 0x2D51_93A7_6C0E_F48B;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrStatus {
    pub available: bool,
    // 使えるときはモデルの名前、使えないときは理由
    pub message: String,
}

// 文字認識している途中の様子（設定画面の取り込み状況に出す）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrProgress {
    // folder/ からのパス
    pub path: String,
    pub done: usize,
    pub total: usize,
    // ページ・枚
    pub unit: &'static str,
}

static MODELS_DIR: OnceLock<PathBuf> = OnceLock::new();
static STATUS: OnceLock<OcrStatus> = OnceLock::new();
static PROGRESS: RwLock<Option<OcrProgress>> = RwLock::new(None);

// 起動時に 1 回だけ呼ぶ（server::start）
pub fn configure(models_dir: &str) {
    let _ = MODELS_DIR.set(PathBuf::from(models_dir));
}

fn models_dir() -> &'static Path {
    MODELS_DIR.get_or_init(|| PathBuf::from("models"))
}

// 使えるかは最初に 1 回だけ調べる（モデルを置いたら起動し直すと反映）
pub fn status() -> &'static OcrStatus {
    STATUS.get_or_init(|| {
        let dir = models_dir();
        let missing: Vec<&str> = [DETECTION_MODEL, RECOGNITION_MODEL, CHARACTER_DICT]
            .into_iter()
            .filter(|file| !dir.join(file).is_file())
            .collect();
        if missing.is_empty() {
            println!("ocr: {MODEL_NAME}（{}）", dir.display());
            OcrStatus {
                available: true,
                message: MODEL_NAME.to_string(),
            }
        } else {
            OcrStatus {
                available: false,
                message: format!(
                    "文字認識のモデルが見つかりません（{}: {}）",
                    dir.display(),
                    missing.join("・")
                ),
            }
        }
    })
}

pub fn available() -> bool {
    status().available
}

// 文字認識の結果を含む版
pub fn index_version(version: i64) -> i64 {
    version ^ VERSION_SALT
}

pub fn is_image(ext: &str) -> bool {
    IMAGE_EXTENSIONS.contains(&ext)
}

// 取り込み中のファイル（index が設定する）と、その中の進み具合（PDF・Office が設定する）
pub fn begin_file(path: &str) {
    *PROGRESS.write().unwrap() = Some(OcrProgress {
        path: path.to_string(),
        done: 0,
        total: 0,
        unit: "",
    });
}

pub fn report(done: usize, total: usize, unit: &'static str) {
    if let Some(progress) = PROGRESS.write().unwrap().as_mut() {
        progress.done = done;
        progress.total = total;
        progress.unit = unit;
    }
}

pub fn end_file() {
    *PROGRESS.write().unwrap() = None;
}

// 文字認識している途中なら、その様子（まだ何も読んでいなければ None）
pub fn progress() -> Option<OcrProgress> {
    PROGRESS
        .read()
        .unwrap()
        .clone()
        .filter(|progress| progress.total > 0)
}

// 1 回の取り込みの間だけ使う文字認識。モデルは最初に使うときに読み込み、取り込みが終わったら捨てる（メモリを返す）
#[derive(Default)]
pub struct Engine {
    ocr: Option<OAROCR>,
    // 読み込みに失敗したら、その回はもう試さない
    failed: Option<String>,
}

impl Engine {
    pub fn new() -> Self {
        Self::default()
    }

    fn get(&mut self) -> Result<&OAROCR, String> {
        if let Some(message) = &self.failed {
            return Err(message.clone());
        }
        if self.ocr.is_none() {
            match build(models_dir()) {
                Ok(ocr) => self.ocr = Some(ocr),
                Err(message) => {
                    eprintln!("ocr: {message}");
                    self.failed = Some(message.clone());
                    return Err(message);
                }
            }
        }
        Ok(self.ocr.as_ref().unwrap())
    }

    // モデルを読み込めなかった（この回はもう文字認識しない）
    pub fn broken(&self) -> bool {
        self.failed.is_some()
    }

    // 画像の文字を読み、texts に足す。1 枚読めなかっただけなら飛ばして続ける（モデルを読み込めないときだけ Err）
    pub fn recognize_into(
        &mut self,
        image: DynamicImage,
        texts: &mut Vec<String>,
    ) -> Result<(), String> {
        match self.recognize(image) {
            Ok(text) => {
                texts.push(text);
                Ok(())
            }
            Err(message) if self.broken() => Err(message),
            Err(message) => {
                eprintln!("ocr: {message}");
                Ok(())
            }
        }
    }

    // 画像の文字を読む。行ごとに改行でつなぐ
    pub fn recognize(&mut self, image: DynamicImage) -> Result<String, String> {
        let Some(image) = prepare(image) else {
            return Ok(String::new());
        };
        let ocr = self.get()?;
        let results = ocr.predict(vec![image]).map_err(|e| e.to_string())?;
        let mut lines = Vec::new();
        for result in &results {
            for region in &result.text_regions {
                if let Some((text, confidence)) = region.text_with_confidence()
                    && confidence >= MIN_CONFIDENCE
                    && !text.trim().is_empty()
                {
                    lines.push(fix_katakana_lookalikes(text));
                }
            }
        }
        Ok(lines.join("\n"))
    }

    // 画像ファイルの文字を読む。読めない画像・大きすぎる画像は空にする
    pub fn recognize_file(&mut self, path: &Path) -> Result<String, String> {
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        match decode(&bytes) {
            Some(image) => self.recognize(image),
            None => Ok(String::new()),
        }
    }

    // 画像のデータ（Office の中の画像など）の文字を読む。読めない形式・大きすぎる画像は飛ばす
    pub fn recognize_bytes_into(
        &mut self,
        bytes: &[u8],
        texts: &mut Vec<String>,
    ) -> Result<(), String> {
        match decode(bytes) {
            Some(image) => self.recognize_into(image, texts),
            None => Ok(()),
        }
    }
}

// 文字認識は、カタカナと形の似た漢字（力・口・工・二・八・卜・夕）を取り違えることがある（例:「オカピ」を「オ力ピ」）。
// 前後がカタカナのとき、または次が長音の「ー」のとき（「ー」は漢字の後には来ない）はカタカナに直す。「協力」などはそのまま
fn fix_katakana_lookalikes(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    for (i, &c) in chars.iter().enumerate() {
        let katakana = match c {
            '力' => 'カ',
            '口' => 'ロ',
            '工' => 'エ',
            '二' => 'ニ',
            '八' => 'ハ',
            '卜' => 'ト',
            '夕' => 'タ',
            _ => {
                out.push(c);
                continue;
            }
        };
        let prev = i.checked_sub(1).map(|p| chars[p]);
        let next = chars.get(i + 1).copied();
        let fix =
            next == Some('ー') || (prev.is_some_and(is_katakana) && next.is_some_and(is_katakana));
        out.push(if fix { katakana } else { c });
    }
    out
}

fn is_katakana(c: char) -> bool {
    ('\u{30A1}'..='\u{30FA}').contains(&c) || c == 'ー'
}

// PC の大きさに応じて使うコアを絞る（裏で動くので、作業中の PC・ほかの利用者を重くしないように）。
// 論理コアの 3 分の 1（1〜4）。8 コアなら 2
fn threads() -> usize {
    let logical = std::thread::available_parallelism().map_or(1, |n| n.get());
    (logical / 3).clamp(1, 4)
}

fn build(dir: &Path) -> Result<OAROCR, String> {
    OAROCRBuilder::new(
        dir.join(DETECTION_MODEL),
        dir.join(RECOGNITION_MODEL),
        dir.join(CHARACTER_DICT),
    )
    // PaddleOCR が PP-OCRv6 に公開している検出の設定（oar-ocr の pp_ocrv6 と同じ値）
    .text_detection_config(TextDetectionConfig {
        score_threshold: 0.2,
        box_threshold: 0.45,
        unclip_ratio: 1.4,
        max_candidates: 3000,
        ..TextDetectionConfig::default()
    })
    .ort_session(
        OrtSessionConfig::new()
            .with_intra_threads(threads())
            .with_inter_threads(1),
    )
    .build()
    .map_err(|e| format!("文字認識のモデルを読み込めません: {e}"))
}

// 大きさを確かめてから画像を読む（大きすぎる画像でメモリを使い切らないように）
fn decode(bytes: &[u8]) -> Option<DynamicImage> {
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?;
    let (width, height) = reader.into_dimensions().ok()?;
    if u64::from(width) * u64::from(height) > MAX_PIXELS {
        return None;
    }
    image::load_from_memory(bytes).ok()
}

// 小さすぎる画像は読まない。透明な部分は白にし（黒い文字が背景の黒に埋もれないように）、大きすぎれば縮める
fn prepare(image: DynamicImage) -> Option<RgbImage> {
    let (width, height) = (image.width(), image.height());
    if width < MIN_WIDTH || height < MIN_HEIGHT {
        return None;
    }
    let image = if image.color().has_alpha() {
        let rgba = image.to_rgba8();
        let mut rgb = RgbImage::new(width, height);
        for (out, px) in rgb.pixels_mut().zip(rgba.pixels()) {
            let alpha = u32::from(px[3]);
            for c in 0..3 {
                out[c] = ((u32::from(px[c]) * alpha + 255 * (255 - alpha)) / 255) as u8;
            }
        }
        DynamicImage::ImageRgb8(rgb)
    } else {
        image
    };
    let image = if width.max(height) > MAX_SIDE {
        image.resize(MAX_SIDE, MAX_SIDE, FilterType::Triangle)
    } else {
        image
    };
    Some(image.to_rgb8())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prepare_skips_tiny_images_and_whitens_transparency() {
        assert!(prepare(DynamicImage::new_rgb8(10, 10)).is_none());
        // 透明な黒は白になる
        let image = prepare(DynamicImage::new_rgba8(100, 40)).unwrap();
        assert_eq!(image.get_pixel(0, 0).0, [255, 255, 255]);
        // 大きい画像は縮める
        let image = prepare(DynamicImage::new_rgb8(8000, 1000)).unwrap();
        assert_eq!(image.width(), MAX_SIDE);
    }

    // モデル（back/models）があるときだけ、実際に日本語の画像を読む
    #[test]
    fn recognizes_japanese_image() {
        if !available() {
            eprintln!("文字認識のモデルが無いので飛ばす");
            return;
        }
        let mut engine = Engine::new();
        let text = engine
            .recognize_file(Path::new("src/search/testdata/ocr_test.png"))
            .unwrap();
        assert_eq!(text.trim(), "ペンギン計画の見積書");
    }

    #[test]
    fn katakana_lookalikes_are_fixed_only_between_katakana() {
        assert_eq!(fix_katakana_lookalikes("オ力ピ連携"), "オカピ連携");
        assert_eq!(
            fix_katakana_lookalikes("力ードを口ーマで"),
            "カードをローマで"
        );
        assert_eq!(fix_katakana_lookalikes("サ工ラ二ュー"), "サエラニュー");
        // 漢字として正しいものは変えない
        assert_eq!(
            fix_katakana_lookalikes("協力会社の入口と工事"),
            "協力会社の入口と工事"
        );
        assert_eq!(fix_katakana_lookalikes("データ一覧"), "データ一覧");
        assert_eq!(fix_katakana_lookalikes("二八"), "二八");
    }

    #[test]
    fn decode_rejects_broken_data() {
        assert!(decode(b"not an image").is_none());
    }

    #[test]
    fn threads_are_limited() {
        assert!((1..=4).contains(&threads()));
    }
}
