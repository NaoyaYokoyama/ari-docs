use super::{request::*, response::*};
use crate::api::history::SavedResponse;
use crate::{
    api::error::ApiError,
    api::response::ApiResponse,
    config::app_state::AppState,
    database::connection,
    service::{auth, wiki},
};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use validator::Validate;

pub async fn get_wikis(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<WikiResponse>, StatusCode> {
    let conn = connection::connect();

    auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = wiki::get_wikis(&conn).map_err(|e| {
        eprintln!("get_wikis error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(response))
}

pub async fn get_wiki(
    Path(wiki_id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Wiki>, StatusCode> {
    let conn = connection::connect();

    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = wiki::get_wiki(&conn, &user.user_id, &wiki_id).map_err(|e| {
        eprintln!("get_wiki error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(response))
}

pub async fn create_wiki(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateWikiRequest>,
) -> Result<Json<Wiki>, ApiError> {
    println!("created start");

    request.validate()?;
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = wiki::create_wiki(&conn, &user.user_id, &request.title).map_err(|e| {
        eprintln!("create_wiki error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(response))
}

pub async fn delete_wiki(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<WikiQuery>,
) -> Result<Json<ApiResponse<()>>, StatusCode> {
    let conn = connection::connect();
    auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    wiki::delete_wiki(&conn, &request.wiki_id).map_err(|e| {
        eprintln!("delete_wiki error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let response = ApiResponse {
        message: Some("Wikiを削除しました。".to_string()),
        data: None,
    };

    Ok(Json(response))
}

pub async fn update_wiki(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UpdateWikiRequest>,
) -> Result<Json<ApiResponse<SavedResponse>>, ApiError> {
    request.validate()?;
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let updated_at = wiki::update_wiki(
        &conn,
        &user.user_id,
        &request.wiki_id,
        &request.title,
        &request.content,
        request.base_updated_at.as_deref(),
        request.force,
    )?;

    let response = ApiResponse {
        message: Some("Wikiを更新しました。".to_string()),
        data: Some(SavedResponse { updated_at }),
    };

    Ok(Json(response))
}
