mod api;
mod database;
mod model;
mod repository;
mod router;
mod service;

use crate::model::{app_state::AppState, session::new_sessions};

use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    // TODO
    // println!("{}", service::auth::hash_password("password"));
    // データベースの接続
    let conn = database::connection::connect();
    database::migration::migrate(&conn);
    println!("Database connected");

    let state = AppState {
        sessions: new_sessions(),
    };

    let app = router::create_router().with_state(state);
    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));

    println!("Server running: http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind");

    axum::serve(listener, app).await.expect("Server error");
}
