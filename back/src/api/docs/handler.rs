use super::{request::*, response::*};
use crate::{
    config::app_state::AppState,
    database::connection,
    repository::setting as setting_repo,
    service::{auth, docs, server_settings},
};
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
};

// 指定フォルダの Markdown 一覧を取得
pub async fn get_docs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DocsQuery>,
) -> Result<Json<DocsIndexResponse>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    require_enabled(&conn)?;
    let saved_root = find_saved_root(&conn, &user.user_id)?;

    let response = docs::get_docs(
        &state.config.mode,
        query.root.as_deref(),
        &saved_root,
        &state.config.docs_default_root,
    )
    .map_err(|e| {
        eprintln!("get_docs error: {:?}", e);
        to_status(&e)
    })?;

    Ok(Json(response))
}

// Markdown の内容を取得
pub async fn get_doc(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DocQuery>,
) -> Result<Json<DocFileResponse>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    require_enabled(&conn)?;
    let saved_root = find_saved_root(&conn, &user.user_id)?;

    let response = docs::get_doc(
        &state.config.mode,
        query.root.as_deref(),
        &saved_root,
        &state.config.docs_default_root,
        &query.path,
    )
    .map_err(|e| {
        eprintln!("get_doc error: {:?}", e);
        to_status(&e)
    })?;

    Ok(Json(response))
}

// Docs を使わない設定（サーバーの設定。既定）なら、画面から隠すだけでなく API も使わせない
fn require_enabled(conn: &rusqlite::Connection) -> Result<(), StatusCode> {
    if server_settings::get(conn).docs_enabled {
        Ok(())
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

fn find_saved_root(conn: &rusqlite::Connection, user_id: &str) -> Result<String, StatusCode> {
    setting_repo::find_docs_root(conn, user_id).map_err(|e| {
        eprintln!("find_docs_root error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })
}

fn to_status(e: &std::io::Error) -> StatusCode {
    match e.kind() {
        std::io::ErrorKind::InvalidInput => StatusCode::BAD_REQUEST,
        std::io::ErrorKind::PermissionDenied => StatusCode::FORBIDDEN,
        std::io::ErrorKind::NotFound => StatusCode::NOT_FOUND,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    }
}
