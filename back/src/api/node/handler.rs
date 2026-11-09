use super::{request::*, response::*};
use crate::{
    api::error::ApiError,
    database::connection,
    service::{archive, auth, node, trash},
};
use axum::{
    Json,
    extract::{Multipart, Query, State},
    http::{
        HeaderMap, StatusCode,
        header::{CONTENT_DISPOSITION, CONTENT_TYPE},
    },
    response::{IntoResponse, Response},
};

use crate::config::app_state::AppState;

use std::io::ErrorKind;

// ノードの操作のエラーを、画面に出す文言付きの応答にする
fn to_api_error(e: std::io::Error) -> ApiError {
    eprintln!("node error: {:?}", e);
    match e.kind() {
        ErrorKind::InvalidInput => ApiError::new(StatusCode::BAD_REQUEST, e.to_string()),
        ErrorKind::AlreadyExists => ApiError::new(StatusCode::CONFLICT, e.to_string()),
        ErrorKind::NotFound => {
            ApiError::new(StatusCode::NOT_FOUND, "ファイル・フォルダが見つかりません")
        }
        ErrorKind::PermissionDenied => ApiError::new(
            StatusCode::FORBIDDEN,
            "ファイル・フォルダを操作する権限がありません",
        ),
        _ => ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "ファイル・フォルダを操作できませんでした",
        ),
    }
}

fn require_login(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let conn = connection::connect();
    auth::get_login_user(&conn, state, headers)
        .map(|_| ())
        .ok_or_else(|| StatusCode::UNAUTHORIZED.into())
}

// ノード一覧を取得
pub async fn get_nodes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<NodeQuery>,
) -> Result<Json<NodeResponse>, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    // ノードのルートの外は読ませない。消えたフォルダは 404
    let dir = node::resolve(&state.config.folder_root, &query.path).map_err(to_api_error)?;
    if !dir.is_dir() {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "フォルダが見つかりません",
        ));
    }

    let response = node::get_nodes(&conn, &state.config.folder_root, &user.user_id, &query.path)
        .map_err(to_api_error)?;

    Ok(Json(response))
}

// ノードの作成
pub async fn create_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateNodeRequest>,
) -> Result<StatusCode, ApiError> {
    require_login(&state, &headers)?;
    node::create_node(
        &state.config.folder_root,
        &request.parent_path,
        &request.node_type,
        &request.name,
    )
    .map_err(to_api_error)?;
    Ok(StatusCode::CREATED)
}

// ノードの削除
pub async fn delete_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateNodeRequest>,
) -> Result<StatusCode, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    // すぐに消さず、ゴミ箱へ移す（FN0302-BR01）
    trash::move_to_trash(
        &conn,
        &state.config,
        &request.parent_path,
        &request.node_type,
        &request.name,
        &user.user_id,
    )
    .map_err(to_api_error)?;
    Ok(StatusCode::NO_CONTENT)
}

// ファイルを開く
pub async fn open_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<OpenNodeRequest>,
) -> Result<StatusCode, ApiError> {
    require_login(&state, &headers)?;
    if state.config.mode.is_local() {
        let file_path =
            node::resolve(&state.config.folder_root, &request.path).map_err(to_api_error)?;
        if !file_path.exists() {
            return Err(ApiError::new(
                StatusCode::NOT_FOUND,
                "ファイルが見つかりません",
            ));
        }

        open::that(file_path).map_err(|e| {
            eprintln!("open_node error: {:?}", e);
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "ファイルを開けませんでした",
            )
        })?;
    } else {
        // サーバー上のファイルは利用者の PC の OS では開けない
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "共有サーバーのファイルはアプリから開けません",
        ));
    }
    Ok(StatusCode::OK)
}

pub async fn upload_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<StatusCode, ApiError> {
    require_login(&state, &headers)?;
    let mut parent_path = None;
    let mut files = Vec::new();
    let mut paths = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        match field.name() {
            Some("parentPath") => {
                parent_path = Some(field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?);
            }

            Some("files") => {
                let file_name = field
                    .file_name()
                    .ok_or(StatusCode::BAD_REQUEST)?
                    .to_string();

                let data = field.bytes().await.map_err(|_| StatusCode::BAD_REQUEST)?;

                files.push((file_name, data));
            }

            Some("paths") => {
                let path = field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?;

                paths.push(path);
            }

            _ => {}
        }
    }

    let parent_path = parent_path.ok_or(StatusCode::BAD_REQUEST)?;

    if files.len() != paths.len() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "アップロードの内容が正しくありません",
        ));
    }

    // 書き込む前に、すべての書き込み先がノードのルートの中かを確かめる
    let mut targets = Vec::new();
    for ((_, data), relative_path) in files.into_iter().zip(paths) {
        let file_path = node::resolve(
            &state.config.folder_root,
            &format!("{}/{}", parent_path.trim_end_matches('/'), relative_path),
        )
        .map_err(to_api_error)?;
        targets.push((file_path, data));
    }

    for (file_path, data) in targets {
        if let Some(parent) = file_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(to_api_error)?;
        }

        tokio::fs::write(&file_path, data)
            .await
            .map_err(to_api_error)?;

        println!("uploaded = {:?}", file_path);
    }

    Ok(StatusCode::OK)
}

// 名前の変更（FN0301-BR18）
pub async fn rename_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<RenameNodeRequest>,
) -> Result<StatusCode, ApiError> {
    let conn = connection::connect();
    auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    node::rename_node(
        &conn,
        &state.config.folder_root,
        &request.parent_path,
        &request.name,
        request.new_name.trim(),
    )
    .map_err(to_api_error)?;
    Ok(StatusCode::NO_CONTENT)
}

// 移動（FN0301-BR19）
pub async fn move_nodes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<TransferNodesRequest>,
) -> Result<StatusCode, ApiError> {
    let conn = connection::connect();
    auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    node::move_nodes(
        &conn,
        &state.config.folder_root,
        &request.paths,
        &request.dest_path,
    )
    .map_err(to_api_error)?;
    Ok(StatusCode::NO_CONTENT)
}

// コピー（FN0301-BR20）
pub async fn copy_nodes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<TransferNodesRequest>,
) -> Result<Json<CopyNodesResponse>, ApiError> {
    require_login(&state, &headers)?;
    let names = node::copy_nodes(
        &state.config.folder_root,
        &request.paths,
        &request.dest_path,
    )
    .map_err(to_api_error)?;
    Ok(Json(CopyNodesResponse { names }))
}

// ダウンロード（FN0301-BR21）。ファイル名は日本語でも崩れないよう RFC 5987 の形で付ける
pub async fn download_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<NodeQuery>,
) -> Result<Response, ApiError> {
    require_login(&state, &headers)?;
    let path =
        node::file_for_download(&state.config.folder_root, &query.path).map_err(to_api_error)?;
    let data = tokio::fs::read(&path).await.map_err(to_api_error)?;
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(attachment(&name, "application/octet-stream", data))
}

// エクスプローラー（Finder など）で、そのファイル・フォルダの場所を開く（ローカルモードだけ。FN0301-BR22）
pub async fn reveal_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<OpenNodeRequest>,
) -> Result<StatusCode, ApiError> {
    require_login(&state, &headers)?;
    if !state.config.mode.is_local() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "共有サーバーのファイルの場所は開けません",
        ));
    }
    let path = node::resolve(&state.config.folder_root, &request.path).map_err(to_api_error)?;
    if !path.exists() {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "ファイル・フォルダが見つかりません",
        ));
    }
    reveal(&path).map_err(|e| {
        eprintln!("reveal_node error: {:?}", e);
        ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "場所を開けませんでした")
    })?;
    Ok(StatusCode::NO_CONTENT)
}

// Windows・macOS はそのファイルを選んだ状態で開く。それ以外は入っているフォルダを開く
fn reveal(path: &std::path::Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        let mut arg = std::ffi::OsString::from("/select,");
        arg.push(path);
        std::process::Command::new("explorer").arg(arg).spawn()?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()?;
        Ok(())
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let dir = if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        };
        open::that(dir)
    }
}

// 選んだファイル・フォルダを ZIP でダウンロード（FN0301-BR27）
pub async fn download_zip(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<PathsRequest>,
) -> Result<Response, ApiError> {
    require_login(&state, &headers)?;
    let folder_root = state.config.folder_root.clone();
    let (data, name) =
        tokio::task::spawn_blocking(move || archive::zip_nodes(&folder_root, &request.paths))
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .map_err(to_api_error)?;
    Ok(attachment(&name, "application/zip", data))
}

// ダウンロードの応答（ファイル名は日本語でも崩れないよう RFC 5987 の形で付ける）
pub fn attachment(name: &str, content_type: &str, body: impl IntoResponse) -> Response {
    let disposition = format!("attachment; filename*=UTF-8''{}", percent_encode(name));
    (
        [
            (CONTENT_TYPE, content_type.to_string()),
            (CONTENT_DISPOSITION, disposition),
        ],
        body,
    )
        .into_response()
}

// URL のパーセントエンコード（英数字と - . _ ~ 以外）
fn percent_encode(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_encode_japanese_name() {
        assert_eq!(percent_encode("a b.txt"), "a%20b.txt");
        assert_eq!(
            percent_encode("議事録.xlsx"),
            "%E8%AD%B0%E4%BA%8B%E9%8C%B2.xlsx"
        );
    }
}
