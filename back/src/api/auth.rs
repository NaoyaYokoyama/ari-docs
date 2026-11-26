use axum::{
    Json,
    extract::{ConnectInfo, State},
    http::{
        HeaderMap, HeaderValue, StatusCode,
        header::{SET_COOKIE, USER_AGENT},
    },
    response::IntoResponse,
};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use uuid::Uuid;
use validator::Validate;

use crate::{
    api::{error::ApiError, user::request::validate_user_id},
    config::{app::AppMode, app_state::AppState},
    database::connection,
    model::user::User,
    repository::{session as session_repo, user as user_repo},
    service::{admin_device, auth, server_settings, setup_code, user as user_service},
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
    // 使える許可（dictionary・exclusion・backup。FN0102-BR11）。ローカルモード・管理者はすべて
    pub permissions: Vec<String>,
    // 管理者だが、この PC を管理者の PC に登録していない（利用者として使える。FN0102-BR12）
    pub admin_elsewhere: bool,
    // ファイルのロックの期限の上限（日。サーバーの設定。FN0301-BR38）
    pub file_lock_max_days: i64,
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
            permissions: auth::permissions(conn, mode, user),
            admin_elsewhere: user.admin_elsewhere,
            file_lock_max_days: server_settings::get(conn).file_lock_max_days,
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
    // 管理者の登録に登録用のコードが要る（ほかの PC からつないだとき。FN0102-BR02）
    pub setup_code_required: bool,
    // このサーバーの ID（ari:// のリンクで場所を見分ける。FN0004-BR07）
    pub server_id: String,
    // サーバーの版（デスクトップアプリはこの版まで更新する。FN0904-BR02）
    pub version: &'static str,
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
    // 登録用のコード（サーバーの起動画面・setup-code.txt。サーバーの PC の中からは不要）
    #[serde(default)]
    pub setup_code: String,
}

// 端末の名前。画面が送ったもの、無ければ User-Agent（FN0101-BR15）
fn client_name(headers: &HeaderMap, client: &str) -> String {
    let client = client.trim();
    if client.is_empty() {
        headers
            .get(USER_AGENT)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
    } else {
        client
    }
    .chars()
    .take(200)
    .collect()
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
    let client = client_name(request_headers, client);
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
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
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
    let mut user = user_repo::find_by_user_id(&conn, &request.user_id)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;
    // 管理者の PC（FN0102-BR12）。サーバーの PC の中で、まだ 1 台も登録していなければこの PC を登録する
    if !state.config.mode.is_local() {
        admin_device::register_if_first_on_server(
            &conn,
            &state.config,
            &user,
            &headers,
            &addr,
            &client_name(&headers, &request.client),
        );
        admin_device::apply(&conn, &mut user, &headers);
    }

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
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> Result<Json<ServerInfoResponse>, StatusCode> {
    let conn = connection::connect();
    let needs_admin = !state.config.mode.is_local()
        && user_repo::count_users(&conn).map_err(|e| {
            crate::elog!("get_server_info error: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })? == 0;
    let server_id = crate::service::server_settings::server_id(&conn).map_err(|e| {
        crate::elog!("get_server_info server_id error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(ServerInfoResponse {
        app: "ari-docs",
        mode: state.config.mode.as_str().to_string(),
        needs_admin,
        setup_code_required: needs_admin && setup_code::required(&addr),
        server_id,
        version: env!("CARGO_PKG_VERSION"),
    }))
}

// 最初の管理者を登録してログインする。共有モードで、ユーザーが 1 人もいないときだけ使える
pub async fn setup_admin(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
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
    // ほかの PC からは、サーバーの起動画面・setup-code.txt の登録用のコードが要る（FN0102-BR02）
    if !setup_code::verify(&state.config, &addr, &request.setup_code) {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "登録用のコードが違います。サーバーを起動した画面か、データのフォルダの setup-code.txt を確かめてください",
        ));
    }
    if admin_device::current_hash(&headers).is_none() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "この PC の鍵がありません。デスクトップアプリから登録してください",
        ));
    }
    let conn = connection::connect();
    let user = user_service::create_first_admin(
        &conn,
        request.user_id.trim(),
        request.display_name.trim(),
        &request.password,
    )?;
    // 登録した PC を管理者の PC にする（FN0102-BR12）
    admin_device::register(
        &conn,
        &user.user_id,
        &headers,
        &client_name(&headers, &request.client),
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    setup_code::clear(&state.config);
    start_session(&state, &headers, &request.client, &user)
}
