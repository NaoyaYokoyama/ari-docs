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
                eprintln!("search dictionary error: {:?}", e);
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

// 辞書は全員の検索に効くため、共有モードでは管理者だけが登録・削除できる（FN0202-BR10）
fn can_edit(state: &AppState, user: &User) -> bool {
    state.config.mode.is_local() || auth::is_admin(user)
}

fn require_edit(state: &AppState, user: &User) -> Result<(), ApiError> {
    if can_edit(state, user) {
        Ok(())
    } else {
        Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "検索の辞書は管理者だけが変更できます",
        ))
    }
}

pub async fn get_dictionary(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DictionaryResponse>, ApiError> {
    let (conn, user) = login(&state, &headers)?;
    let response =
        search::get_dictionary(&conn, can_edit(&state, &user)).map_err(DictionaryError::Db)?;
    Ok(Json(response))
}

pub async fn create_dictionary_word(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<DictionaryWordRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (conn, user) = login(&state, &headers)?;
    require_edit(&state, &user)?;
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
    require_edit(&state, &user)?;
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
