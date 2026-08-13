use axum::{
    Json,
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode, header::SET_COOKIE},
    response::IntoResponse,
};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{database::connection, model::app_state::AppState, service::auth};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub user_id: String,
    pub password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub user_id: String,
    pub display_name: String,
}

pub async fn login(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let conn = connection::connect();

    let user =
        auth::login(&conn, &request.user_id, &request.password).ok_or(StatusCode::UNAUTHORIZED)?;

    // ランダムなセッションIDを生成
    let session_id = Uuid::new_v4().to_string();

    // session_id -> user_id をメモリに保存
    state
        .sessions
        .write()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .insert(session_id.clone(), user.user_id.clone());

    let cookie = format!("session_id={}; HttpOnly; SameSite=Lax; Path=/", session_id);

    let mut headers = HeaderMap::new();

    headers.insert(
        SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    );

    Ok((headers, Json(user)))
}

pub async fn get_me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<LoginResponse>, StatusCode> {
    let conn = connection::connect();
    let user =
        auth::get_login_user(&conn, &state.sessions, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    Ok(Json(LoginResponse {
        user_id: user.user_id,
        display_name: user.display_name,
    }))
}

pub async fn logout(State(state): State<AppState>, headers: HeaderMap) -> StatusCode {
    let Some(session_id) = auth::get_session_id(&headers) else {
        return StatusCode::UNAUTHORIZED;
    };

    let Ok(mut sessions) = state.sessions.write() else {
        return StatusCode::INTERNAL_SERVER_ERROR;
    };

    sessions.remove(&session_id);

    StatusCode::NO_CONTENT
}
