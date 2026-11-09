use serde::Deserialize;

#[derive(Deserialize)]
pub struct DocsQuery {
    // 表示するフォルダ。省略時はリポジトリの docs/
    pub root: Option<String>,
}

#[derive(Deserialize)]
pub struct DocQuery {
    pub root: Option<String>,
    // root からの相対パス
    pub path: String,
}
