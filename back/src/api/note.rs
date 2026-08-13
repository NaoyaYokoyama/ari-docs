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
pub struct NoteQuery {
    pub noteId: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteResponse {
    pub notes: Vec<Note>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub user_id: String,
    pub title: String,
    pub contact: String,
    pub updated_at: String,
}

pub async fn get_notes(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<NoteResponse>, StatusCode> {
    let conn = connection::connect();

    let user =
        auth::get_login_user(&conn, &state.sessions, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    Ok(Json(note::get_notes(&user.user_id)))
}
