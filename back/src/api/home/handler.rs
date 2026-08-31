use super::{request::*, response::*};
use crate::service::home;
use axum::{
    Json,
    extract::{Multipart, Query, State},
    http::{HeaderMap, StatusCode},
};

use crate::{
    api::response::ApiResponse,
    config::app_state::AppState,
    database::connection,
    service::{auth, note},
};

// 検索結果を取得
pub async fn search(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<HomeSearchRequest>,
) -> Result<Json<SearchResponse>, StatusCode> {
    let conn = connection::connect();

    let response =
        home::search(&conn, &request.keyword).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(response))
}

// お気に入り一覧を取得
pub async fn getFavoriteList(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<FavoriteListResponse>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = home::get_favorite_list(&conn, &user.user_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(response))
}
