use serde::{Deserialize, Serialize};

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};

use crate::{
    database::connection,
    model::app_state::AppState,
    service::{auth, note},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteQuery {
    pub note_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteResponse {
    pub notes: Vec<Note>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub note_id: i64,
    pub title: String,
    pub updated_at: String,
}

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
