use axum::{
    Json,
    body::Bytes,
    extract::{Path, Query, State},
    http::{
        HeaderMap, StatusCode,
        header::{CACHE_CONTROL, CONTENT_TYPE, X_CONTENT_TYPE_OPTIONS},
    },
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};

use crate::{
    api::error::ApiError,
    config::app_state::AppState,
    database::connection,
    service::{
        auth,
        content_image::{self, SaveError},
    },
};

// Note・Wiki の本文に貼り付けた画像（FN0404。API0413・API0414）

#[derive(Deserialize)]
pub struct UploadQuery {
    // note / wiki
    pub kind: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadResponse {
    pub image_id: String,
    // 本文に書く場所（![画像](url)）
    pub url: String,
}

// 画像を受け取る。本文は画像そのもの（画面で縮小したもの）
pub async fn upload_content_image(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<UploadQuery>,
    body: Bytes,
) -> Result<Json<UploadResponse>, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let image_id =
        content_image::save(&conn, &user.user_id, &query.kind, &body).map_err(|e| match e {
            SaveError::InvalidKind => {
                ApiError::new(StatusCode::BAD_REQUEST, "貼り付ける先の種類が違います")
            }
            SaveError::UnsupportedType => ApiError::new(
                StatusCode::BAD_REQUEST,
                "貼り付けられる画像は PNG・JPEG・GIF・WebP です",
            ),
            SaveError::TooLarge => ApiError::new(
                StatusCode::PAYLOAD_TOO_LARGE,
                "画像が大きすぎます（10 MB まで）",
            ),
            SaveError::Db(message) => {
                eprintln!("upload_content_image error: {message}");
                StatusCode::INTERNAL_SERVER_ERROR.into()
            }
        })?;
    Ok(Json(UploadResponse {
        url: format!("/api/content-image/{image_id}"),
        image_id,
    }))
}

// 画像を返す。見られないもの・無いものは 404（Note の画像があることを、ほかの人に知らせないため）
pub async fn get_content_image(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(image_id): Path<String>,
) -> Result<Response, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let (mime, data) = content_image::load(&conn, &user.user_id, &image_id)
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "画像が見つかりません"))?;
    // 画像は作り直さない（同じ ID なら中身も同じ）ので、長く覚えておいてよい
    Ok((
        [
            (CONTENT_TYPE, mime),
            (
                CACHE_CONTROL,
                "private, max-age=31536000, immutable".to_string(),
            ),
            (X_CONTENT_TYPE_OPTIONS, "nosniff".to_string()),
        ],
        data,
    )
        .into_response())
}
