use axum::{Router, routing::get};

use crate::api::folder;

pub fn create_router() -> Router {
    Router::new().route("/api/folders", get(folder::get_folders))
}
