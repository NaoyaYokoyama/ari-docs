use super::{request::*, response::*};
use crate::{
    api::{error::ApiError, response::ApiResponse},
    config::app_state::AppState,
    database::connection,
    model::user::User,
    search::{extract, index, ocr},
    service::{
        auth,
        search::{self, DictionaryError},
        search_exclusion::{self, ExclusionError},
    },
};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use rusqlite::Connection;

impl From<DictionaryError> for ApiError {
    fn from(error: DictionaryError) -> Self {
        match error {
            DictionaryError::Invalid(message) => ApiError::new(StatusCode::BAD_REQUEST, message),
            DictionaryError::Conflict(message) => ApiError::new(StatusCode::CONFLICT, message),
            DictionaryError::NotFound => {
                ApiError::new(StatusCode::NOT_FOUND, "単語が見つかりません")
            }
            DictionaryError::Db(e) => {
                crate::elog!("search dictionary error: {:?}", e);
                ApiError::from(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
    }
}

fn login(state: &AppState, headers: &HeaderMap) -> Result<(Connection, User), ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, state, headers).ok_or(StatusCode::UNAUTHORIZED)?;
    Ok((conn, user))
}

// 辞書は全員の検索に効くため、共有モードでは管理者（と許可を付けた利用者。FN0102-BR11）だけが登録・削除できる（FN0202-BR10）
fn can_edit(conn: &Connection, state: &AppState, user: &User) -> bool {
    auth::has_permission(conn, &state.config.mode, user, auth::PERMISSION_DICTIONARY)
}

// 全員の検索の対象外を変えてよいか（FN0202-BR17・FN0102-BR11）
fn can_edit_exclusion(conn: &Connection, state: &AppState, user: &User) -> bool {
    auth::has_permission(conn, &state.config.mode, user, auth::PERMISSION_EXCLUSION)
}

fn require_edit(conn: &Connection, state: &AppState, user: &User) -> Result<(), ApiError> {
    if can_edit(conn, state, user) {
        Ok(())
    } else {
        Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "検索の辞書は管理者（と許可を付けられた人）だけが変更できます",
        ))
    }
}

pub async fn get_dictionary(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DictionaryResponse>, ApiError> {
    let (conn, user) = login(&state, &headers)?;
    let response = search::get_dictionary(&conn, can_edit(&conn, &state, &user))
        .map_err(DictionaryError::Db)?;
    Ok(Json(response))
}

pub async fn create_dictionary_word(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<DictionaryWordRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, user) = login(&state, &headers)?;
    require_edit(&conn, &state, &user)?;
    let word = search::create_dictionary_word(&conn, &request.word, &user.user_id)?;
    Ok(Json(ApiResponse {
        message: Some(format!(
            "「{word}」を登録しました。ファイルは順に取り込み直します"
        )),
        data: None,
    }))
}

pub async fn delete_dictionary_word(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<DictionaryWordRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, user) = login(&state, &headers)?;
    require_edit(&conn, &state, &user)?;
    search::delete_dictionary_word(&conn, &request.word)?;
    Ok(Json(ApiResponse {
        message: Some(format!(
            "「{}」を削除しました。ファイルは順に取り込み直します",
            request.word
        )),
        data: None,
    }))
}

pub async fn get_index_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<IndexStatusResponse>, ApiError> {
    let (conn, _) = login(&state, &headers)?;
    Ok(Json(
        search::get_index_status(&conn).map_err(DictionaryError::Db)?,
    ))
}

// 中身で検索できるファイルの形式（設定画面の「対応するファイル」。FN0202-BR02）
pub async fn get_formats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<FormatsResponse>, ApiError> {
    login(&state, &headers)?;
    Ok(Json(FormatsResponse {
        groups: extract::FORMAT_GROUPS
            .iter()
            .map(|(name, extensions)| FormatGroup {
                name,
                extensions: extensions.to_vec(),
            })
            .collect(),
        max_file_bytes: index::MAX_FILE_BYTES,
        max_chars: extract::MAX_TEXT_CHARS,
        ocr: ocr::status().clone(),
        ocr_image_extensions: ocr::IMAGE_EXTENSIONS.to_vec(),
    }))
}

impl From<ExclusionError> for ApiError {
    fn from(error: ExclusionError) -> Self {
        match error {
            ExclusionError::Invalid(message) => ApiError::new(StatusCode::BAD_REQUEST, message),
            ExclusionError::Conflict(message) => ApiError::new(StatusCode::CONFLICT, message),
            ExclusionError::Forbidden(message) => ApiError::new(StatusCode::FORBIDDEN, message),
            ExclusionError::NotFound => {
                ApiError::new(StatusCode::NOT_FOUND, "検索の対象外が見つかりません")
            }
            ExclusionError::Db(e) => {
                crate::elog!("search exclusion error: {:?}", e);
                ApiError::from(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
    }
}

// 検索の対象外（FN0202-BR16・BR17）。全員の対象外は辞書と同じく、共有モードでは管理者（と許可を付けた利用者）だけが変更できる
pub async fn get_exclusions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ExclusionsResponse>, ApiError> {
    let (conn, user) = login(&state, &headers)?;
    let response = search_exclusion::get_list(
        &conn,
        &user.user_id,
        can_edit_exclusion(&conn, &state, &user),
        !state.config.mode.is_local(),
    )
    .map_err(ExclusionError::Db)?;
    Ok(Json(response))
}

pub async fn create_exclusion(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ExclusionCreateRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, user) = login(&state, &headers)?;
    // ローカルモードは 1 人なので、全員の対象外にする（中身の取り込みもしないため）
    let for_all = request.for_all || state.config.mode.is_local();
    let value = search_exclusion::create(
        &conn,
        &user.user_id,
        for_all,
        &request.kind,
        &request.value,
        can_edit_exclusion(&conn, &state, &user),
    )?;
    let whom = if state.config.mode.is_local() {
        ""
    } else if for_all {
        "全員の"
    } else {
        "自分の"
    };
    Ok(Json(ApiResponse {
        message: Some(format!("「{value}」を{whom}検索の対象から外しました")),
        data: None,
    }))
}

pub async fn delete_exclusion(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ExclusionDeleteRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, user) = login(&state, &headers)?;
    search_exclusion::delete(
        &conn,
        &user.user_id,
        &request.exclusion_id,
        can_edit_exclusion(&conn, &state, &user),
    )?;
    Ok(Json(ApiResponse {
        message: Some("検索の対象に戻しました。中身は順に取り込みます".to_string()),
        data: None,
    }))
}
