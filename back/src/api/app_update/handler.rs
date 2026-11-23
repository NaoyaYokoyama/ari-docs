// デスクトップアプリの更新（docs の FN0904・API0911・API0912）。デスクトップアプリの更新の部品（Tauri の updater）が
// ログインせずに呼ぶ。配るのはアプリのファイルだけで、利用者のデータは返さない
use axum::{
    Json,
    body::Body,
    extract::{Path, State},
    http::{
        HeaderMap, StatusCode,
        header::{CONTENT_LENGTH, HOST},
    },
    response::{IntoResponse, Response},
};
use semver::Version;
use serde::Serialize;

use crate::{api::node::handler::attachment, config::app_state::AppState, service::app_update};

#[derive(Serialize)]
pub struct UpdateResponse {
    pub version: String,
    pub url: String,
    pub signature: String,
    // 変更点（Tauri の updater の notes。FN0904-BR13）
    #[serde(skip_serializing_if = "String::is_empty")]
    pub notes: String,
}

// この呼び出しを受けたサーバーの URL（ダウンロード先を、デスクトップアプリが登録した URL と同じ形で返す）
fn base_url(state: &AppState, headers: &HeaderMap) -> Option<String> {
    let host = headers.get(HOST)?.to_str().ok()?;
    let scheme = if state.config.tls_files().is_some() {
        "https"
    } else {
        "http"
    };
    Some(format!("{scheme}://{host}"))
}

// GET /api/app-update/{target}/{arch}/{current_version}
// 今の版より新しい版があれば返す。無ければ 204（FN0904-BR08・BR11）
pub async fn get_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((target, arch, current_version)): Path<(String, String, String)>,
) -> Response {
    let dir = app_update::update_dir(&state.config);
    let Some(release) = app_update::latest(&dir, &target, &arch) else {
        return StatusCode::NO_CONTENT.into_response();
    };
    if Version::parse(&current_version).is_ok_and(|current| release.version <= current) {
        return StatusCode::NO_CONTENT.into_response();
    }
    let Some(base) = base_url(&state, &headers) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    Json(UpdateResponse {
        version: release.version.to_string(),
        url: format!("{base}/api/app-update/files/{}", release.file_name),
        signature: release.signature,
        notes: release.notes,
    })
    .into_response()
}

// GET /api/app-update/files/{file_name}
pub async fn get_file(
    State(state): State<AppState>,
    Path(file_name): Path<String>,
) -> Result<Response, StatusCode> {
    let dir = app_update::update_dir(&state.config);
    let path = app_update::file_path(&dir, &file_name).ok_or(StatusCode::NOT_FOUND)?;
    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let size = file
        .metadata()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .len();
    let body = Body::from_stream(tokio_util::io::ReaderStream::new(file));
    let mut response = attachment(&file_name, "application/octet-stream", body);
    response.headers_mut().insert(CONTENT_LENGTH, size.into());
    Ok(response)
}
