use super::{request::*, response::*};
use crate::{
    api::error::ApiError,
    api::response::ApiResponse,
    config::app_state::AppState,
    database::connection,
    repository::session as session_repo,
    service::{
        auth,
        content::local_time,
        server_settings,
        setting::{self, DocsRootError},
        user,
    },
};
use validator::Validate;

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};

pub async fn update_display_name(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UpdateDisplayNameRequest>,
) -> Result<Json<ApiResponse<SettingResponse>>, StatusCode> {
    let conn = connection::connect();

    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let data =
        setting::update_display_name(&conn, &user.user_id, &request.display_name).map_err(|e| {
            eprintln!("update_display_name error: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let response = ApiResponse {
        message: Some("ユーザー名を変更しました".to_string()),
        data: Some(data),
    };

    Ok(Json(response))
}

// パスワードの変更。ローカルモードはログインしないため使えない
pub async fn update_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UpdatePasswordRequest>,
) -> Result<Json<ApiResponse<SettingResponse>>, ApiError> {
    if state.config.mode.is_local() {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "ローカルモードではパスワードを使いません",
        ));
    }
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    request.validate()?;

    user::change_password(
        &conn,
        &user.user_id,
        &request.current_password,
        &request.new_password,
        &request.new_password_confirm,
    )?;
    // ほかの PC のログインを切る（パスワードを知られたときに締め出せるように。FN0101-BR13）
    if let Some(session_id) = auth::get_session_id(&headers) {
        let _ = crate::repository::session::delete_others(&conn, &user.user_id, &session_id);
    }

    let response = ApiResponse {
        message: Some("パスワードを変更しました".to_string()),
        data: Some(SettingResponse {}),
    };

    Ok(Json(response))
}

// Docs の初期フォルダを取得
pub async fn get_docs_root(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DocsRootResponse>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = setting::get_docs_root(&conn, &user.user_id, &state.config.docs_default_root)
        .map_err(|e| {
            eprintln!("get_docs_root error: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(response))
}

// Docs の初期フォルダを変更（空文字なら解除）
pub async fn update_docs_root(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UpdateDocsRootRequest>,
) -> Result<Json<ApiResponse<DocsRootResponse>>, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let data = setting::update_docs_root(
        &conn,
        &state.config.mode,
        &user.user_id,
        &request.docs_root,
        &state.config.docs_default_root,
    )
    .map_err(|e| match e {
        DocsRootError::Forbidden => ApiError::new(
            StatusCode::FORBIDDEN,
            "Docs の初期フォルダはローカルモードでのみ設定できます",
        ),
        DocsRootError::Invalid(path) => ApiError::new(
            StatusCode::BAD_REQUEST,
            format!("フォルダが見つかりません: {}", path),
        ),
        DocsRootError::Db(e) => {
            eprintln!("update_docs_root error: {:?}", e);
            ApiError::from(StatusCode::INTERNAL_SERVER_ERROR)
        }
    })?;

    let message = if data.docs_root.is_empty() {
        "Docs の初期フォルダを解除しました"
    } else {
        "Docs の初期フォルダを変更しました"
    };
    let response = ApiResponse {
        message: Some(message.to_string()),
        data: Some(data),
    };

    Ok(Json(response))
}

fn require_shared_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(rusqlite::Connection, crate::model::user::User), ApiError> {
    if state.config.mode.is_local() {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "ローカルモードではログインしません",
        ));
    }
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, state, headers).ok_or(StatusCode::UNAUTHORIZED)?;
    Ok((conn, user))
}

// ログイン中の端末の一覧（FN0101-BR15）
pub async fn get_sessions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SessionListResponse>, ApiError> {
    let (conn, user) = require_shared_user(&state, &headers)?;
    let current = auth::get_session_id(&headers).unwrap_or_default();
    let session_days = server_settings::get(&conn).session_days;
    let sessions = session_repo::find_by_user(&conn, &user.user_id, session_days)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .into_iter()
        .map(|row| SessionItem {
            key: row.key,
            current: row.session_id == current,
            client: row.client,
            created_at: local_time(&row.created_at),
            last_used_at: local_time(&row.last_used_at),
        })
        .collect();
    Ok(Json(SessionListResponse {
        sessions,
        session_days,
    }))
}

// ほかの端末をログアウトさせる（パソコンを替えた・なくしたときなど）
pub async fn logout_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<LogoutSessionRequest>,
) -> Result<Json<ApiResponse<SettingResponse>>, ApiError> {
    let (conn, user) = require_shared_user(&state, &headers)?;
    let current = auth::get_session_id(&headers).unwrap_or_default();
    let count = if request.others {
        session_repo::delete_others(&conn, &user.user_id, &current)
    } else {
        let key = request
            .key
            .ok_or_else(|| ApiError::new(StatusCode::BAD_REQUEST, "端末を指定してください"))?;
        session_repo::delete_own(&conn, &user.user_id, key)
    }
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(ApiResponse {
        message: Some(format!("{count} 台の端末をログアウトさせました")),
        data: Some(SettingResponse {}),
    }))
}
