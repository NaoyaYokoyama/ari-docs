use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeSearchRequest {
    pub keyword: String,
    // 探す種類（excel・pdf・note など。search/kind.rs）。空ならすべて（FN0201-BR09）
    #[serde(default)]
    pub types: Vec<String>,
    // ファイル名・フォルダ名だけで探す（FN0201-BR10）
    #[serde(default)]
    pub name_only: bool,
    // 更新日の期間（この PC の日付 YYYY-MM-DD。両端を含む。空なら区切らない。FN0201-BR11）
    #[serde(default)]
    pub updated_from: String,
    #[serde(default)]
    pub updated_to: String,
}

// 探して開く（FN0003）
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickOpenRequest {
    pub keyword: String,
    // 隠しファイル（「.」で始まる名前）も出す（この PC の設定。FN0701）
    #[serde(default)]
    pub show_hidden: bool,
}
