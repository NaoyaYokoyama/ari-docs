use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use validator::ValidationErrors;

use crate::api::response::ApiResponse;

pub struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

impl From<ValidationErrors> for ApiError {
    fn from(error: ValidationErrors) -> Self {
        let message = error
            .field_errors()
            .values()
            .flat_map(|errors| errors.iter())
            .find_map(|error| error.message.as_ref())
            .map(|message| message.to_string())
            .unwrap_or_else(|| "入力内容に誤りがあります。".to_string());
        Self {
            status: StatusCode::BAD_REQUEST,
            message,
        }
    }
}

impl From<crate::service::content::SaveError> for ApiError {
    fn from(error: crate::service::content::SaveError) -> Self {
        use crate::service::content::SaveError;
        match error {
            SaveError::NotFound => Self::new(
                StatusCode::NOT_FOUND,
                "見つかりません。削除された可能性があります",
            ),
            SaveError::Conflict(message) => Self::new(StatusCode::CONFLICT, message),
            SaveError::Db(e) => {
                eprintln!("save error: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR.into()
            }
        }
    }
}

impl From<StatusCode> for ApiError {
    fn from(status: StatusCode) -> Self {
        Self {
            status,
            message: status
                .canonical_reason()
                .unwrap_or("Unknown error")
                .to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ApiResponse::<()> {
                message: Some(self.message),
                data: None,
            }),
        )
            .into_response()
    }
}
