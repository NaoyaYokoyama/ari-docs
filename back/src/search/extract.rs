use std::fs;
use std::io::Read;
use std::path::Path;

use calamine::{Reader, open_workbook_auto};
use quick_xml::XmlVersion;
use quick_xml::escape::resolve_predefined_entity;
use quick_xml::events::Event;

use crate::search::ocr::{self, Engine};
use crate::search::pdf_ocr;

// ファイルの中身の文字を取り出す。対応する形式は拡張子で決める（FN0202-BR02）
pub enum Extracted {
    Text(String),
    // 対象外の形式
    Unsupported,
}

// 取り出す文字数の上限。超えた分は登録しない（巨大なログなどで DB が膨らまないように）
pub const MAX_TEXT_CHARS: usize = 5_000_000;

const TEXT_EXTENSIONS: &[&str] = &[
    "txt",
    "md",
    "markdown",
    "csv",
    "tsv",
    "log",
    "json",
    "xml",
    "html",
    "htm",
    "yml",
    "yaml",
    "toml",
    "ini",
    "cfg",
    "conf",
    "properties",
    "sql",
    "sh",
    "bat",
    "cmd",
    "ps1",
    "js",
    "jsx",
    "ts",
    "tsx",
    "py",
    "java",
    "kt",
    "c",
    "h",
    "cpp",
    "hpp",
    "cs",
    "vb",
    "go",
    "rs",
    "rb",
    "php",
    "css",
    "scss",
    "vue",
    "tex",
    "rtf",
];
const SPREADSHEET_EXTENSIONS: &[&str] = &["xlsx", "xlsm", "xlsb", "xls", "ods"];
// Office Open XML（zip の中の XML）。中の文書の場所
const DOCX_PARTS: &[&str] = &[
    "word/document.xml",
    "word/header",
    "word/footer",
    "word/footnotes.xml",
    "word/endnotes.xml",
    "word/comments.xml",
];
const PPTX_PARTS: &[&str] = &["ppt/slides/slide", "ppt/notesSlides/notesSlide"];
// Excel のセル以外の文字（FN0202-BR02）: 図形・テキストボックス・吹き出し（drawings）、コメント・メモ（comments・threadedComments）
const XLSX_EXTRA_PARTS: &[&str] = &["xl/drawings/drawing", "xl/comments", "xl/threadedComments/"];
// Office に貼り付けた画像の置き場所（文字認識する。FN0202-BR14）
const XLSX_MEDIA: &str = "xl/media/";
const DOCX_MEDIA: &str = "word/media/";
const PPTX_MEDIA: &str = "ppt/media/";
// Office の中の画像 1 枚の大きさの上限
const MAX_MEDIA_BYTES: u64 = 50 * 1024 * 1024;

pub fn extension(path: &Path) -> String {
    path.extension()
        .map(|ext| ext.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

// 中身を取り込む形式のまとまり（FN0202-BR02）。取り込むかどうかはこれで決め、設定画面の「対応するファイル」にもこのまま出す
pub const FORMAT_GROUPS: &[(&str, &[&str])] = &[
    ("Excel", &["xlsx", "xlsm", "xlsb", "xls"]),
    ("OpenDocument の表計算", &["ods"]),
    ("Word", &["docx", "docm"]),
    ("PowerPoint", &["pptx", "pptm"]),
    ("PDF", &["pdf"]),
    ("テキスト", TEXT_EXTENSIONS),
];

pub fn is_supported(path: &Path) -> bool {
    let ext = extension(path);
    FORMAT_GROUPS
        .iter()
        .any(|(_, extensions)| extensions.contains(&ext.as_str()))
        // 画像ファイルは文字認識を使えるときだけ（FN0202-BR14）
        || (ocr::is_image(&ext) && ocr::available())
}

// 文字認識の結果を含む形式（PDF・画像・貼り付けた画像のある Office）。モデルを置いたら取り込み直す。
// 時間がかかるので、取り込みではほかのファイルの後に回す
pub fn uses_ocr(path: &Path) -> bool {
    let ext = extension(path);
    ocr::available() && (ext == "pdf" || ocr::is_image(&ext) || media_dir(&ext).is_some())
}

// 貼り付けた画像を文字認識する Office の形式と、その画像の置き場所
fn media_dir(ext: &str) -> Option<&'static str> {
    match ext {
        "xlsx" | "xlsm" | "xlsb" => Some(XLSX_MEDIA),
        "docx" | "docm" => Some(DOCX_MEDIA),
        "pptx" | "pptm" => Some(PPTX_MEDIA),
        _ => None,
    }
}

// engine は文字認識（取り込みの 1 回の間だけ使う。モデルは使うときに読み込む）
pub fn extract(path: &Path, engine: &mut Engine) -> Result<Extracted, String> {
    let ext = extension(path);
    let mut text = if TEXT_EXTENSIONS.contains(&ext.as_str()) {
        let text = decode_text(&fs::read(path).map_err(|e| e.to_string())?);
        if matches!(ext.as_str(), "html" | "htm" | "xml") {
            strip_tags(&text)
        } else {
            text
        }
    } else if SPREADSHEET_EXTENSIONS.contains(&ext.as_str()) {
        let mut text = extract_spreadsheet(path)?;
        if matches!(ext.as_str(), "xlsx" | "xlsm" | "xlsb") {
            // 図形・コメントが読めなくても、セルの値は使う
            if let Ok(extra) = extract_office_xml(path, XLSX_EXTRA_PARTS) {
                text.push('\n');
                text.push_str(&extra);
            }
        }
        text
    } else {
        match ext.as_str() {
            "docx" | "docm" => extract_office_xml(path, DOCX_PARTS)?,
            "pptx" | "pptm" => extract_office_xml(path, PPTX_PARTS)?,
            "pdf" => extract_pdf_with_ocr(path, engine)?,
            _ if ocr::is_image(&ext) && ocr::available() => engine.recognize_file(path)?,
            _ => return Ok(Extracted::Unsupported),
        }
    };
    if let Some(dir) = media_dir(&ext).filter(|_| ocr::available()) {
        text.push('\n');
        text.push_str(&recognize_media(path, dir, engine)?);
    }
    Ok(Extracted::Text(truncate(text)))
}

// Office に貼り付けた画像（画面の写しなど）の文字を読む。EMF・WMF など読めない形式は飛ばす
fn recognize_media(path: &Path, dir: &str, engine: &mut Engine) -> Result<String, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let Ok(mut archive) = zip::ZipArchive::new(file) else {
        return Ok(String::new());
    };
    let mut names: Vec<String> = archive
        .file_names()
        .filter_map(|name| name.ok().map(|name| name.to_string()))
        .filter(|name| name.starts_with(dir) && ocr::is_image(&extension(Path::new(name))))
        .collect();
    names.sort();
    let mut texts = Vec::new();
    for (index, name) in names.iter().enumerate() {
        ocr::report(index, names.len(), "枚");
        let Ok(entry) = archive.by_name(name) else {
            continue;
        };
        if entry.size() > MAX_MEDIA_BYTES {
            continue;
        }
        let mut bytes = Vec::new();
        if entry.take(MAX_MEDIA_BYTES).read_to_end(&mut bytes).is_err() {
            continue;
        }
        engine.recognize_bytes_into(&bytes, &mut texts)?;
    }
    Ok(texts.join("\n"))
}

fn truncate(mut text: String) -> String {
    if let Some((index, _)) = text.char_indices().nth(MAX_TEXT_CHARS) {
        text.truncate(index);
    }
    text
}

// テキストの文字コード。BOM があればそれに従い、UTF-8 として読めなければ Shift_JIS（日本の Windows で多い）とする
pub fn decode_text(bytes: &[u8]) -> String {
    if let Some((encoding, bom)) = encoding_rs::Encoding::for_bom(bytes) {
        return encoding
            .decode_without_bom_handling(&bytes[bom..])
            .0
            .into_owned();
    }
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        Err(_) => encoding_rs::SHIFT_JIS.decode(bytes).0.into_owned(),
    }
}

// HTML・XML のタグを取り除く（タグの名前や属性を単語として登録しないため）
fn strip_tags(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_tag = false;
    for c in text.chars() {
        match c {
            '<' => in_tag = true,
            '>' if in_tag => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&nbsp;", " ")
}

// Excel など。全シートのシート名とセルの値（数式は計算結果）
fn extract_spreadsheet(path: &Path) -> Result<String, String> {
    let mut workbook = open_workbook_auto(path).map_err(|e| e.to_string())?;
    let mut text = String::new();
    for name in workbook.sheet_names() {
        text.push_str(&name);
        text.push('\n');
        let Ok(range) = workbook.worksheet_range(&name) else {
            continue;
        };
        for row in range.rows() {
            for cell in row {
                let value = cell.to_string();
                if !value.is_empty() {
                    text.push_str(&value);
                    text.push('\t');
                }
            }
            text.push('\n');
            if text.len() > MAX_TEXT_CHARS * 4 {
                return Ok(text);
            }
        }
    }
    Ok(text)
}

// Word・PowerPoint（zip の中の XML）。指定した場所で始まる XML の文字を取り出し、段落ごとに改行する
fn extract_office_xml(path: &Path, parts: &[&str]) -> Result<String, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut names: Vec<String> = archive
        .file_names()
        .filter_map(|name| name.ok().map(|name| name.to_string()))
        .filter(|name| name.ends_with(".xml") && parts.iter().any(|part| name.starts_with(part)))
        .collect();
    names.sort();
    let mut text = String::new();
    for name in names {
        let mut xml = String::new();
        let Ok(mut entry) = archive.by_name(&name) else {
            continue;
        };
        if entry.read_to_string(&mut xml).is_err() {
            continue;
        }
        xml_text(&xml, &mut text);
        text.push('\n');
    }
    Ok(text)
}

fn xml_text(xml: &str, out: &mut String) {
    let mut reader = quick_xml::Reader::from_str(xml);
    loop {
        match reader.read_event() {
            Ok(Event::Text(e)) => out.push_str(&e.xml_content(XmlVersion::Implicit1_0)),
            Ok(Event::GeneralRef(e)) => {
                // &amp; などの参照
                if let Ok(Some(c)) = e.resolve_char_ref() {
                    out.push(c);
                } else if let Some(c) = resolve_predefined_entity(&e.into_inner()) {
                    out.push_str(c);
                }
            }
            // 段落（Word の w:p、PowerPoint の a:p）・セルの終わりで改行する
            Ok(Event::End(e)) if matches!(e.local_name().as_ref(), "p" | "tc") => out.push('\n'),
            // 改行・タブ
            Ok(Event::Empty(e)) if matches!(e.local_name().as_ref(), "br" | "tab") => out.push(' '),
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
}

// PDF。文字として入っている文章に、文字の無いページ（スキャンした書類など）・貼り付けた画像を文字認識した結果を足す
fn extract_pdf_with_ocr(path: &Path, engine: &mut Engine) -> Result<String, String> {
    if !ocr::available() {
        return extract_pdf(path);
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    // ページごとに取り出す（文字の少ないページを見分けるのにも使う）。失敗しても（画像だけの PDF で起きる）、文字認識は試す
    let pages = std::panic::catch_unwind(|| pdf_extract::extract_text_from_mem_by_pages(&bytes))
        .map_err(|_| "PDF を読めませんでした".to_string())
        .and_then(|result| result.map_err(|e| e.to_string()));
    let text = pages
        .as_ref()
        .map(|pages| pages.join("\n"))
        .map_err(Clone::clone);
    // 壊れた PDF で描画がパニックすることがあるため捕まえる
    let ocr = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        pdf_ocr::recognize(&bytes, pages.as_deref().ok(), engine)
    }))
    .unwrap_or_else(|_| Err("PDF を画像にできませんでした".to_string()));
    match (text, ocr) {
        (Ok(text), Ok(ocr)) => Ok(text + "\n" + &ocr),
        (Ok(text), Err(message)) => {
            eprintln!("pdf ocr: {} {message}", path.display());
            Ok(text)
        }
        (Err(_), Ok(ocr)) => Ok(ocr),
        (Err(message), Err(_)) => Err(message),
    }
}

// PDF の文字として入っている文章。壊れた PDF でパニックすることがあるため捕まえる
fn extract_pdf(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    std::panic::catch_unwind(|| pdf_extract::extract_text_from_mem(&bytes))
        .map_err(|_| "PDF を読めませんでした".to_string())?
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    // 取り出し方（extract）を持つ形式と、取り込む形式（FORMAT_GROUPS）が食い違わないこと
    #[test]
    fn format_groups_match_extractors() {
        let listed: Vec<&str> = FORMAT_GROUPS
            .iter()
            .flat_map(|(_, extensions)| extensions.iter().copied())
            .collect();
        let extractable: Vec<&str> = TEXT_EXTENSIONS
            .iter()
            .chain(SPREADSHEET_EXTENSIONS)
            .copied()
            .chain(["docx", "docm", "pptx", "pptm", "pdf"])
            .collect();
        for ext in &listed {
            assert!(extractable.contains(ext), "{ext} を取り出せない");
        }
        for ext in &extractable {
            assert!(listed.contains(ext), "{ext} が一覧に無い");
        }
    }

    #[test]
    fn decode_text_detects_encoding() {
        assert_eq!(decode_text("議事録".as_bytes()), "議事録");
        let (sjis, _, _) = encoding_rs::SHIFT_JIS.encode("議事録");
        assert_eq!(decode_text(&sjis), "議事録");
        let mut utf8_bom = vec![0xEF, 0xBB, 0xBF];
        utf8_bom.extend_from_slice("議事録".as_bytes());
        assert_eq!(decode_text(&utf8_bom), "議事録");
    }

    #[test]
    fn xml_text_splits_paragraphs() {
        let mut out = String::new();
        xml_text(
            r#"<w:document><w:body><w:p><w:r><w:t>議事録</w:t></w:r><w:r><w:t>の作成</w:t></w:r></w:p><w:p><w:r><w:t>A&amp;B</w:t></w:r></w:p></w:body></w:document>"#,
            &mut out,
        );
        assert_eq!(out, "議事録の作成\nA&B\n");
    }

    #[test]
    fn strip_tags_keeps_text() {
        assert_eq!(
            strip_tags("<p class=\"a\">議事録</p><br/>A&amp;B").trim(),
            "議事録  A&B"
        );
    }

    #[test]
    fn supported_extensions() {
        for name in [
            "a.xlsx", "a.XLS", "a.pdf", "a.docx", "a.pptx", "a.txt", "a.csv",
        ] {
            assert!(is_supported(Path::new(name)), "{name}");
        }
        // 画像（a.png）は文字認識のモデルがあるときだけなので、ここでは見ない
        for name in ["a.zip", "a.exe", "a.doc", "noext"] {
            assert!(!is_supported(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn truncate_limits_chars() {
        let text = "あ".repeat(MAX_TEXT_CHARS + 10);
        assert_eq!(truncate(text).chars().count(), MAX_TEXT_CHARS);
    }

    // Excel の図形・テキストボックス・コメント・メモと、貼り付けた画像（xl/media）
    #[test]
    fn xlsx_shapes_comments_and_media() {
        use std::io::Write;
        use zip::write::SimpleFileOptions;

        let path = std::env::temp_dir().join(format!("ari-xlsx-{}.xlsx", std::process::id()));
        let mut zip = zip::ZipWriter::new(fs::File::create(&path).unwrap());
        let parts: [(&str, &[u8]); 5] = [
            (
                "xl/drawings/drawing1.xml",
                "<xdr:wsDr><xdr:sp><xdr:txBody><a:p><a:r><a:t>図形の説明</a:t></a:r></a:p></xdr:txBody></xdr:sp></xdr:wsDr>".as_bytes(),
            ),
            (
                "xl/comments1.xml",
                "<comments><commentList><comment><text><r><t>メモの文字</t></r></text></comment></commentList></comments>".as_bytes(),
            ),
            (
                "xl/threadedComments/threadedComment1.xml",
                "<ThreadedComments><threadedComment><text>スレッドの返信</text></threadedComment></ThreadedComments>".as_bytes(),
            ),
            ("xl/worksheets/sheet1.xml", "<worksheet><t>セルの外</t></worksheet>".as_bytes()),
            ("xl/media/image1.png", include_bytes!("testdata/ocr_test.png")),
        ];
        for (name, data) in parts {
            zip.start_file(name, SimpleFileOptions::default()).unwrap();
            zip.write_all(data).unwrap();
        }
        zip.finish().unwrap();

        let text = extract_office_xml(&path, XLSX_EXTRA_PARTS).unwrap();
        for expected in ["図形の説明", "メモの文字", "スレッドの返信"] {
            assert!(text.contains(expected), "{expected} が無い: {text}");
        }
        // シートの XML は図形・コメントとしては読まない（セルは calamine で読む）
        assert!(!text.contains("セルの外"));
        if ocr::available() {
            let text = recognize_media(&path, XLSX_MEDIA, &mut Engine::new()).unwrap();
            assert!(text.contains("ペンギン計画"), "{text}");
        }
        let _ = fs::remove_file(&path);
    }
}
