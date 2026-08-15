use axum::{
    Router,
    http::{HeaderValue, Method, header::CONTENT_TYPE},
    routing::{get, post},
};

use tower_http::cors::CorsLayer;

use crate::model::app_state::AppState;

use crate::api::auth;
use crate::api::folder;
use crate::api::{node::handler as node, note::handler as note};

pub fn create_router() -> Router<AppState> {
    let cors = CorsLayer::new()
        .allow_origin("http://localhost:5173".parse::<HeaderValue>().unwrap())
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([CONTENT_TYPE])
        .allow_credentials(true);

    Router::new()
        .route("/api/login", post(auth::login))
        .route("/api/logout", post(auth::logout))
        .route("/api/me", get(auth::get_me))
        .route("/api/folders", get(folder::get_folders))
        .route("/api/nodes", get(node::get_nodes))
        .route("/api/nodes/create", post(node::create_node))
        .route("/api/nodes/delete", post(node::delete_node))
        .route("/api/notes", get(note::get_notes))
        .route("/api/note/{node_id}", get(note::get_notes))
        .route("/api/note/create", get(note::get_notes))
        .route("/api/note/delete", get(note::get_notes))
        .layer(cors)
}
