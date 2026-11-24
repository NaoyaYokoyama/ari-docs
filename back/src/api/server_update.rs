// サーバーの更新（FN0904-BR14〜BR19。API0913〜API0915）。共有モードで、登録した PC から使っている管理者だけ
use axum::{
    Json,
    extract::{Multipart, Query, State},
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;

use crate::{
    api::{error::ApiError, response::ApiResponse},
    config::app_state::AppState,
    database::connection,
    service::{
        auth,
        server_update::{self, Release},
    },
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerUpdateResponse {
    pub current_version: String,
    // 画面から更新できないときの理由（できるなら無し）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unsupported: Option<String>,
    // GitHub Releases の新しい版（無ければ無し）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest: Option<Release>,
    // GitHub に聞けなかったときの理由（つながらないサーバーなど）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub check_error: Option<String>,
}

#[derive(Deserialize)]
pub struct CheckQuery {
    #[serde(default)]
    pub refresh: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedResponse {
    pub version: String,
}

fn require_admin(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, state, headers).ok_or(StatusCode::UNAUTHORIZED)?;
    if state.config.mode.is_local() || !auth::is_admin(&user) {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "サーバーの更新は、登録した PC の管理者だけができます",
        ));
    }
    Ok(())
}

fn update_error(message: String) -> ApiError {
    crate::elog!("server update error: {message}");
    ApiError::new(StatusCode::BAD_REQUEST, message)
}

fn applied(version: semver::Version) -> Json<ApiResponse<AppliedResponse>> {
    Json(ApiResponse {
        message: Some(format!(
            "サーバーを {version} に入れ替えました。起動し直しています"
        )),
        data: Some(AppliedResponse {
            version: version.to_string(),
        }),
    })
}

// GET /api/server-update?refresh=true
pub async fn get_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<CheckQuery>,
) -> Result<Json<ServerUpdateResponse>, ApiError> {
    require_admin(&state, &headers)?;
    let unsupported = server_update::unsupported_reason();
    let (latest, check_error) = if unsupported.is_some() {
        (None, None)
    } else {
        match tokio::task::spawn_blocking(move || server_update::latest(query.refresh))
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        {
            Ok(latest) => (latest, None),
            Err(message) => (None, Some(message)),
        }
    };
    Ok(Json(ServerUpdateResponse {
        current_version: server_update::current_version().to_string(),
        unsupported: unsupported.map(str::to_string),
        latest,
        check_error,
    }))
}

// POST /api/server-update/apply（GitHub Releases の最新の版を取ってきて入れ替える）
pub async fn apply(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<AppliedResponse>>, ApiError> {
    require_admin(&state, &headers)?;
    let config = state.config.clone();
    let version = tokio::task::spawn_blocking(move || server_update::apply_from_github(&config))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map_err(update_error)?;
    Ok(applied(version))
}

// POST /api/server-update/upload（管理者が上げたサーバー一式。file: .tar.gz、signature: .sig の中身）
pub async fn upload(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse<AppliedResponse>>, ApiError> {
    require_admin(&state, &headers)?;
    if let Some(reason) = server_update::unsupported_reason() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, reason));
    }
    let dir = state.config.data_dir().join("tmp").join("server-update");
    let _ = tokio::fs::remove_dir_all(&dir).await;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| update_error(format!("受け取る場所を作れません: {e}")))?;
    let archive = dir.join("upload.tar.gz");
    let mut signature = None;
    let mut received = false;
    let result: Result<(), ApiError> = async {
        while let Some(mut field) = multipart
            .next_field()
            .await
            .map_err(|_| StatusCode::BAD_REQUEST)?
        {
            match field.name() {
                Some("file") => {
                    let mut file = tokio::fs::File::create(&archive)
                        .await
                        .map_err(|e| update_error(format!("更新ファイルを書けません: {e}")))?;
                    while let Some(chunk) =
                        field.chunk().await.map_err(|_| StatusCode::BAD_REQUEST)?
                    {
                        file.write_all(&chunk)
                            .await
                            .map_err(|e| update_error(format!("更新ファイルを書けません: {e}")))?;
                    }
                    file.flush()
                        .await
                        .map_err(|e| update_error(format!("更新ファイルを書けません: {e}")))?;
                    received = true;
                }
                Some("signature") => {
                    signature = Some(field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?);
                }
                _ => {}
            }
        }
        Ok(())
    }
    .await;
    let outcome = match (result, received, signature) {
        (Err(e), _, _) => Err(e),
        (Ok(()), true, Some(signature)) => {
            let config = state.config.clone();
            let archive = archive.clone();
            tokio::task::spawn_blocking(move || {
                server_update::apply(&config, &archive, &signature, None)
            })
            .await
            .map_err(|_| ApiError::from(StatusCode::INTERNAL_SERVER_ERROR))?
            .map_err(update_error)
        }
        _ => Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "サーバー一式（.tar.gz）と署名（.sig）の両方を選んでください",
        )),
    };
    let _ = tokio::fs::remove_dir_all(&dir).await;
    outcome.map(applied)
}
