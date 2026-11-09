use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};

use crate::{
    config::app_state::AppState,
    database::connection,
    service::{auth, folder},
};

pub async fn get_folders(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<crate::model::folder::Folder>>, StatusCode> {
    let conn = connection::connect();
    auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let folders = folder::get_folders(&state.config.folder_root).map_err(|e| {
        eprintln!("get_folders error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(folders))
}
