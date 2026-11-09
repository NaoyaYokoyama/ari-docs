use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use serde::Serialize;

use crate::{
    api::error::ApiError,
    config::app_state::AppState,
    database::connection,
    repository::{history as history_repo, note as note_repo, wiki as wiki_repo},
    service::auth,
};

// Note・Wiki の変更履歴（FN0402）

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedResponse {
    // 保存したあとの更新日時（次の保存で食い違いを確かめるのに使う）
    pub updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub history_id: i64,
    pub title: String,
    pub updated_by: String,
    pub saved_at: String,
    // 本文の文字数
    pub length: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryVersion {
    pub history_id: i64,
    pub title: String,
    pub content: String,
    pub updated_by: String,
    pub saved_at: String,
}

fn db_error(e: rusqlite::Error) -> ApiError {
    eprintln!("history error: {:?}", e);
    StatusCode::INTERNAL_SERVER_ERROR.into()
}

fn not_found() -> ApiError {
    ApiError::new(StatusCode::NOT_FOUND, "履歴が見つかりません")
}

// Note は本人のものだけ、Wiki は誰でも見られる
fn can_read(conn: &rusqlite::Connection, kind: &str, content_id: &str, user_id: &str) -> bool {
    match kind {
        "note" => note_repo::find_by_note_id(conn, user_id, content_id).is_ok(),
        "wiki" => wiki_repo::find_by_wiki_id(conn, content_id).is_ok(),
        _ => false,
    }
}

fn list(
    state: &AppState,
    headers: &HeaderMap,
    kind: &str,
    content_id: &str,
) -> Result<Json<Vec<HistoryItem>>, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, state, headers).ok_or(StatusCode::UNAUTHORIZED)?;
    if !can_read(&conn, kind, content_id, &user.user_id) {
        return Err(not_found());
    }
    let items = history_repo::find_by_content(&conn, kind, content_id)
        .map_err(db_error)?
        .into_iter()
        .map(|item| HistoryItem {
            history_id: item.history_id,
            length: item.content.chars().count(),
            title: item.title,
            updated_by: item.updated_by,
            saved_at: item.saved_at,
        })
        .collect();
    Ok(Json(items))
}

pub async fn get_note_history(
    Path(note_id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<HistoryItem>>, ApiError> {
    list(&state, &headers, "note", &note_id)
}

pub async fn get_wiki_history(
    Path(wiki_id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<HistoryItem>>, ApiError> {
    list(&state, &headers, "wiki", &wiki_id)
}

// 1 つの版の中身（画面は、これを編集中の内容として読み込み、保存すると戻る）
pub async fn get_version(
    Path(history_id): Path<i64>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<HistoryVersion>, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let item = history_repo::find_by_id(&conn, history_id)
        .map_err(db_error)?
        .ok_or_else(not_found)?;
    if !can_read(&conn, &item.kind, &item.content_id, &user.user_id) {
        return Err(not_found());
    }
    Ok(Json(HistoryVersion {
        history_id: item.history_id,
        title: item.title,
        content: item.content,
        updated_by: item.updated_by,
        saved_at: item.saved_at,
    }))
}
