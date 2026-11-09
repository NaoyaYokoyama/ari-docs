use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingResponse {}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocsRootResponse {
    // 設定した初期フォルダ（未設定なら空文字）
    pub docs_root: String,
    // 未設定のときに表示するフォルダ（リポジトリの docs/）
    pub default_root: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionItem {
    pub key: i64,
    // ログインしたときの User-Agent（画面で OS・アプリの名前に直す）
    pub client: String,
    pub created_at: String,
    pub last_used_at: String,
    // 今使っている端末
    pub current: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionListResponse {
    pub sessions: Vec<SessionItem>,
    // 最後に使ってからこの日数で切れる
    pub session_days: i64,
}
