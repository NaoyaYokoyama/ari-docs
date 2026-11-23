//! 古い形式の Word・PowerPoint（.doc・.ppt。Office 97〜2003 の OLE の複合ファイル）から文字を取り出す（FN0202-BR18）。
//! 外部のソフトは使わず、ファイルの中の文字だけを読む（書式・図・表の位置は分からない）。
//! Word は WordDocument の FIB からピースの表（CLX）をたどり、PowerPoint は「PowerPoint Document」のレコードの中の文字を集める
use std::io::Read;
use std::path::Path;

// 読む流れ（ストリーム）の大きさの上限。壊れたファイル・大きすぎるファイルでメモリを使いすぎないため
const MAX_STREAM_BYTES: u64 = 256 * 1024 * 1024;

fn read_stream(file: &mut cfb::CompoundFile<std::fs::File>, name: &str) -> Result<Vec<u8>, String> {
    let mut stream = file
        .open_stream(name)
        .map_err(|e| format!("{name} を開けません: {e}"))?;
    if stream.len() > MAX_STREAM_BYTES {
        return Err(format!("{name} が大きすぎます"));
    }
    let mut bytes = Vec::with_capacity(stream.len() as usize);
    stream
        .read_to_end(&mut bytes)
        .map_err(|e| format!("{name} を読めません: {e}"))?;
    Ok(bytes)
}

fn open(path: &Path) -> Result<cfb::CompoundFile<std::fs::File>, String> {
    cfb::open(path).map_err(|e| format!("Office 97〜2003 の形式として読めません: {e}"))
}

fn u16_at(bytes: &[u8], offset: usize) -> Option<u16> {
    Some(u16::from_le_bytes(
        bytes.get(offset..offset + 2)?.try_into().ok()?,
    ))
}

fn u32_at(bytes: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_le_bytes(
        bytes.get(offset..offset + 4)?.try_into().ok()?,
    ))
}

fn utf16(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();
    String::from_utf16_lossy(&units)
}

fn cp1252(bytes: &[u8]) -> String {
    encoding_rs::WINDOWS_1252.decode(bytes).0.into_owned()
}

// ---- Word（.doc）----

pub fn extract_doc(path: &Path) -> Result<String, String> {
    let mut file = open(path)?;
    let word = read_stream(&mut file, "/WordDocument")?;
    let raw = doc_text(&word, |name| read_stream(&mut file, name))?;
    Ok(clean_doc_text(&raw))
}

// FIB（文書の先頭の情報）からピースの表を読み、文字をつなげる。table は 0Table・1Table を読む関数
fn doc_text(
    word: &[u8],
    mut table: impl FnMut(&str) -> Result<Vec<u8>, String>,
) -> Result<String, String> {
    if u16_at(word, 0) != Some(0xA5EC) {
        return Err("Word 97〜2003 の文書ではありません".to_string());
    }
    let flags = u16_at(word, 0x0A).unwrap_or(0);
    if flags & 0x0100 != 0 {
        return Err("パスワードの付いた文書は読めません".to_string());
    }
    let table_name = if flags & 0x0200 != 0 {
        "/1Table"
    } else {
        "/0Table"
    };
    // FibBase（32 バイト）→ csw と FibRgW → cslw と FibRgLw → cbRgFcLcb と FibRgFcLcb
    let csw = u16_at(word, 32).ok_or("FIB が短すぎます")? as usize;
    let lw = 34 + csw * 2;
    let cslw = u16_at(word, lw).ok_or("FIB が短すぎます")? as usize;
    let fc_lcb = lw + 2 + cslw * 4 + 2;
    // fcClx・lcbClx は FibRgFcLcb97 の 34 番目（0 から数えて 33）
    let fc_clx = u32_at(word, fc_lcb + 33 * 8).ok_or("FIB が短すぎます")? as usize;
    let lcb_clx = u32_at(word, fc_lcb + 33 * 8 + 4).ok_or("FIB が短すぎます")? as usize;
    let table = table(table_name)?;
    let clx = table
        .get(fc_clx..fc_clx.saturating_add(lcb_clx))
        .ok_or("ピースの表が壊れています")?;

    // Prc（書式。読み飛ばす）の後の Pcdt がピースの表
    let mut position = 0;
    while clx.get(position) == Some(&0x01) {
        let size = u16_at(clx, position + 1).ok_or("ピースの表が壊れています")? as usize;
        position += 3 + size;
    }
    if clx.get(position) != Some(&0x02) {
        return Err("ピースの表が見つかりません".to_string());
    }
    let lcb = u32_at(clx, position + 1).ok_or("ピースの表が壊れています")? as usize;
    let plc = clx
        .get(position + 5..position + 5 + lcb)
        .ok_or("ピースの表が壊れています")?;
    if plc.len() < 4 {
        return Ok(String::new());
    }
    let count = (plc.len() - 4) / 12;
    let mut text = String::new();
    for index in 0..count {
        let start = u32_at(plc, index * 4).unwrap_or(0) as usize;
        let end = u32_at(plc, (index + 1) * 4).unwrap_or(0) as usize;
        let chars = end.saturating_sub(start);
        let pcd = (count + 1) * 4 + index * 8;
        let fc = u32_at(plc, pcd + 2).ok_or("ピースの表が壊れています")?;
        // 0x40000000 が立っていれば 1 文字 1 バイト（CP1252）で、場所は半分
        if fc & 0x4000_0000 != 0 {
            let offset = ((fc & !0x4000_0000) / 2) as usize;
            if let Some(bytes) = word.get(offset..offset.saturating_add(chars)) {
                text.push_str(&cp1252(bytes));
            }
        } else {
            let offset = fc as usize;
            if let Some(bytes) = word.get(offset..offset.saturating_add(chars * 2)) {
                text.push_str(&utf16(bytes));
            }
        }
    }
    Ok(text)
}

// Word の特別な文字を、ふつうの文字にする。フィールド（0x13 命令 0x14 結果 0x15）は結果だけを残す
fn clean_doc_text(raw: &str) -> String {
    let mut text = String::with_capacity(raw.len());
    // 入れ子のフィールドの、命令の部分の深さ
    let mut instruction = Vec::new();
    for char in raw.chars() {
        match char {
            '\u{13}' => instruction.push(true),
            '\u{14}' => {
                if let Some(last) = instruction.last_mut() {
                    *last = false;
                }
            }
            '\u{15}' => {
                instruction.pop();
            }
            _ if instruction.last() == Some(&true) => {}
            '\r' | '\u{0B}' | '\u{0C}' => text.push('\n'),
            // 表のセル・行の終わり
            '\u{07}' => text.push('\t'),
            '\t' | '\n' => text.push(char),
            _ if (char as u32) < 0x20 => {}
            _ => text.push(char),
        }
    }
    text
}

// ---- PowerPoint（.ppt）----

pub fn extract_ppt(path: &Path) -> Result<String, String> {
    let mut file = open(path)?;
    let document = read_stream(&mut file, "/PowerPoint Document")?;
    let mut parts = Vec::new();
    ppt_records(&document, 0, &mut parts);
    // 「*」はスライド番号・日付の置き場所の印
    parts.retain(|part| !matches!(part.trim(), "" | "*"));
    Ok(parts.join("\n"))
}

// 文字の入ったレコード（TextCharsAtom は UTF-16、TextBytesAtom は 1 バイトの文字）
const TEXT_CHARS_ATOM: u16 = 0x0FA0;
const TEXT_BYTES_ATOM: u16 = 0x0FA8;
// スライドのひな型（マスター）。「タイトルを入力」などの決まった文字なので読まない
const MAIN_MASTER: u16 = 0x03F8;

// レコードの並びをたどり、入れ物（recVer が 0xF）の中も見る
fn ppt_records(bytes: &[u8], depth: usize, parts: &mut Vec<String>) {
    let mut position = 0;
    while position + 8 <= bytes.len() {
        let version = u16_at(bytes, position).unwrap_or(0) & 0x000F;
        let kind = u16_at(bytes, position + 2).unwrap_or(0);
        let length = u32_at(bytes, position + 4).unwrap_or(0) as usize;
        let body_start = position + 8;
        let body_end = body_start.saturating_add(length).min(bytes.len());
        let body = &bytes[body_start..body_end];
        if version == 0x0F {
            // 壊れたファイルで深く入れ子にならないように
            if depth < 32 && kind != MAIN_MASTER {
                ppt_records(body, depth + 1, parts);
            }
        } else if kind == TEXT_CHARS_ATOM {
            parts.push(clean_ppt_text(&utf16(body)));
        } else if kind == TEXT_BYTES_ATOM {
            parts.push(clean_ppt_text(&cp1252(body)));
        }
        position = body_start.saturating_add(length);
    }
}

// 段落の区切り（\r）・行の区切り（\u{0B}）を改行にする
fn clean_ppt_text(text: &str) -> String {
    text.chars()
        .filter_map(|char| match char {
            '\r' | '\u{0B}' => Some('\n'),
            '\t' | '\n' => Some(char),
            _ if (char as u32) < 0x20 => None,
            _ => Some(char),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    // FIB とピースの表を組み立てる（1 つ目は UTF-16、2 つ目は 1 バイトの文字）
    fn word_document() -> (Vec<u8>, Vec<u8>) {
        let mut word = vec![0u8; 0x400];
        word[0..2].copy_from_slice(&0xA5ECu16.to_le_bytes());
        // 1Table を使う
        word[0x0A..0x0C].copy_from_slice(&0x0200u16.to_le_bytes());
        let csw = 14usize;
        word[32..34].copy_from_slice(&(csw as u16).to_le_bytes());
        let lw = 34 + csw * 2;
        let cslw = 22usize;
        word[lw..lw + 2].copy_from_slice(&(cslw as u16).to_le_bytes());
        let fc_lcb = lw + 2 + cslw * 4 + 2;

        // 文字: "日本\r" を UTF-16 で 0x200 に、"abc" を 1 バイトで 0x300 に
        let unicode: Vec<u8> = "日本\r".encode_utf16().flat_map(u16::to_le_bytes).collect();
        word[0x200..0x200 + unicode.len()].copy_from_slice(&unicode);
        word[0x300..0x303].copy_from_slice(b"abc");

        let mut plc = Vec::new();
        for cp in [0u32, 3, 6] {
            plc.extend_from_slice(&cp.to_le_bytes());
        }
        for fc in [0x200u32, (0x300 * 2) | 0x4000_0000] {
            plc.extend_from_slice(&[0, 0]);
            plc.extend_from_slice(&fc.to_le_bytes());
            plc.extend_from_slice(&[0, 0]);
        }
        let mut table = vec![0x01, 0x02, 0x00, 0xAA, 0xBB, 0x02];
        table.extend_from_slice(&(plc.len() as u32).to_le_bytes());
        table.extend_from_slice(&plc);
        word[fc_lcb + 33 * 8..fc_lcb + 33 * 8 + 4].copy_from_slice(&0u32.to_le_bytes());
        word[fc_lcb + 33 * 8 + 4..fc_lcb + 33 * 8 + 8]
            .copy_from_slice(&(table.len() as u32).to_le_bytes());
        (word, table)
    }

    #[test]
    fn doc_text_follows_piece_table() {
        let (word, table) = word_document();
        let raw = doc_text(&word, |name| {
            assert_eq!(name, "/1Table");
            Ok(table.clone())
        })
        .unwrap();
        assert_eq!(clean_doc_text(&raw), "日本\nabc");
    }

    #[test]
    fn doc_text_rejects_other_files() {
        assert!(doc_text(&[0u8; 64], |_| Ok(Vec::new())).is_err());
    }

    #[test]
    fn clean_doc_text_keeps_field_results() {
        let raw = "前\u{13} HYPERLINK \"x\" \u{14}リンク\u{15}後\u{07}セル\r";
        assert_eq!(clean_doc_text(raw), "前リンク後\tセル\n");
    }

    #[test]
    fn ppt_records_collect_text_in_containers() {
        let atom = |kind: u16, body: &[u8]| {
            let mut bytes = Vec::new();
            bytes.extend_from_slice(&0u16.to_le_bytes());
            bytes.extend_from_slice(&kind.to_le_bytes());
            bytes.extend_from_slice(&(body.len() as u32).to_le_bytes());
            bytes.extend_from_slice(body);
            bytes
        };
        let chars: Vec<u8> = "見出し\r本文"
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect();
        let mut inner = atom(TEXT_CHARS_ATOM, &chars);
        inner.extend(atom(TEXT_BYTES_ATOM, b"Total"));
        inner.extend(atom(0x0FBA, b"xx"));
        let mut container = Vec::new();
        container.extend_from_slice(&0x000Fu16.to_le_bytes());
        container.extend_from_slice(&0x03E8u16.to_le_bytes());
        container.extend_from_slice(&(inner.len() as u32).to_le_bytes());
        container.extend(inner);
        let mut parts = Vec::new();
        ppt_records(&container, 0, &mut parts);
        assert_eq!(parts, vec!["見出し\n本文".to_string(), "Total".to_string()]);
    }
}
