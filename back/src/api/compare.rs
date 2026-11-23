// 比べる（API0317・API0318。docs の FN0304）。Folder の 2 つのファイル・フォルダの違いを返す
use crate::{
    api::error::ApiError,
    config::app_state::AppState,
    database::connection,
    service::{auth, compare, node},
};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareRequest {
    // folder/ からの相対パス
    pub left: String,
    pub right: String,
}

fn bad_request(message: impl Into<String>) -> ApiError {
    ApiError::new(StatusCode::BAD_REQUEST, message.into())
}

// ログインを確かめ、2 つのパスを folder/ の中の実際の場所にする（.. などは 400、無ければ 404）
fn resolve_pair(
    state: &AppState,
    headers: &HeaderMap,
    request: &CompareRequest,
    want_dir: bool,
) -> Result<(PathBuf, PathBuf), ApiError> {
    let conn = connection::connect();
    auth::get_login_user(&conn, state, headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let resolve = |path: &str| -> Result<PathBuf, ApiError> {
        let full = node::resolve(&state.config.folder_root, path)
            .map_err(|_| bad_request("パスが正しくありません"))?;
        let ok = if want_dir {
            full.is_dir()
        } else {
            full.is_file()
        };
        if !ok {
            return Err(ApiError::new(
                StatusCode::NOT_FOUND,
                format!(
                    "{}が見つかりません: {path}",
                    if want_dir {
                        "フォルダ"
                    } else {
                        "ファイル"
                    }
                ),
            ));
        }
        Ok(full)
    };
    Ok((resolve(&request.left)?, resolve(&request.right)?))
}

pub async fn compare_files(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CompareRequest>,
) -> Result<Json<compare::FileCompare>, ApiError> {
    let (left, right) = resolve_pair(&state, &headers, &request, false)?;
    let result = tokio::task::spawn_blocking(move || compare::compare_files(&left, &right))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map_err(|e| {
            crate::elog!("compare_files error: {e}");
            bad_request(format!("比べられませんでした: {e}"))
        })?;
    Ok(Json(result))
}

pub async fn compare_folders(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CompareRequest>,
) -> Result<Json<compare::FolderCompare>, ApiError> {
    let (left, right) = resolve_pair(&state, &headers, &request, true)?;
    if left.starts_with(&right) || right.starts_with(&left) {
        return Err(bad_request("フォルダとその中のフォルダは比べられません"));
    }
    let result = tokio::task::spawn_blocking(move || compare::compare_folders(&left, &right))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map_err(|e| {
            crate::elog!("compare_folders error: {e}");
            bad_request(format!("比べられませんでした: {e}"))
        })?;
    Ok(Json(result))
}
