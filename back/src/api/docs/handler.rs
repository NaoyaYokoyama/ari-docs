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
    http::{
        HeaderMap, StatusCode,
        header::{CACHE_CONTROL, CONTENT_SECURITY_POLICY, CONTENT_TYPE, X_CONTENT_TYPE_OPTIONS},
    },
    response::{IntoResponse, Response},
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
        crate::elog!("get_docs error: {:?}", e);
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
        crate::elog!("get_doc error: {:?}", e);
        to_status(&e)
    })?;

    Ok(Json(response))
}

// 本文の画像（FN0801-BR16）。path は指定フォルダからの相対パス
pub async fn get_doc_image(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DocQuery>,
) -> Result<Response, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    require_enabled(&conn)?;
    let saved_root = find_saved_root(&conn, &user.user_id)?;

    let (bytes, mime) = docs::get_doc_image(
        &state.config.mode,
        query.root.as_deref(),
        &saved_root,
        &state.config.docs_default_root,
        &query.path,
    )
    .map_err(|e| to_status(&e))?;
    // 共有モードでは、サーバーの設定の画質・大きさに縮めて送る（通信を軽くする。元のファイルは変えない。FN0902-BR09）
    let settings = server_settings::get(&conn);
    let (bytes, mime) = if !state.config.mode.is_local() && settings.image_compress {
        tokio::task::spawn_blocking(move || {
            crate::service::image_compress::shrink(
                &bytes,
                mime,
                settings.image_quality,
                settings.image_max_side,
            )
            .unwrap_or((bytes, mime))
        })
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    } else {
        (bytes, mime)
    };

    // SVG の中のスクリプトを動かさない（画面は img で出すが、直接開かれたときのため）
    Ok((
        [
            (CONTENT_TYPE, mime),
            (X_CONTENT_TYPE_OPTIONS, "nosniff"),
            (
                CONTENT_SECURITY_POLICY,
                "sandbox; default-src 'none'; style-src 'unsafe-inline'",
            ),
            (CACHE_CONTROL, "private, no-cache"),
        ],
        bytes,
    )
        .into_response())
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
        crate::elog!("find_docs_root error: {:?}", e);
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
