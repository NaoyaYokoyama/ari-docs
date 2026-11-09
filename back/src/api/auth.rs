use axum::{
    Json,
    extract::State,
    http::{
        HeaderMap, HeaderValue, StatusCode,
        header::{SET_COOKIE, USER_AGENT},
    },
    response::IntoResponse,
};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::{
    api::{error::ApiError, user::request::validate_user_id},
    config::{app::AppMode, app_state::AppState},
    database::connection,
    model::user::User,
    repository::{session as session_repo, user as user_repo},
    service::{auth, server_settings, user as user_service},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub user_id: String,
    pub password: String,
    // 端末の名前（例: Windows・デスクトップアプリ）。無ければ User-Agent を残す（FN0101-BR15）
    #[serde(default)]
    pub client: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub user_id: String,
    pub display_name: String,
    pub mode: String,
    // 共有モードでユーザーを管理できる
    pub is_admin: bool,
    // Docs（Markdown ビューア）を使う設定か（サーバーの設定。ヘッダーのメニュー・Alt+数字に出すかを決める）
    pub docs_enabled: bool,
    // ログイン・管理者の登録のときだけ返す。デスクトップアプリは Authorization: Bearer で送る
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

impl LoginResponse {
    pub fn new(conn: &Connection, user: &User, mode: &AppMode) -> Self {
        Self {
            user_id: user.user_id.clone(),
            display_name: user.display_name.clone(),
            mode: mode.as_str().to_string(),
            is_admin: !mode.is_local() && auth::is_admin(user),
            docs_enabled: server_settings::get(conn).docs_enabled,
            token: None,
        }
    }
}

// 接続先のサーバーの情報。デスクトップアプリが接続先を確かめるのと、ログイン画面で管理者の登録を出すかを決めるのに使う
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfoResponse {
    pub app: &'static str,
    pub mode: String,
    // ユーザーが 1 人もいない（最初に管理者を登録する）
    pub needs_admin: bool,
}

#[derive(Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SetupAdminRequest {
    #[validate(custom(function = "validate_user_id"))]
    pub user_id: String,
    #[validate(custom(function = "crate::api::user::request::validate_display_name"))]
    pub display_name: String,
    #[validate(custom(function = "crate::api::user::request::validate_password"))]
    pub password: String,
    #[serde(default)]
    pub client: String,
}

// セッションを作り、Cookie（ブラウザ用）とトークン（デスクトップアプリ用）で返す
fn start_session(
    state: &AppState,
    request_headers: &HeaderMap,
    client: &str,
    user: &User,
) -> Result<(HeaderMap, Json<LoginResponse>), ApiError> {
    let session_id = Uuid::new_v4().to_string();
    let conn = connection::connect();

    // session_id -> user_id を DB に保存する（再起動してもログインしたままにする。FN0101-BR09）。
    // 端末を見分けられるように、画面が送った端末の名前（無ければ User-Agent）も残す（FN0101-BR15）
    let client = client.trim();
    let client: String = if client.is_empty() {
        request_headers
            .get(USER_AGENT)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
    } else {
        client
    }
    .chars()
    .take(200)
    .collect();
    session_repo::create(&conn, &session_id, &user.user_id, &client)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let cookie = format!(
        "session_id={}; HttpOnly; SameSite=Lax; Path=/; Max-Age={}",
        session_id,
        server_settings::get(&conn).session_days * 24 * 60 * 60
    );

    let mut headers = HeaderMap::new();

    headers.insert(
        SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    );

    let mut response = LoginResponse::new(&conn, user, &state.config.mode);
    response.token = Some(session_id);
    Ok((headers, Json(response)))
}

pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<LoginRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let conn = connection::connect();

    auth::login(&conn, &state, &request.user_id, &request.password).map_err(|e| match e {
        auth::LoginError::Invalid => ApiError::new(
            StatusCode::UNAUTHORIZED,
            "ユーザーIDまたはパスワードが違います",
        ),
        auth::LoginError::Locked => ApiError::new(
            StatusCode::TOO_MANY_REQUESTS,
            format!(
                "ログインに続けて失敗したため、{} 分間ログインできません。しばらくしてからお試しください",
                server_settings::get(&conn).lock_minutes
            ),
        ),
    })?;
    let user = user_repo::find_by_user_id(&conn, &request.user_id)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    start_session(&state, &headers, &request.client, &user)
}

pub async fn get_me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<LoginResponse>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    Ok(Json(LoginResponse::new(&conn, &user, &state.config.mode)))
}

pub async fn logout(headers: HeaderMap) -> StatusCode {
    let Some(session_id) = auth::get_session_id(&headers) else {
        return StatusCode::UNAUTHORIZED;
    };

    if session_repo::delete(&connection::connect(), &session_id).is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR;
    }

    StatusCode::NO_CONTENT
}

pub async fn get_server_info(
    State(state): State<AppState>,
) -> Result<Json<ServerInfoResponse>, StatusCode> {
    let conn = connection::connect();
    let needs_admin = !state.config.mode.is_local()
        && user_repo::count_users(&conn).map_err(|e| {
            eprintln!("get_server_info error: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })? == 0;
    Ok(Json(ServerInfoResponse {
        app: "ari-docs",
        mode: state.config.mode.as_str().to_string(),
        needs_admin,
    }))
}

// 最初の管理者を登録してログインする。共有モードで、ユーザーが 1 人もいないときだけ使える
pub async fn setup_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<SetupAdminRequest>,
) -> Result<impl IntoResponse, ApiError> {
    if state.config.mode.is_local() {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "ローカルモードではユーザーを登録できません",
        ));
    }
    request.validate()?;
    let conn = connection::connect();
    let user = user_service::create_first_admin(
        &conn,
        request.user_id.trim(),
        request.display_name.trim(),
        &request.password,
    )?;
    start_session(&state, &headers, &request.client, &user)
}
