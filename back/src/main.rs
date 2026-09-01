mod api;
mod batch;
mod common;
mod config;
mod database;
mod model;
mod repository;
mod router;
mod service;

use batch::scheduler::start;
use config::{app_state::AppState, loader};

use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    tokio::spawn(async {
        start().await;
    });

    let config = loader::load();
    // 設定ファイルは起動時に1回だけ読み込む
    let sessions = Default::default();
    let state = AppState { sessions, config };
    println!("config");

    // TODO
    // println!("{}", service::auth::hash_password("password"));
    // データベースの接続
    let conn = database::connection::connect();
    database::migration::migrate(&conn);
    println!("Database connected");

    let app = router::create_router().with_state(state);
    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));

    println!("Server running: http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind");

    axum::serve(listener, app).await.expect("Server error");
}
