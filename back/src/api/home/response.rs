use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchItem {
    pub view_type: String,
    // Note・Wiki はタイトル、ノードは folder/ からの相対パス
    pub name: String,
    pub node_id: String,
    pub note_id: String,
    pub wiki_id: String,
    // ノードの種類（folder / file）。Note・Wiki は空文字
    pub node_type: String,
    // ノードの一致した場所。name（ファイル名・パス）/ content（ファイルの中身。FN0202）。Note・Wiki は空文字
    pub match_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub search_items: Vec<SearchItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteListResponse {
    pub favorite_list: Vec<FavoriteItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteItem {
    pub favorite_id: String,
    pub name: String,
    pub node_id: String,
    pub note_id: String,
    pub wiki_id: String,
}

// 最近更新されたもの（FN0201-BR07）
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentResponse {
    pub wikis: Vec<RecentContent>,
    pub notes: Vec<RecentContent>,
    pub files: Vec<RecentFile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentContent {
    pub id: String,
    pub title: String,
    // UTC の "YYYY-MM-DD HH:MM:SS"
    pub updated_at: String,
    // 最後に更新した人の表示名（Note は空文字）
    pub updated_by: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    // folder/ からの相対パス
    pub path: String,
    // ファイルの更新日時（"YYYY/MM/DD HH:MM"、サーバーの現地時刻）
    pub updated_at: String,
}

// 探して開く（FN0003）
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickOpenResponse {
    pub items: Vec<QuickOpenItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickOpenItem {
    // note / wiki / folder / file
    pub kind: String,
    // note_id / wiki_id / node_id
    pub id: String,
    // タイトル・ファイル名
    pub name: String,
    // 入っているところ。Note・Wiki はフォルダの名前を "/" でつないだもの、ノードは親のパス。一番上は空文字
    pub location: String,
    // ノードの folder/ からの相対パス（Note・Wiki は空文字）
    pub path: String,
    // あいまい検索の点数（高いほど打った文字に近い）
    pub score: i64,
}
