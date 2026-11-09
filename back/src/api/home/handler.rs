use super::{request::*, response::*};
use crate::service::{home, quick_open};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};

use crate::{config::app_state::AppState, database::connection, service::auth};

// 検索結果を取得
pub async fn search(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<HomeSearchRequest>,
) -> Result<Json<SearchResponse>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = home::search(
        &conn,
        &user.user_id,
        &request.keyword,
        &request.types,
        &state.config.folder_root,
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(response))
}

// お気に入り一覧を取得
pub async fn get_favorites(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<FavoriteListResponse>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = home::get_favorite_list(&conn, &user.user_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(response))
}

// 最近更新されたもの（FN0201-BR07）
pub async fn get_recent(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<RecentResponse>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response =
        home::get_recent(&conn, &user.user_id, &state.config.folder_root).map_err(|e| {
            eprintln!("get_recent error: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(response))
}

// 探して開く（FN0003）
pub async fn quick_open(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<QuickOpenRequest>,
) -> Result<Json<QuickOpenResponse>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = quick_open::search(
        &conn,
        &user.user_id,
        &request.keyword,
        &state.config.folder_root,
        request.show_hidden,
    )
    .map_err(|e| {
        eprintln!("quick_open error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(response))
}
