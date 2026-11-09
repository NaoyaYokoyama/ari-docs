use serde::Serialize;

use crate::search::{
    index::RunSummary,
    ocr::{OcrProgress, OcrStatus},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryWordItem {
    pub word: String,
    // 登録したユーザーの表示名
    pub created_by: String,
    pub created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryResponse {
    pub words: Vec<DictionaryWordItem>,
    // 登録・削除できる（ローカルモード、または共有モードの管理者。FN0202-BR10）
    pub can_edit: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatusResponse {
    // 今の辞書で取り込み済みのファイル数
    pub indexed: i64,
    // 辞書が変わり、取り込み直しを待っているファイル数
    pub outdated: i64,
    // 読めなかったファイル数
    pub failed: i64,
    // 大きすぎて取り込まなかったファイル数
    pub too_large: i64,
    // 登録した単語の種類の数（同じ単語はまとめて 1 つ）
    pub keywords: i64,
    // 直近の取り込みの結果。起動してからまだ動いていなければ null
    pub last_run: Option<RunSummary>,
    // 文字認識している途中のファイルと進み具合。していなければ null
    pub ocr_progress: Option<OcrProgress>,
}

// 中身で検索できるファイルの形式（API0208。FN0202-BR02）
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatGroup {
    // 種類の名前（Excel・Word など）
    pub name: &'static str,
    pub extensions: Vec<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatsResponse {
    pub groups: Vec<FormatGroup>,
    // これを超えるファイルは取り込まない（FN0202-BR04）
    pub max_file_bytes: u64,
    // 取り出した文字のうち使う文字数（FN0202-BR04）
    pub max_chars: usize,
    // 文字認識を使えるか（モデルがあるか。FN0202-BR15）
    pub ocr: OcrStatus,
    // 文字認識する画像ファイルの拡張子（使えるときだけ中身の検索の対象になる）
    pub ocr_image_extensions: Vec<&'static str>,
}
