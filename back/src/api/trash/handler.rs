use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::{
    api::{error::ApiError, response::ApiResponse},
    config::app_state::AppState,
    database::connection,
    model::user::User,
    repository::trash as trash_repo,
    service::{auth, backup, trash},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItemResponse {
    pub trash_id: String,
    // 元の場所（folder/ からの相対パス）
    pub original_path: String,
    pub name: String,
    pub node_type: String,
    pub size: i64,
    pub deleted_by: String,
    pub deleted_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashResponse {
    pub items: Vec<TrashItemResponse>,
    // 完全に削除・空にできる（ローカルモード、または共有モードの管理者。FN0302-BR04）
    pub can_delete: bool,
    // 自動で消すまでの日数（FN0302-BR05）
    pub retention_days: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashIdsRequest {
    pub trash_ids: Vec<String>,
}

fn login(state: &AppState, headers: &HeaderMap) -> Result<(Connection, User), ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, state, headers).ok_or(StatusCode::UNAUTHORIZED)?;
    Ok((conn, user))
}

fn db_error(e: rusqlite::Error) -> ApiError {
    eprintln!("trash error: {:?}", e);
    StatusCode::INTERNAL_SERVER_ERROR.into()
}

fn io_error(e: std::io::Error) -> ApiError {
    match e.kind() {
        std::io::ErrorKind::NotFound => ApiError::new(StatusCode::NOT_FOUND, e.to_string()),
        std::io::ErrorKind::InvalidInput => ApiError::new(StatusCode::BAD_REQUEST, e.to_string()),
        _ => {
            eprintln!("trash error: {:?}", e);
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "ゴミ箱を操作できませんでした",
            )
        }
    }
}

fn require_manage(state: &AppState, user: &User) -> Result<(), ApiError> {
    if auth::can_manage(&state.config.mode, user) {
        Ok(())
    } else {
        Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "ゴミ箱から完全に削除できるのは管理者だけです",
        ))
    }
}

pub async fn get_trash(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<TrashResponse>, ApiError> {
    let (conn, user) = login(&state, &headers)?;
    let items = trash_repo::find_all(&conn)
        .map_err(db_error)?
        .into_iter()
        .map(|item| TrashItemResponse {
            trash_id: item.trash_id,
            original_path: item.original_path,
            name: item.name,
            node_type: item.node_type,
            size: item.size,
            deleted_by: item.deleted_by,
            deleted_at: item.deleted_at,
        })
        .collect();
    let retention_days = backup::settings(&conn)
        .map_err(db_error)?
        .trash_retention_days;
    Ok(Json(TrashResponse {
        items,
        can_delete: auth::can_manage(&state.config.mode, &user),
        retention_days,
    }))
}

// 元に戻す（FN0302-BR03）。全員ができる
pub async fn restore(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<TrashIdsRequest>,
) -> Result<Json<ApiResponse<Vec<String>>>, ApiError> {
    let (conn, _) = login(&state, &headers)?;
    let mut paths = Vec::new();
    for trash_id in &request.trash_ids {
        paths.push(trash::restore(&conn, &state.config, trash_id).map_err(io_error)?);
    }
    Ok(Json(ApiResponse {
        message: Some(format!("{} 件を元の場所に戻しました", paths.len())),
        data: Some(paths),
    }))
}

pub async fn delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<TrashIdsRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, user) = login(&state, &headers)?;
    require_manage(&state, &user)?;
    for trash_id in &request.trash_ids {
        trash::delete_permanently(&conn, &state.config, trash_id).map_err(io_error)?;
    }
    Ok(Json(ApiResponse {
        message: Some(format!(
            "{} 件を完全に削除しました",
            request.trash_ids.len()
        )),
        data: None,
    }))
}

pub async fn empty(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, user) = login(&state, &headers)?;
    require_manage(&state, &user)?;
    let count = trash::empty(&conn, &state.config).map_err(io_error)?;
    Ok(Json(ApiResponse {
        message: Some(format!("ゴミ箱を空にしました（{count} 件）")),
        data: None,
    }))
}
