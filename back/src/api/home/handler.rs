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

// ノード一覧を取得
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
