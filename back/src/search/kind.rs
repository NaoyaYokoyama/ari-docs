// 検索の種類の絞り込み（FN0201-BR09）。ファイルの種類は拡張子で決める（大文字・小文字は区別しない）
use std::path::Path;

use crate::search::extract;

// 画面と同じ名前（front/src/app/preferences.ts の SEARCH_TYPES）
pub const EXCEL: &str = "excel";
pub const WORD: &str = "word";
pub const POWERPOINT: &str = "powerpoint";
pub const PDF: &str = "pdf";
pub const TEXT: &str = "text";
pub const IMAGE: &str = "image";
pub const OTHER: &str = "other";
pub const FOLDER: &str = "folder";
pub const NOTE: &str = "note";
pub const WIKI: &str = "wiki";

const KINDS: &[(&str, &[&str])] = &[
    (EXCEL, &["xlsx", "xlsm", "xlsb", "xls", "ods", "csv", "tsv"]),
    (WORD, &["docx", "docm", "doc", "rtf", "odt"]),
    (POWERPOINT, &["pptx", "pptm", "ppt", "odp"]),
    (PDF, &["pdf"]),
    (
        IMAGE,
        &[
            "png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "tif", "tiff", "heic",
        ],
    ),
    (
        TEXT,
        &[
            "txt",
            "md",
            "markdown",
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
        ],
    ),
];

// ファイルの種類（どれにも当たらなければ「その他」）
pub fn file_kind(path: &str) -> &'static str {
    let ext = extract::extension(Path::new(path));
    KINDS
        .iter()
        .find(|(_, extensions)| extensions.contains(&ext.as_str()))
        .map_or(OTHER, |(kind, _)| kind)
}

// 選んだ種類。空ならすべて
pub struct Filter<'a>(pub &'a [String]);

impl Filter<'_> {
    pub fn is_all(&self) -> bool {
        self.0.is_empty()
    }

    pub fn allows(&self, kind: &str) -> bool {
        self.is_all() || self.0.iter().any(|selected| selected == kind)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_kind_by_extension() {
        assert_eq!(file_kind("a/売上.XLSX"), EXCEL);
        assert_eq!(file_kind("社員.csv"), EXCEL);
        assert_eq!(file_kind("議事録.docx"), WORD);
        assert_eq!(file_kind("古い.ppt"), POWERPOINT);
        assert_eq!(file_kind("契約書.pdf"), PDF);
        assert_eq!(file_kind("README.md"), TEXT);
        assert_eq!(file_kind("写真.JPG"), IMAGE);
        assert_eq!(file_kind("圧縮.zip"), OTHER);
        assert_eq!(file_kind("拡張子なし"), OTHER);
    }

    #[test]
    fn empty_filter_allows_all() {
        assert!(Filter(&[]).allows(PDF));
        let selected = [PDF.to_string(), NOTE.to_string()];
        let filter = Filter(&selected);
        assert!(filter.allows(PDF) && filter.allows(NOTE));
        assert!(!filter.allows(EXCEL) && !filter.allows(FOLDER));
    }
}
