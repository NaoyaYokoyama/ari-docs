use super::{request::*, response::*};
use crate::{
    api::response::ApiResponse,
    config::app_state::AppState,
    database::connection,
    service::{auth, note},
};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};

pub async fn get_notes(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<NoteResponse>, StatusCode> {
    let conn = connection::connect();

    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = note::get_notes(&conn, &user.user_id).map_err(|e| {
        eprintln!("get_notes error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(response))
}

pub async fn get_note(
    Path(note_id): Path<i64>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Note>, StatusCode> {
    let conn = connection::connect();

    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = note::get_note(&conn, &user.user_id, &note_id).map_err(|e| {
        eprintln!("get_notes error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(response))
}

pub async fn create_note(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateNoteRequest>,
) -> Result<Json<Note>, StatusCode> {
    println!("created start");
    let conn = connection::connect();

    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = note::create_note(&conn, &user.user_id, &request.title).map_err(|e| {
        eprintln!("create_notes error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(response))
}

pub async fn delete_note(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<NoteQuery>,
) -> Result<Json<ApiResponse<()>>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let result = note::delete_note(&conn, &user.user_id, &request.note_id).map_err(|e| {
        eprintln!("update_password error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let response = ApiResponse {
        message: Some("メモを削除しました。".to_string()),
        data: None,
    };

    Ok(Json(response))
}

pub async fn update_note(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UpdateNoteRequest>,
) -> Result<Json<ApiResponse<()>>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let result = note::update_note(
        &conn,
        &user.user_id,
        &request.note_id,
        &request.title,
        &request.content,
    )
    .map_err(|e| {
        eprintln!("update_password error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let response = ApiResponse {
        message: Some("メモを更新しました。".to_string()),
        data: None,
    };

    Ok(Json(response))
}
