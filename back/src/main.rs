mod api;
mod database;
mod model;
mod router;
mod service;

use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    // データベースの接続
    let conn = database::connection::connect();
    database::migration::migrate(&conn);
    println!("Database connected");

    let app = router::create_router();
    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));

    println!("Server running: http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind");

    axum::serve(listener, app).await.expect("Server error");
}
