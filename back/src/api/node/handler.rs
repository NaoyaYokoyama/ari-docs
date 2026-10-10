use super::{request::*, response::*};
use crate::{
    database::connection,
    service::{auth, node},
};
use axum::{
    Json,
    extract::{Multipart, Query, State},
    http::{HeaderMap, StatusCode},
};

use crate::config::app_state::AppState;

use std::path::Path;

// ノード一覧を取得
pub async fn get_nodes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<NodeQuery>,
) -> Result<Json<NodeResponse>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = node::get_nodes(&conn, &user.user_id, &query.path).map_err(|e| {
        eprintln!("get_nodes error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(response))
}

// ノードの作成
pub async fn create_node(Json(request): Json<CreateNodeRequest>) -> StatusCode {
    node::create_node(&request.parent_path, &request.node_type, &request.name);
    StatusCode::CREATED
}

// ノードの削除
pub async fn delete_node(Json(request): Json<CreateNodeRequest>) -> StatusCode {
    match node::delete_node(&request.parent_path, &request.node_type, &request.name) {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(e) => {
            eprintln!("delete_node error: {:?}", e);
            if e.kind() == std::io::ErrorKind::InvalidInput {
                StatusCode::BAD_REQUEST
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        }
    }
}

// ファイルを開く
pub async fn open_node(
    State(state): State<AppState>,
    Json(request): Json<OpenNodeRequest>,
) -> Result<StatusCode, StatusCode> {
    const ROOT_PATH: &str = "../folder";

    if state.config.mode.is_local() {
        let file_path = Path::new(ROOT_PATH).join(&request.path);

        open::that(file_path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    } else {
        // TODO 共有モード
        println!("共有予定");
    }
    Ok(StatusCode::OK)
}

pub async fn upload_node(mut multipart: Multipart) -> Result<StatusCode, StatusCode> {
    const ROOT_PATH: &str = "../folder";

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
        println!("{}", "errorTODO1");
        return Err(StatusCode::BAD_REQUEST);
    }

    for ((_, data), relative_path) in files.into_iter().zip(paths) {
        let file_path = Path::new(ROOT_PATH).join(&parent_path).join(&relative_path);

        if let Some(parent) = file_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }

        tokio::fs::write(&file_path, data)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        println!("uploaded = {:?}", file_path);
    }

    Ok(StatusCode::OK)
}
