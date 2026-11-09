use super::{request::*, response::*};
use crate::{
    api::response::ApiResponse,
    config::app_state::AppState,
    database::connection,
    service::{auth, favorite},
};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};

pub async fn create_favorite_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateFavoriteNodeRequest>,
) -> Result<Json<ApiResponse<FavoriteIdResponse>>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let note_id = "".to_string();
    let wiki_id = "".to_string();

    let favorite_id =
        favorite::create_favorite(&conn, &user.user_id, &request.path, &note_id, &wiki_id)
            .map_err(|e| {
                eprintln!("create_favorite_node error: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let response = ApiResponse {
        message: Some("お気に入りに登録しました。".to_string()),
        data: Some(FavoriteIdResponse { favorite_id }),
    };

    Ok(Json(response))
}

pub async fn create_favorite_note(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateFavoriteRequest>,
) -> Result<Json<ApiResponse<FavoriteIdResponse>>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let node_path = "".to_string();
    let wiki_id = "".to_string();

    let favorite_id =
        favorite::create_favorite(&conn, &user.user_id, &node_path, &request.id, &wiki_id)
            .map_err(|e| {
                eprintln!("create_favorite_note error: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let response = ApiResponse {
        message: Some("お気に入りに登録しました。".to_string()),
        data: Some(FavoriteIdResponse { favorite_id }),
    };

    Ok(Json(response))
}

pub async fn create_favorite_wiki(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateFavoriteRequest>,
) -> Result<Json<ApiResponse<FavoriteIdResponse>>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let node_path = "".to_string();
    let note_id = "".to_string();

    let favorite_id =
        favorite::create_favorite(&conn, &user.user_id, &node_path, &note_id, &request.id)
            .map_err(|e| {
                eprintln!("create_favorite_wiki error: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let response = ApiResponse {
        message: Some("お気に入りに登録しました。".to_string()),
        data: Some(FavoriteIdResponse { favorite_id }),
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
        eprintln!("delete_favorite error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let response = ApiResponse {
        message: Some("お気に入りを解除しました。".to_string()),
        data: None,
    };

    Ok(Json(response))
}
