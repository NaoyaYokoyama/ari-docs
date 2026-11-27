// Office のファイルのプレビュー（FN0301-BR41）。見た目どおりには描かず、文字とセルの値だけを返す（色・罫線・図・グラフは出さない）。
// 外部のソフトは使わない。大きなシートでもメモリを使いすぎないよう、行・列・文字数に上限を設け、.xlsx は先頭から読んで上限で止める
use std::fs;
use std::io::Read;
use std::path::Path;

use calamine::{Data, Reader, Sheets, open_workbook_auto};
use quick_xml::XmlVersion;
use quick_xml::escape::resolve_predefined_entity;
use quick_xml::events::Event;
use serde::Serialize;

use crate::search::extract::{extension, xml_text};
use crate::search::legacy_office;

// プレビューするファイルの大きさの上限（画面のプレビューと同じ 30 MB。FN0301-BR30）
pub const MAX_PREVIEW_BYTES: u64 = 30 * 1024 * 1024;
const MAX_ROWS: usize = 500;
const MAX_COLUMNS: usize = 50;
const MAX_CELL_CHARS: usize = 300;
const MAX_SHEETS: usize = 30;
const MAX_TEXT_CHARS: usize = 200_000;
const MAX_SLIDES: usize = 300;

const SPREADSHEETS: &[&str] = &["xlsx", "xlsm", "xlsb", "xls", "ods"];
const DOCUMENTS: &[&str] = &["docx", "docm", "doc"];
const PRESENTATIONS: &[&str] = &["pptx", "pptm", "ppt"];

#[derive(Serialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum OfficePreview {
    // Excel など。シートごとのセルの値（数式は計算結果）。行・列はシートのとおり（rows[0] が 1 行目、各行の [0] が A 列）
    #[serde(rename_all = "camelCase")]
    Sheets {
        sheets: Vec<PreviewSheet>,
        // シートが多くて後ろを出していない
        more_sheets: bool,
    },
    // Word など。段落ごとに改行した文字
    Document {
        text: String,
        truncated: bool,
    },
    // PowerPoint。スライドごとの文字
    Slides {
        slides: Vec<String>,
        truncated: bool,
    },
}

#[derive(Serialize, Debug)]
pub struct PreviewSheet {
    pub name: String,
    pub rows: Vec<Vec<String>>,
    // 行・列の上限で切った
    pub truncated: bool,
}

pub fn is_office(path: &Path) -> bool {
    let ext = extension(path);
    [SPREADSHEETS, DOCUMENTS, PRESENTATIONS]
        .iter()
        .any(|list| list.contains(&ext.as_str()))
}

pub fn preview(path: &Path) -> Result<OfficePreview, String> {
    let size = fs::metadata(path).map_err(|e| e.to_string())?.len();
    if size > MAX_PREVIEW_BYTES {
        return Err("大きすぎるためプレビューできません（30 MB まで）".into());
    }
    let ext = extension(path);
    if SPREADSHEETS.contains(&ext.as_str()) {
        return read_sheets(path);
    }
    let text = match ext.as_str() {
        "docx" | "docm" => docx_text(&read_zip_entry(path, "word/document.xml")?),
        "doc" => legacy_office::extract_doc(path)?,
        "pptx" | "pptm" => return read_slides(path),
        // 古い PowerPoint はスライドの区切りが取れないので、文章として出す
        "ppt" => legacy_office::extract_ppt(path)?,
        _ => return Err("この種類のファイルはプレビューできません".into()),
    };
    let (text, truncated) = cut(tidy(&text), MAX_TEXT_CHARS);
    Ok(OfficePreview::Document { text, truncated })
}

fn read_zip_entry(path: &Path, name: &str) -> Result<String, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("読めませんでした: {e}"))?;
    let mut entry = archive
        .by_name(name)
        .map_err(|e| format!("読めませんでした: {e}"))?;
    let mut xml = String::new();
    entry
        .read_to_string(&mut xml)
        .map_err(|e| format!("読めませんでした: {e}"))?;
    Ok(xml)
}

// Word の本文。段落ごとに改行し、表は行ごとに「セル | セル」と横に並べる（セルを 1 つずつ別の行にしない）
fn docx_text(xml: &str) -> String {
    let mut reader = quick_xml::Reader::from_str(xml);
    let mut out = String::new();
    let mut depth = 0;
    let mut cell = String::new();
    let mut row: Vec<String> = Vec::new();
    loop {
        let target = if depth > 0 { &mut cell } else { &mut out };
        match reader.read_event() {
            Ok(Event::Text(e)) => target.push_str(&e.xml_content(XmlVersion::Implicit1_0)),
            Ok(Event::GeneralRef(e)) => {
                if let Ok(Some(c)) = e.resolve_char_ref() {
                    target.push(c);
                } else if let Some(c) = resolve_predefined_entity(&e.into_inner()) {
                    target.push_str(c);
                }
            }
            Ok(Event::Start(e)) if e.local_name().as_ref() == "tbl" => {
                if depth == 0 && !out.is_empty() && !out.ends_with('\n') {
                    out.push('\n');
                }
                depth += 1;
            }
            Ok(Event::End(e)) => match e.local_name().as_ref() {
                "tbl" => depth -= 1,
                "tc" if depth > 0 => row.push(std::mem::take(&mut cell).trim().to_string()),
                "tr" if depth > 0 => {
                    out.push_str(&row.join(" | "));
                    out.push('\n');
                    row.clear();
                }
                "p" => target.push(if depth > 0 { ' ' } else { '\n' }),
                _ => {}
            },
            Ok(Event::Empty(e)) => match e.local_name().as_ref() {
                "p" if depth == 0 => out.push('\n'),
                "br" | "tab" => target.push(' '),
                _ => {}
            },
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    out
}

// セルの文字。日付は 2026-10-01（時刻があれば 2026-10-01 09:30）、時刻だけなら 09:30 と出す（Excel の中の数のままにしない）
fn data_text(value: &Data) -> String {
    match value {
        Data::DateTime(date) if date.is_datetime() => {
            let (year, month, day, hour, minute, second, _) = date.to_ymd_hms_milli();
            let time = if second > 0 {
                format!("{hour:02}:{minute:02}:{second:02}")
            } else {
                format!("{hour:02}:{minute:02}")
            };
            if date.as_f64() < 1.0 {
                time
            } else if hour == 0 && minute == 0 && second == 0 {
                format!("{year:04}-{month:02}-{day:02}")
            } else {
                format!("{year:04}-{month:02}-{day:02} {time}")
            }
        }
        _ => value.to_string(),
    }
}

// 続く空の行を 1 つにまとめ、前後の空白を除く
fn tidy(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut blank = 0;
    for line in text.lines() {
        let line = line.trim_end();
        if line.trim().is_empty() {
            blank += 1;
            if blank > 1 {
                continue;
            }
        } else {
            blank = 0;
        }
        out.push_str(line);
        out.push('\n');
    }
    out.trim().to_string()
}

fn cut(mut text: String, max: usize) -> (String, bool) {
    match text.char_indices().nth(max) {
        Some((index, _)) => {
            text.truncate(index);
            (text, true)
        }
        None => (text, false),
    }
}

fn cell_text(value: String) -> String {
    let (mut value, cut_off) = cut(value, MAX_CELL_CHARS);
    if cut_off {
        value.push('…');
    }
    value
}

// grid の row 行 column 列に value を置く（足りない行・列は空で埋める）。上限を超えたら置かずに true
fn put(grid: &mut Vec<Vec<String>>, row: usize, column: usize, value: String) -> bool {
    if row >= MAX_ROWS || column >= MAX_COLUMNS {
        return true;
    }
    if value.is_empty() {
        return false;
    }
    if grid.len() <= row {
        grid.resize(row + 1, Vec::new());
    }
    let cells = &mut grid[row];
    if cells.len() <= column {
        cells.resize(column + 1, String::new());
    }
    cells[column] = cell_text(value);
    false
}

fn read_sheets(path: &Path) -> Result<OfficePreview, String> {
    let mut workbook = open_workbook_auto(path).map_err(|e| format!("読めませんでした: {e}"))?;
    let names = workbook.sheet_names();
    let more_sheets = names.len() > MAX_SHEETS;
    let mut sheets = Vec::new();
    for name in names.into_iter().take(MAX_SHEETS) {
        let mut rows = Vec::new();
        let mut truncated = false;
        if let Sheets::Xlsx(xlsx) = &mut workbook {
            // .xlsx は先頭から順に読み、上限の行を過ぎたら止める（シート全体をメモリに読まない）
            if let Ok(mut reader) = xlsx.worksheet_cells_reader(&name) {
                while let Ok(Some(cell)) = reader.next_cell() {
                    let (row, column) = cell.get_position();
                    if row as usize >= MAX_ROWS {
                        truncated = true;
                        break;
                    }
                    let value = data_text(&Data::from(cell.get_value().clone()));
                    truncated |= put(&mut rows, row as usize, column as usize, value);
                }
            }
        } else if let Ok(range) = workbook.worksheet_range(&name) {
            let (top, left) = range.start().unwrap_or((0, 0));
            for (r, row) in range.rows().enumerate() {
                let row_index = top as usize + r;
                if row_index >= MAX_ROWS {
                    truncated = true;
                    break;
                }
                for (c, cell) in row.iter().enumerate() {
                    truncated |= put(&mut rows, row_index, left as usize + c, data_text(cell));
                }
            }
        }
        sheets.push(PreviewSheet {
            name,
            rows,
            truncated,
        });
    }
    Ok(OfficePreview::Sheets {
        sheets,
        more_sheets,
    })
}

// PowerPoint（.pptx）。ppt/slides/slide<番号>.xml を番号の順に読む（名前の順だと 1・10・2… になるため）
fn read_slides(path: &Path) -> Result<OfficePreview, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("読めませんでした: {e}"))?;
    let mut numbered: Vec<(u32, String)> = archive
        .file_names()
        .filter_map(|name| {
            let name = name.ok()?;
            let number = name
                .strip_prefix("ppt/slides/slide")?
                .strip_suffix(".xml")?
                .parse()
                .ok()?;
            Some((number, name.to_string()))
        })
        .collect();
    numbered.sort();
    let truncated = numbered.len() > MAX_SLIDES;
    let mut slides = Vec::new();
    let mut total = 0;
    for (_, name) in numbered.into_iter().take(MAX_SLIDES) {
        let mut xml = String::new();
        let Ok(mut entry) = archive.by_name(&name) else {
            continue;
        };
        if entry.read_to_string(&mut xml).is_err() {
            continue;
        }
        let mut text = String::new();
        xml_text(&xml, &mut text);
        let text = tidy(&text);
        total += text.chars().count();
        slides.push(text);
        if total > MAX_TEXT_CHARS {
            return Ok(OfficePreview::Slides {
                slides,
                truncated: true,
            });
        }
    }
    Ok(OfficePreview::Slides { slides, truncated })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("ari-docs-office-preview-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    fn zip_file(path: &Path, entries: &[(&str, &str)]) {
        let mut zip = zip::ZipWriter::new(fs::File::create(path).unwrap());
        for (name, body) in entries {
            zip.start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(body.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
    }

    #[test]
    fn slides_are_in_number_order() {
        let path = temp("a.pptx");
        let slide = |text: &str| format!("<p:sld><a:p><a:t>{text}</a:t></a:p></p:sld>");
        zip_file(
            &path,
            &[
                ("ppt/slides/slide10.xml", &slide("十")),
                ("ppt/slides/slide2.xml", &slide("二")),
                ("ppt/slides/slide1.xml", &slide("一")),
            ],
        );
        match preview(&path).unwrap() {
            OfficePreview::Slides { slides, truncated } => {
                assert_eq!(slides, ["一", "二", "十"]);
                assert!(!truncated);
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn document_paragraphs_become_lines() {
        let path = temp("a.docx");
        zip_file(
            &path,
            &[(
                "word/document.xml",
                "<w:document><w:body><w:p><w:r><w:t>一行目</w:t></w:r></w:p><w:p/><w:p/><w:p><w:r><w:t>二行目 &amp; 続き</w:t></w:r></w:p></w:body></w:document>",
            )],
        );
        match preview(&path).unwrap() {
            OfficePreview::Document { text, truncated } => {
                assert_eq!(text, "一行目\n\n二行目 & 続き");
                assert!(!truncated);
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn word_tables_are_laid_out_in_rows() {
        let xml = "<w:body><w:p><w:r><w:t>前</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>担当</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>作業</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>山田</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>見積もり</w:t></w:r></w:p><w:p><w:r><w:t>2 行目</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>後</w:t></w:r></w:p></w:body>";
        assert_eq!(
            tidy(&docx_text(xml)),
            "前\n担当 | 作業\n山田 | 見積もり 2 行目\n後"
        );
    }

    #[test]
    fn dates_are_shown_as_dates() {
        use calamine::{ExcelDateTime, ExcelDateTimeType};
        let date = |value| {
            Data::DateTime(ExcelDateTime::new(
                value,
                ExcelDateTimeType::DateTime,
                false,
            ))
        };
        assert_eq!(data_text(&date(46296.0)), "2026-10-01");
        assert_eq!(data_text(&date(46296.5)), "2026-10-01 12:00");
        assert_eq!(data_text(&date(0.375)), "09:00");
        assert_eq!(data_text(&Data::Float(1.5)), "1.5");
    }

    #[test]
    fn grid_keeps_positions_and_limits() {
        let mut grid = Vec::new();
        assert!(!put(&mut grid, 2, 1, "B3".into()));
        assert_eq!(
            grid,
            vec![vec![], vec![], vec![String::new(), "B3".to_string()]]
        );
        assert!(put(&mut grid, MAX_ROWS, 0, "x".into()));
        assert!(put(&mut grid, 0, MAX_COLUMNS, "x".into()));
        assert_eq!(
            cell_text("あ".repeat(MAX_CELL_CHARS + 5)).chars().count(),
            MAX_CELL_CHARS + 1
        );
    }
}
