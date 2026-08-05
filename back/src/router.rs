use axum::{Router, routing::get};
use tower_http::cors::CorsLayer;

use crate::api;
use crate::api::folder;

pub fn create_router() -> Router {
    Router::new()
        .route("/api/folders", get(folder::get_folders))
        .route("/api/nodes", get(api::node::get_nodes))
        .layer(CorsLayer::permissive())
}
