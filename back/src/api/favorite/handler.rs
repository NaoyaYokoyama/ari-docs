use super::{request::*, response::*};
use crate::{
    api::error::ApiError,
    api::response::ApiResponse,
    config::app_state::AppState,
    database::connection,
    service::{auth, favorite},
};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use validator::Validate;

pub async fn create_favorite_wiki(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateFavoriteWikiRequest>,
) -> Result<Json<ApiResponse<()>>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let node_path = "".to_string();
    let note_id = "".to_string();

    favorite::create_favorite(&conn, &user.user_id, &node_path, &note_id, &request.wiki_id)
        .map_err(|e| {
            eprintln!("favorite_wiki_error: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let response = ApiResponse {
        message: Some("お気に入りに登録しました。".to_string()),
        data: None,
    };

    Ok(Json(response))
}

pub async fn delete_favorite(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<FavoriteIdRequest>,
) -> Result<Json<ApiResponse<()>>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    favorite::delete_favorite(&conn, &user.user_id, &request.favorite_id).map_err(|e| {
        eprintln!("update_password error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let response = ApiResponse {
        message: Some("メモを削除しました。".to_string()),
        data: None,
    };

    Ok(Json(response))
}
