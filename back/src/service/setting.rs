use crate::{
    api::setting::response::{DocsRootResponse, SettingResponse},
    config::app::AppMode,
    repository::setting as setting_repository,
    service::docs,
};
use rusqlite::Connection;

pub fn update_display_name(
    conn: &Connection,
    user_id: &str,
    display_name: &str,
) -> rusqlite::Result<SettingResponse> {
    let result = setting_repository::update_display_name(conn, user_id, display_name)?;
    if result == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(SettingResponse {})
}

pub enum DocsRootError {
    // 共有モードでは設定できない
    Forbidden,
    // 存在しない、またはフォルダではない
    Invalid(String),
    Db(rusqlite::Error),
}

pub fn get_docs_root(
    conn: &Connection,
    user_id: &str,
    default_root: &str,
) -> rusqlite::Result<DocsRootResponse> {
    Ok(DocsRootResponse {
        docs_root: setting_repository::find_docs_root(conn, user_id)?,
        default_root: docs::absolute_default_root(default_root),
    })
}

// 空文字なら解除する。それ以外は存在するフォルダかを確かめ、絶対パスで保存する
pub fn update_docs_root(
    conn: &Connection,
    mode: &AppMode,
    user_id: &str,
    docs_root: &str,
    default_root: &str,
) -> Result<DocsRootResponse, DocsRootError> {
    if !mode.is_local() {
        return Err(DocsRootError::Forbidden);
    }
    let docs_root = docs_root.trim();
    let saved = if docs_root.is_empty() {
        String::new()
    } else {
        docs::canonical_dir(docs_root)
            .map_err(|_| DocsRootError::Invalid(docs_root.to_string()))?
            .to_string_lossy()
            .to_string()
    };
    setting_repository::upsert_docs_root(conn, user_id, &saved).map_err(DocsRootError::Db)?;
    Ok(DocsRootResponse {
        docs_root: saved,
        default_root: docs::absolute_default_root(default_root),
    })
}
