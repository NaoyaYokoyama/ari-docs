use super::{request::*, response::*};
use crate::{
    api::{error::ApiError, response::ApiResponse},
    config::app_state::AppState,
    database::connection,
    model::user::User,
    service::{
        auth,
        user::{self, UserError},
    },
};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use rusqlite::Connection;
use validator::Validate;

impl From<UserError> for ApiError {
    fn from(error: UserError) -> Self {
        match error {
            UserError::Invalid(message) => ApiError::new(StatusCode::BAD_REQUEST, message),
            UserError::Conflict(message) => ApiError::new(StatusCode::CONFLICT, message),
            UserError::NotFound => ApiError::new(StatusCode::NOT_FOUND, "ユーザーが見つかりません"),
            UserError::Db(e) => {
                crate::elog!("user error: {:?}", e);
                ApiError::from(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
    }
}

// ユーザーの管理は、共有モードの管理者だけができる
fn require_admin(state: &AppState, headers: &HeaderMap) -> Result<(Connection, User), ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, state, headers).ok_or(StatusCode::UNAUTHORIZED)?;
    if state.config.mode.is_local() || !auth::is_admin(&user) {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "ユーザーの管理は管理者だけができます",
        ));
    }
    Ok((conn, user))
}

pub async fn get_users(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<UserItem>>, ApiError> {
    let (conn, _) = require_admin(&state, &headers)?;
    Ok(Json(user::get_users(&conn)?))
}

pub async fn create_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateUserRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, _) = require_admin(&state, &headers)?;
    request.validate()?;
    user::create_user(
        &conn,
        request.user_id.trim(),
        request.display_name.trim(),
        &request.password,
        request.is_admin,
    )?;
    Ok(Json(ApiResponse {
        message: Some("ユーザーを登録しました".to_string()),
        data: None,
    }))
}

pub async fn delete_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UserIdRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, login_user) = require_admin(&state, &headers)?;
    user::delete_user(&conn, &login_user.user_id, &request.user_id)?;
    Ok(Json(ApiResponse {
        message: Some("ユーザーを削除しました".to_string()),
        data: None,
    }))
}

// 管理者・利用者の切り替え（API0110。FN0102-BR10）
pub async fn change_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ChangeRoleRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, login_user) = require_admin(&state, &headers)?;
    user::change_role(
        &conn,
        &login_user.user_id,
        &request.user_id,
        request.is_admin,
    )?;
    Ok(Json(ApiResponse {
        message: Some(if request.is_admin {
            "管理者にしました".to_string()
        } else {
            "利用者にしました".to_string()
        }),
        data: None,
    }))
}

// 利用者に許可を付ける・外す（API0111。FN0102-BR11）
pub async fn update_permissions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<PermissionsRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, _) = require_admin(&state, &headers)?;
    user::set_permissions(&conn, &request.user_id, &request.permissions)?;
    Ok(Json(ApiResponse {
        message: Some("許可を変えました".to_string()),
        data: None,
    }))
}

pub async fn reset_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ResetPasswordRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, _) = require_admin(&state, &headers)?;
    request.validate()?;
    user::reset_password(&conn, &request.user_id, &request.password)?;
    Ok(Json(ApiResponse {
        message: Some("パスワードを再設定しました".to_string()),
        data: None,
    }))
}
