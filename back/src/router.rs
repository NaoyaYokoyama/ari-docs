use axum::{
    Router,
    extract::Request,
    http::{HeaderValue, Method, header::CONTENT_TYPE},
    middleware::{self, Next},
    routing::{get, post},
};

use tower_http::cors::CorsLayer;

use crate::config::app_state::AppState;

use crate::api::auth;
use crate::api::folder;
use crate::api::{
    favorite::handler as favorite, home::handler as home, node::handler as node,
    note::handler as note, setting::handler as setting, wiki::handler as wiki,
};

pub fn create_router() -> Router<AppState> {
    let cors = CorsLayer::new()
        .allow_origin("http://localhost:5173".parse::<HeaderValue>().unwrap())
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([CONTENT_TYPE])
        .allow_credentials(true);

    Router::new()
        // Home
        .route("/api/home/search", post(home::search))
        .route("/api/home/favorites", post(home::get_favorites))
        // Favorite
        .route(
            "/api/favorite/wiki/create",
            post(favorite::create_favorite_wiki),
        )
        .route("/api/favorite/delete", post(favorite::delete_favorite))
        // Common
        .route("/api/login", post(auth::login))
        .route("/api/logout", post(auth::logout))
        .route("/api/me", get(auth::get_me))
        .route("/api/folders", get(folder::get_folders))
        // Node
        .route("/api/nodes", get(node::get_nodes))
        .route("/api/nodes/create", post(node::create_node))
        .route("/api/nodes/delete", post(node::delete_node))
        .route("/api/nodes/upload", post(node::upload_node))
        .route("/api/nodes/open", post(node::open_node))
        // Note
        .route("/api/notes", get(note::get_notes))
        .route("/api/note/{node_id}", get(note::get_note))
        .route("/api/note/create", post(note::create_note))
        .route("/api/note/delete", post(note::delete_note))
        .route("/api/note/update", post(note::update_note))
        .route("/api/note/favorite", post(note::favorite_note))
        // Wiki
        .route("/api/wikis", get(wiki::get_wikis))
        .route("/api/wiki/{node_id}", get(wiki::get_wiki))
        .route("/api/wiki/create", post(wiki::create_wiki))
        .route("/api/wiki/delete", post(wiki::delete_wiki))
        .route("/api/wiki/update", post(wiki::update_wiki))
        .route("/api/wiki/favorite", post(wiki::favorite_wiki))
        // Setting
        .route(
            "/api/setting/update/display-name",
            post(setting::update_display_name),
        )
        .route(
            "/api/setting/update/password",
            post(setting::update_password),
        )
        .layer(cors)
        .layer(middleware::from_fn(
            |request: Request, next: Next| async move {
                println!("{} {}", request.method(), request.uri().path(),);

                next.run(request).await
            },
        ))
}
