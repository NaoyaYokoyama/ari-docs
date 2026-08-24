use super::{request::*, response::*};
use crate::{
    api::response::ApiResponse,
    config::app_state::AppState,
    database::connection,
    service::{auth, setting},
};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};

pub async fn update_display_name(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UpdateDisplayNameRequest>,
) -> Result<Json<ApiResponse<SettingResponse>>, StatusCode> {
    let conn = connection::connect();

    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let data =
        setting::update_display_name(&conn, &user.user_id, &request.display_name).map_err(|e| {
            eprintln!("update_display_name error: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let response = ApiResponse {
        message: Some("ユーザー名を変更しました".to_string()),
        data: Some(data),
    };

    Ok(Json(response))
}

pub async fn update_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UpdatePasswordRequest>,
) -> Result<Json<ApiResponse<SettingResponse>>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let result = setting::update_password(
        &conn,
        &user.user_id,
        &request.current_password,
        &request.new_password,
        &request.new_password_confirm,
    )
    .map_err(|e| {
        eprintln!("update_password error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let response = ApiResponse {
        message: Some("パスワードを変更しました".to_string()),
        data: Some(result),
    };

    Ok(Json(response))
}
