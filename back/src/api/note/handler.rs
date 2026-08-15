use super::{request::*, response::*};
use crate::{
    database::connection,
    model::app_state::AppState,
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

    let user =
        auth::get_login_user(&conn, &state.sessions, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = note::get_notes(&conn, &user.user_id).map_err(|e| {
        eprintln!("get_notes error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(response))
}

pub async fn get_note(
    Path(note_id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Note>, StatusCode> {
    let conn = connection::connect();

    let user =
        auth::get_login_user(&conn, &state.sessions, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = note::get_note(&conn, &note_id, &user.user_id).map_err(|e| {
        eprintln!("get_notes error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(response))
}
