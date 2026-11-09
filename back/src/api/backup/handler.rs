use axum::{
    Json,
    body::Body,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::Response,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::{
    api::{error::ApiError, node::handler::attachment, response::ApiResponse},
    config::app_state::AppState,
    database::connection,
    model::user::User,
    repository::backup as backup_repo,
    service::{
        auth,
        backup::{self, BackupSettings},
    },
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupItem {
    pub backup_id: String,
    pub file_name: String,
    pub size: i64,
    // auto / manual / before_restore
    pub kind: String,
    pub created_by: String,
    pub created_at: String,
    // ファイルがある（移動・削除されていない）
    pub exists: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupListResponse {
    pub backups: Vec<BackupItem>,
    // バックアップ・復元の実行中
    pub busy: bool,
    // 既定の保存先（設定の dir が空のとき）
    pub default_dir: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupIdRequest {
    pub backup_id: String,
}

// バックアップは全員のデータに効くため、共有モードでは管理者だけが扱える（FN0901-BR01）
fn require_manage(state: &AppState, headers: &HeaderMap) -> Result<(Connection, User), ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, state, headers).ok_or(StatusCode::UNAUTHORIZED)?;
    if !auth::can_manage(&state.config.mode, &user) {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "バックアップは管理者だけが扱えます",
        ));
    }
    Ok((conn, user))
}

fn bad_request(message: String) -> ApiError {
    ApiError::new(StatusCode::BAD_REQUEST, message)
}

fn db_error(e: rusqlite::Error) -> ApiError {
    eprintln!("backup error: {:?}", e);
    StatusCode::INTERNAL_SERVER_ERROR.into()
}

pub async fn get_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BackupSettings>, ApiError> {
    let (conn, _) = require_manage(&state, &headers)?;
    Ok(Json(backup::settings(&conn).map_err(db_error)?))
}

pub async fn update_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BackupSettings>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, _) = require_manage(&state, &headers)?;
    backup::save_settings(&conn, &request).map_err(bad_request)?;
    Ok(Json(ApiResponse {
        message: Some("バックアップの設定を保存しました".to_string()),
        data: None,
    }))
}

pub async fn get_backups(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BackupListResponse>, ApiError> {
    let (conn, _) = require_manage(&state, &headers)?;
    let backups = backup_repo::find_all(&conn)
        .map_err(db_error)?
        .into_iter()
        .map(|item| BackupItem {
            exists: std::path::Path::new(&item.dir)
                .join(&item.file_name)
                .is_file(),
            backup_id: item.backup_id,
            file_name: item.file_name,
            size: item.size,
            kind: item.kind,
            created_by: item.created_by,
            created_at: item.created_at,
        })
        .collect();
    let default_dir = backup::backup_dir(&state.config, &BackupSettings::default())
        .to_string_lossy()
        .to_string();
    Ok(Json(BackupListResponse {
        backups,
        busy: backup::is_busy(),
        default_dir,
    }))
}

// 今すぐバックアップ（FN0901-BR03）。時間がかかるため別のスレッドで作る
pub async fn create_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (_, user) = require_manage(&state, &headers)?;
    let config = state.config.clone();
    let backup = tokio::task::spawn_blocking(move || {
        let conn = connection::connect();
        backup::create_backup(&conn, &config, "manual", "", &user.user_id)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .map_err(bad_request)?;
    Ok(Json(ApiResponse {
        message: Some(format!("バックアップを作りました（{}）", backup.file_name)),
        data: None,
    }))
}

pub async fn delete_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BackupIdRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, _) = require_manage(&state, &headers)?;
    backup::delete_backup(&conn, &request.backup_id).map_err(bad_request)?;
    Ok(Json(ApiResponse {
        message: Some("バックアップを削除しました".to_string()),
        data: None,
    }))
}

// 復元（FN0901-BR05）
pub async fn restore_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BackupIdRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (_, user) = require_manage(&state, &headers)?;
    let config = state.config.clone();
    tokio::task::spawn_blocking(move || {
        let mut conn = connection::connect();
        backup::restore_backup(&mut conn, &config, &request.backup_id, &user.user_id)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .map_err(bad_request)?;
    Ok(Json(ApiResponse {
        message: Some("バックアップから復元しました".to_string()),
        data: None,
    }))
}

// ダウンロード。大きいため、ファイルを少しずつ読んで送る
pub async fn download_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(request): Query<BackupIdRequest>,
) -> Result<Response, ApiError> {
    let (conn, _) = require_manage(&state, &headers)?;
    let (path, name) = backup::backup_file(&conn, &request.backup_id)
        .map_err(|message| ApiError::new(StatusCode::NOT_FOUND, message))?;
    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let body = Body::from_stream(tokio_util::io::ReaderStream::new(file));
    Ok(attachment(&name, "application/zip", body))
}
