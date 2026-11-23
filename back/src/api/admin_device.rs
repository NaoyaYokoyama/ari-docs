use std::net::SocketAddr;

use axum::{
    Json,
    extract::{ConnectInfo, State},
    http::{HeaderMap, StatusCode},
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::{
    api::{error::ApiError, response::ApiResponse},
    config::app_state::AppState,
    database::connection,
    model::user::User,
    repository::{admin_device as device_repo, user as user_repo},
    service::{
        admin_device::{self, DeviceError},
        auth,
    },
};

// 管理者の PC（FN0102-BR12。API0112〜API0115）

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminDeviceItem {
    pub device_id: String,
    pub user_id: String,
    pub display_name: String,
    pub name: String,
    pub created_at: String,
    pub last_used_at: String,
    // 今使っている PC
    pub current: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingResponse {
    pub code: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingRequest {
    pub user_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    pub code: String,
    #[serde(default)]
    pub client: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdRequest {
    pub device_id: String,
}

impl From<DeviceError> for ApiError {
    fn from(error: DeviceError) -> Self {
        match error {
            DeviceError::Invalid(message) => ApiError::new(StatusCode::BAD_REQUEST, message),
            DeviceError::Forbidden(message) => ApiError::new(StatusCode::FORBIDDEN, message),
            DeviceError::Db(e) => {
                crate::elog!("admin device error: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR.into()
            }
        }
    }
}

fn db_error(e: rusqlite::Error) -> ApiError {
    crate::elog!("admin device error: {:?}", e);
    StatusCode::INTERNAL_SERVER_ERROR.into()
}

// 共有モードで、登録した PC から使っている管理者だけ
fn require_admin(state: &AppState, headers: &HeaderMap) -> Result<(Connection, User), ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, state, headers).ok_or(StatusCode::UNAUTHORIZED)?;
    if state.config.mode.is_local() || !auth::is_admin(&user) {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "管理者の PC の管理は、登録した PC の管理者だけができます",
        ));
    }
    Ok((conn, user))
}

pub async fn get_devices(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<AdminDeviceItem>>, ApiError> {
    let (conn, _) = require_admin(&state, &headers)?;
    let current = admin_device::current_hash(&headers).unwrap_or_default();
    let devices = device_repo::find_all(&conn)
        .map_err(db_error)?
        .into_iter()
        .map(|device| AdminDeviceItem {
            current: device.key_hash == current,
            device_id: device.device_id,
            user_id: device.user_id,
            display_name: device.display_name,
            name: device.name,
            created_at: device.created_at,
            last_used_at: device.last_used_at,
        })
        .collect();
    Ok(Json(devices))
}

// ほかの PC を登録するコードを発行する（10 分。相手は自分か、ほかの管理者）
pub async fn create_pairing(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<PairingRequest>,
) -> Result<Json<PairingResponse>, ApiError> {
    let (conn, _) = require_admin(&state, &headers)?;
    let target = user_repo::find_by_user_id(&conn, &request.user_id)
        .map_err(|_| ApiError::new(StatusCode::NOT_FOUND, "ユーザーが見つかりません"))?;
    if !auth::is_admin(&target) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "管理者の PC は管理者だけが登録できます",
        ));
    }
    Ok(Json(PairingResponse {
        code: admin_device::issue_pairing(&target.user_id),
    }))
}

// この PC を管理者の PC にする。ログインした管理者が、発行したコードか登録用のコードを入れる
pub async fn register_device(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(request): Json<RegisterRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    if state.config.mode.is_local() || !(auth::is_admin(&user) || user.admin_elsewhere) {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "管理者だけが登録できます",
        ));
    }
    let client = request.client.trim();
    admin_device::register_with_code(
        &conn,
        &state.config,
        &user.user_id,
        &headers,
        &addr,
        &request.code,
        if client.is_empty() { "PC" } else { client },
    )?;
    Ok(Json(ApiResponse {
        message: Some("この PC を管理者の PC にしました".to_string()),
        data: None,
    }))
}

pub async fn delete_device(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<DeviceIdRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, _) = require_admin(&state, &headers)?;
    if device_repo::delete(&conn, &request.device_id).map_err(db_error)? == 0 {
        return Err(ApiError::new(StatusCode::NOT_FOUND, "PC が見つかりません"));
    }
    Ok(Json(ApiResponse {
        message: Some("管理者の PC から外しました".to_string()),
        data: None,
    }))
}
