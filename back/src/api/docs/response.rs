use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocsIndexResponse {
    // 表示しているフォルダの絶対パス
    pub root: String,
    // 設定の初期フォルダが使えなかったときの説明（無ければ空文字）
    pub notice: String,
    pub docs: Vec<DocEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocEntry {
    // docs/ からの相対パス（例: 00_概要/0090_ドキュメントルール.md）
    pub path: String,
    pub name: String,
    pub has_front_matter: bool,
    // 先頭のYAML（key: value のみ。値は文字列のまま）
    pub front_matter: BTreeMap<String, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocFileResponse {
    pub path: String,
    pub content: String,
}
