use super::{request::*, response::*};
use crate::{
    api::{error::ApiError, response::ApiResponse},
    config::app_state::AppState,
    database::connection,
    model::user::User,
    service::{
        auth,
        content_folder::{self, FolderError, Kind},
    },
};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use rusqlite::Connection;
use validator::Validate;

// Note・Wiki のフォルダ（FN0403）

impl From<FolderError> for ApiError {
    fn from(error: FolderError) -> Self {
        match error {
            FolderError::Invalid(message) => ApiError::new(StatusCode::BAD_REQUEST, message),
            FolderError::NotFound => ApiError::new(
                StatusCode::NOT_FOUND,
                "フォルダが見つかりません。削除された可能性があります",
            ),
            FolderError::Conflict(message) => ApiError::new(StatusCode::CONFLICT, message),
            FolderError::Db(e) => {
                eprintln!("content folder error: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR.into()
            }
        }
    }
}

fn login(
    state: &AppState,
    headers: &HeaderMap,
    kind: &str,
) -> Result<(Connection, User, Kind), ApiError> {
    let kind = Kind::parse(kind).ok_or(StatusCode::BAD_REQUEST)?;
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, state, headers).ok_or(StatusCode::UNAUTHORIZED)?;
    Ok((conn, user, kind))
}

fn done<T>(message: &str, data: Option<T>) -> Json<ApiResponse<T>> {
    Json(ApiResponse {
        message: Some(message.to_string()),
        data,
    })
}

pub async fn get_folders(
    Path(kind): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<FoldersResponse>, ApiError> {
    let (conn, user, kind) = login(&state, &headers, &kind)?;
    let folders = content_folder::list(&conn, kind, &user.user_id)?;
    Ok(Json(FoldersResponse {
        folders: folders
            .folders
            .into_iter()
            .map(|folder| FolderItem {
                folder_id: folder.folder_id,
                parent_id: folder.parent_id,
                name: folder.name,
            })
            .collect(),
        items: folders
            .items
            .into_iter()
            .map(|(item_id, folder_id)| PlacedItem { item_id, folder_id })
            .collect(),
    }))
}

pub async fn create_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateFolderRequest>,
) -> Result<Json<ApiResponse<CreatedFolder>>, ApiError> {
    request.validate()?;
    let (conn, user, kind) = login(&state, &headers, &request.kind)?;
    let folder_id = content_folder::create(
        &conn,
        kind,
        &user.user_id,
        &request.parent_id,
        &request.name,
    )?;
    Ok(done(
        "フォルダを作成しました",
        Some(CreatedFolder { folder_id }),
    ))
}

pub async fn rename_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<RenameFolderRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    request.validate()?;
    let (conn, user, kind) = login(&state, &headers, &request.kind)?;
    content_folder::rename(
        &conn,
        kind,
        &user.user_id,
        &request.folder_id,
        &request.name,
    )?;
    Ok(done("フォルダの名前を変更しました", None))
}

pub async fn delete_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<DeleteFolderRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, user, kind) = login(&state, &headers, &request.kind)?;
    content_folder::delete(&conn, kind, &user.user_id, &request.folder_id)?;
    Ok(done("フォルダを削除しました", None))
}

pub async fn move_to_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<MoveRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, user, kind) = login(&state, &headers, &request.kind)?;
    content_folder::move_to(
        &conn,
        kind,
        &user.user_id,
        &request.folder_ids,
        &request.item_ids,
        &request.dest_id,
    )?;
    Ok(done("移動しました", None))
}
