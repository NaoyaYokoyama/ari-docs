use super::{request::*, response::*};
use crate::api::history::SavedResponse;
use crate::{
    api::error::ApiError,
    api::response::ApiResponse,
    config::app_state::AppState,
    database::connection,
    service::{
        auth,
        editing::{self, Action},
        server_settings, wiki,
    },
};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use rusqlite::Connection;
use validator::Validate;

// 書いている間はほかの人が書けない設定か（共有モードだけ。FN0501-BR12）
fn edit_lock(conn: &Connection, state: &AppState) -> bool {
    !state.config.mode.is_local() && server_settings::get(conn).wiki_edit_lock
}

// ほかの人が書いていれば、保存・削除をさせない（423）
fn ensure_not_locked(
    conn: &Connection,
    state: &AppState,
    wiki_id: &str,
    user_id: &str,
) -> Result<(), ApiError> {
    if !edit_lock(conn, state) {
        return Ok(());
    }
    match editing::locked_by(wiki_id, user_id, std::time::Instant::now()) {
        Some((name, since)) => Err(ApiError::new(
            StatusCode::LOCKED,
            format!("{name}さんが書いています（{since} から）。終わるまで保存・削除できません"),
        )),
        None => Ok(()),
    }
}

pub async fn get_wikis(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<WikiResponse>, StatusCode> {
    let conn = connection::connect();

    auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = wiki::get_wikis(&conn).map_err(|e| {
        crate::elog!("get_wikis error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(response))
}

pub async fn get_wiki(
    Path(wiki_id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Wiki>, StatusCode> {
    let conn = connection::connect();

    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    // 無い（Note はほかの人のものも）ときは 404
    let response = wiki::get_wiki(&conn, &user.user_id, &wiki_id).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => StatusCode::NOT_FOUND,
        e => {
            crate::elog!("get_wiki error: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    })?;

    Ok(Json(response))
}

pub async fn create_wiki(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateWikiRequest>,
) -> Result<Json<Wiki>, ApiError> {
    println!("created start");

    request.validate()?;
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    let response = wiki::create_wiki(&conn, &user.user_id, &request.title).map_err(|e| {
        crate::elog!("create_wiki error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(response))
}

pub async fn delete_wiki(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<WikiQuery>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    ensure_not_locked(&conn, &state, &request.wiki_id, &user.user_id)?;

    editing::forget(&request.wiki_id);
    wiki::delete_wiki(&conn, &request.wiki_id).map_err(|e| {
        crate::elog!("delete_wiki error: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let response = ApiResponse {
        message: Some("Wikiを削除しました。".to_string()),
        data: None,
    };

    Ok(Json(response))
}

pub async fn update_wiki(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UpdateWikiRequest>,
) -> Result<Json<ApiResponse<SavedResponse>>, ApiError> {
    request.validate()?;
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    ensure_not_locked(&conn, &state, &request.wiki_id, &user.user_id)?;

    let updated_at = wiki::update_wiki(
        &conn,
        &user.user_id,
        &request.wiki_id,
        &request.title,
        &request.content,
        request.base_updated_at.as_deref(),
        request.force,
    )?;

    let response = ApiResponse {
        message: Some("Wikiを更新しました。".to_string()),
        data: Some(SavedResponse { updated_at }),
    };

    Ok(Json(response))
}

// 書いている・やめたを知らせ、ほかに書いている人と今の更新日時を返す（API0507。同時編集のお知らせ）。
// 画面は未保存の変更がある間だけ 5 分ごとに呼ぶ（つなぎっぱなしにしない）
pub async fn report_editing(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<EditingRequest>,
) -> Result<Json<EditingResponse>, StatusCode> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let current = wiki::get_wiki(&conn, &user.user_id, &request.wiki_id).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => StatusCode::NOT_FOUND,
        e => {
            crate::elog!("report_editing error: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    })?;
    let lock = edit_lock(&conn, &state);
    let action = if request.release {
        // ロックを外せるのは管理者だけ
        if !auth::is_admin(&user) {
            return Err(StatusCode::FORBIDDEN);
        }
        Action::Release
    } else if request.check {
        Action::Check
    } else if request.editing {
        Action::Edit
    } else {
        Action::Stop
    };
    let status = editing::report(
        &request.wiki_id,
        &user.user_id,
        &user.display_name,
        action,
        lock,
        std::time::Instant::now(),
    );
    let (locked_by, locked_since) = status.locked_by.unzip();
    Ok(Json(EditingResponse {
        editors: status.editors,
        updated_at: current.updated_at,
        updated_by: current.updated_by,
        lock,
        locked_by,
        locked_since,
    }))
}
