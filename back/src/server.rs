use std::net::{IpAddr, SocketAddr};
use std::path::Path;

use crate::{
    batch::scheduler,
    config::{app::AppConfig, app_state::AppState},
    database::{connection, migration},
    repository::user as user_repo,
    router,
};

// バックエンドを起動する。ポートを確保するまでを行ってから戻り、API の処理とバッチは裏で動き続ける。
// 戻った時点で API を呼べるので、デスクトップアプリは戻るのを待ってから画面を表示する。
pub async fn start(config: AppConfig, port: u16) -> Result<(), String> {
    if !Path::new(&config.folder_root).is_dir() {
        return Err(format!(
            "folder_root が見つかりません: {}（config.toml の folder_root を確認してください）",
            config.folder_root
        ));
    }

    // DB の作成とマイグレーション。ローカルモードではユーザー local も作る
    connection::init(&config.database_path);
    let conn = connection::connect();
    migration::migrate(&conn);
    if config.mode.is_local() {
        user_repo::ensure_local_user(&conn)
            .map_err(|e| format!("ユーザーの作成に失敗しました: {e}"))?;
    }
    println!("Database connected: {}", config.database_path);
    // 文字認識のモデルの場所（FN0202-BR15）。使えるかは起動時に 1 回だけ調べる
    crate::search::ocr::configure(&config.ocr_models_dir);
    crate::search::ocr::status();

    let ip: IpAddr = config
        .listen_address()
        .parse()
        .map_err(|_| format!("bind_address が正しくありません: {}", config.bind_address))?;
    let addr = SocketAddr::new(ip, port);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("ポート {port} を使えません: {e}"))?;

    // 共有モードで証明書と秘密鍵が設定されていれば HTTPS で待ち受ける（FN0101-BR14）
    let tls = match config.tls_files() {
        Some((cert, key)) => {
            let _ = rustls::crypto::ring::default_provider().install_default();
            Some(
                axum_server::tls_rustls::RustlsConfig::from_pem_file(cert, key)
                    .await
                    .map_err(|e| format!("証明書・秘密鍵を読めません（tls_cert・tls_key を確認してください）: {e}"))?,
            )
        }
        None => None,
    };
    println!(
        "Server running: {}://{}",
        if tls.is_some() { "https" } else { "http" },
        addr
    );

    let scheduler_config = config.clone();
    tokio::spawn(async move {
        scheduler::start(scheduler_config).await;
    });
    // 起動時に一度 folder/ 全体を node テーブルに合わせ、その後はファイルの変更を見張ってすぐに反映する（BAT0301）
    let sync_root = config.folder_root.clone();
    tokio::task::spawn_blocking(move || {
        if let Err(e) = crate::batch::node_sync::execute(&sync_root) {
            eprintln!("node_sync: {e}");
        }
    });
    crate::batch::node_watch::start(config.folder_root.clone());

    crate::api::system::handler::mark_started();
    let state = AppState { config };
    let app = router::create_router().with_state(state);
    match tls {
        Some(tls) => {
            let listener = listener
                .into_std()
                .map_err(|e| format!("ポート {port} を使えません: {e}"))?;
            let server = axum_server::from_tcp_rustls(listener, tls)
                .map_err(|e| format!("ポート {port} を使えません: {e}"))?;
            tokio::spawn(async move {
                if let Err(e) = server.serve(app.into_make_service()).await {
                    eprintln!("Server error: {e}");
                }
            });
        }
        None => {
            tokio::spawn(async move {
                if let Err(e) = axum::serve(listener, app).await {
                    eprintln!("Server error: {e}");
                }
            });
        }
    }

    Ok(())
}
