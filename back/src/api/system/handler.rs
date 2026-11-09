use std::sync::OnceLock;

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use chrono::{DateTime, Local};
use rusqlite::Connection;
use serde::Serialize;

use crate::{
    api::{error::ApiError, response::ApiResponse},
    config::app_state::AppState,
    database::connection,
    model::user::User,
    service::{
        auth,
        server_settings::{self, ServerSettings},
    },
};

// サーバーを起動した日時（情報の画面に出す）
static STARTED_AT: OnceLock<DateTime<Local>> = OnceLock::new();

pub fn mark_started() {
    let _ = STARTED_AT.set(Local::now());
}

// ログインと保存の設定は全員に効くため、共有モードでは管理者だけが扱える（FN0902-BR01）
fn require_manage(state: &AppState, headers: &HeaderMap) -> Result<(Connection, User), ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, state, headers).ok_or(StatusCode::UNAUTHORIZED)?;
    if !auth::can_manage(&state.config.mode, &user) {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "サーバーの設定は管理者だけが扱えます",
        ));
    }
    Ok((conn, user))
}

pub async fn get_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ServerSettings>, ApiError> {
    let (conn, _) = require_manage(&state, &headers)?;
    Ok(Json(server_settings::get(&conn)))
}

pub async fn update_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ServerSettings>,
) -> Result<Json<ApiResponse<ServerSettings>>, ApiError> {
    let (conn, _) = require_manage(&state, &headers)?;
    server_settings::save(&conn, &request)
        .map_err(|message| ApiError::new(StatusCode::BAD_REQUEST, message))?;
    Ok(Json(ApiResponse {
        message: Some("サーバーの設定を保存しました".to_string()),
        data: Some(request),
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub version: String,
    // local / shared
    pub mode: String,
    // サーバーの OS（linux / windows / macos など）
    pub os: String,
    pub https: bool,
    pub started_at: String,
    pub counts: Counts,
    // 置き場所は管理できる人にだけ返す（共有サーバーのフォルダ構成を一般の利用者に見せない）
    pub paths: Option<Paths>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub users: i64,
    pub notes: i64,
    pub wikis: i64,
    pub nodes: i64,
    // 中身を取り込んだファイルと、登録した単語の数（FN0202）
    pub indexed_files: i64,
    pub keywords: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Paths {
    pub folder_root: String,
    pub data_dir: String,
    pub database_path: String,
    pub database_bytes: u64,
}

fn count(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
        row.get(0)
    })
    .unwrap_or(0)
}

// アプリの情報（FN0903）。困ったときの問い合わせで伝えられるように、画面から写せるようにする
pub async fn get_info(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SystemInfo>, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let config = &state.config;
    let paths = auth::can_manage(&config.mode, &user).then(|| Paths {
        folder_root: config.folder_root.clone(),
        data_dir: config.data_dir().display().to_string(),
        database_path: config.database_path.clone(),
        database_bytes: std::fs::metadata(&config.database_path)
            .map(|meta| meta.len())
            .unwrap_or(0),
    });
    Ok(Json(SystemInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        mode: config.mode.as_str().to_string(),
        os: std::env::consts::OS.to_string(),
        https: config.tls_files().is_some(),
        started_at: STARTED_AT
            .get()
            .map(|at| at.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_default(),
        counts: Counts {
            users: count(&conn, "user"),
            notes: count(&conn, "note"),
            wikis: count(&conn, "wiki"),
            nodes: count(&conn, "node"),
            indexed_files: count(&conn, "node_content"),
            keywords: count(&conn, "keyword"),
        },
        paths,
    }))
}
