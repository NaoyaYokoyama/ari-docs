use serde::Deserialize;
use validator::Validate;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDisplayNameRequest {
    pub display_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDocsRootRequest {
    pub docs_root: String,
}

#[derive(Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePasswordRequest {
    pub current_password: String,
    #[validate(custom(function = "crate::api::user::request::validate_password"))]
    pub new_password: String,
    pub new_password_confirm: String,
}

// ログイン中の端末をログアウトさせる。others が true なら今の端末以外すべて（FN0101-BR15）
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogoutSessionRequest {
    #[serde(default)]
    pub key: Option<i64>,
    #[serde(default)]
    pub others: bool,
}
