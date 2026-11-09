use axum::{
    Router,
    extract::{DefaultBodyLimit, Request},
    http::{
        HeaderValue, Method,
        header::{AUTHORIZATION, CONTENT_TYPE},
    },
    middleware::{self, Next},
    routing::{get, post},
};

use tower_http::cors::CorsLayer;

use crate::config::app_state::AppState;

use crate::api::auth;
use crate::api::folder;
use crate::api::history;
use crate::api::{
    backup::handler as backup, content_folder::handler as content_folder,
    content_image::handler as content_image, docs::handler as docs, favorite::handler as favorite,
    home::handler as home, node::handler as node, note::handler as note, search::handler as search,
    setting::handler as setting, system::handler as system, trash::handler as trash,
    user::handler as user, wiki::handler as wiki,
};

// アップロードなどで受け取る大きさの上限（1 GB）
pub const MAX_BODY_BYTES: usize = 1024 * 1024 * 1024;

pub fn create_router() -> Router<AppState> {
    // 開発時の画面（Vite）と、デスクトップアプリの画面（Linux・macOS は tauri://localhost、Windows は http://tauri.localhost）
    let origins = [
        "http://localhost:5173",
        "tauri://localhost",
        "http://tauri.localhost",
    ]
    .map(|origin| origin.parse::<HeaderValue>().unwrap());
    let cors = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([CONTENT_TYPE, AUTHORIZATION])
        .allow_credentials(true);

    Router::new()
        // Docs
        .route("/api/docs", get(docs::get_docs))
        .route("/api/doc", get(docs::get_doc))
        // Home
        .route("/api/home/search", post(home::search))
        .route("/api/home/favorites", post(home::get_favorites))
        .route("/api/home/recent", get(home::get_recent))
        .route("/api/home/quick-open", post(home::quick_open))
        // Search（ファイルの中身の検索の辞書と取り込み状況。FN0202）
        .route("/api/search/dictionary", get(search::get_dictionary))
        .route(
            "/api/search/dictionary/create",
            post(search::create_dictionary_word),
        )
        .route(
            "/api/search/dictionary/delete",
            post(search::delete_dictionary_word),
        )
        .route("/api/search/status", get(search::get_index_status))
        .route("/api/search/formats", get(search::get_formats))
        // Favorite
        .route(
            "/api/favorite/node/create",
            post(favorite::create_favorite_node),
        )
        .route(
            "/api/favorite/note/create",
            post(favorite::create_favorite_note),
        )
        .route(
            "/api/favorite/wiki/create",
            post(favorite::create_favorite_wiki),
        )
        .route("/api/favorite/delete", post(favorite::delete_favorite))
        // Common
        .route("/api/login", post(auth::login))
        .route("/api/logout", post(auth::logout))
        .route("/api/me", get(auth::get_me))
        .route("/api/server-info", get(auth::get_server_info))
        .route("/api/setup/admin", post(auth::setup_admin))
        .route("/api/folders", get(folder::get_folders))
        // Node
        .route("/api/nodes", get(node::get_nodes))
        .route("/api/nodes/create", post(node::create_node))
        .route("/api/nodes/delete", post(node::delete_node))
        .route("/api/nodes/upload", post(node::upload_node))
        .route("/api/nodes/open", post(node::open_node))
        .route("/api/nodes/rename", post(node::rename_node))
        .route("/api/nodes/move", post(node::move_nodes))
        .route("/api/nodes/copy", post(node::copy_nodes))
        .route("/api/nodes/download", get(node::download_node))
        .route("/api/nodes/reveal", post(node::reveal_node))
        .route("/api/nodes/download-zip", post(node::download_zip))
        // Trash（FN0302）
        .route("/api/trash", get(trash::get_trash))
        .route("/api/trash/restore", post(trash::restore))
        .route("/api/trash/delete", post(trash::delete))
        .route("/api/trash/empty", post(trash::empty))
        // Backup（FN0901。ローカルモード、または共有モードの管理者だけ）
        .route("/api/backup/settings", get(backup::get_settings))
        .route("/api/backup/settings/update", post(backup::update_settings))
        .route("/api/backups", get(backup::get_backups))
        .route("/api/backups/create", post(backup::create_backup))
        .route("/api/backups/delete", post(backup::delete_backup))
        .route("/api/backups/restore", post(backup::restore_backup))
        .route("/api/backups/download", get(backup::download_backup))
        // Note
        .route("/api/notes", get(note::get_notes))
        .route("/api/note/{node_id}", get(note::get_note))
        .route("/api/note/create", post(note::create_note))
        .route("/api/note/delete", post(note::delete_note))
        .route("/api/note/update", post(note::update_note))
        // Note・Wiki の本文に貼り付けた画像（FN0404）
        .route(
            "/api/content-image/upload",
            post(content_image::upload_content_image),
        )
        .route(
            "/api/content-image/{image_id}",
            get(content_image::get_content_image),
        )
        .route(
            "/api/note/{note_id}/history",
            get(history::get_note_history),
        )
        // Wiki
        .route("/api/wikis", get(wiki::get_wikis))
        .route("/api/wiki/{node_id}", get(wiki::get_wiki))
        .route("/api/wiki/create", post(wiki::create_wiki))
        .route("/api/wiki/delete", post(wiki::delete_wiki))
        .route("/api/wiki/update", post(wiki::update_wiki))
        .route(
            "/api/wiki/{wiki_id}/history",
            get(history::get_wiki_history),
        )
        // Note・Wiki のフォルダ（FN0403）
        .route(
            "/api/content-folders/{kind}",
            get(content_folder::get_folders),
        )
        .route(
            "/api/content-folders/create",
            post(content_folder::create_folder),
        )
        .route(
            "/api/content-folders/rename",
            post(content_folder::rename_folder),
        )
        .route(
            "/api/content-folders/delete",
            post(content_folder::delete_folder),
        )
        .route(
            "/api/content-folders/move",
            post(content_folder::move_to_folder),
        )
        // Note・Wiki の 1 つの版（FN0402）
        .route("/api/history/{history_id}", get(history::get_version))
        // Setting
        .route(
            "/api/setting/update/display-name",
            post(setting::update_display_name),
        )
        .route(
            "/api/setting/update/password",
            post(setting::update_password),
        )
        .route("/api/setting/docs-root", get(setting::get_docs_root))
        .route(
            "/api/setting/update/docs-root",
            post(setting::update_docs_root),
        )
        // ログイン中の端末（共有モード。FN0101-BR15）
        .route("/api/setting/sessions", get(setting::get_sessions))
        .route(
            "/api/setting/sessions/logout",
            post(setting::logout_session),
        )
        // System（ログインと保存の設定は、ローカルモード、または共有モードの管理者だけ。FN0902・FN0903）
        .route("/api/system/settings", get(system::get_settings))
        .route("/api/system/settings/update", post(system::update_settings))
        .route("/api/system/info", get(system::get_info))
        // User（共有モードの管理者だけ）
        .route("/api/users", get(user::get_users))
        .route("/api/users/create", post(user::create_user))
        .route("/api/users/delete", post(user::delete_user))
        .route("/api/users/reset-password", post(user::reset_password))
        // 受け取る大きさの上限。axum の既定（2 MB）では大きなファイルをアップロードできないため広げる（FN0301-BR29）
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(cors)
        .layer(middleware::from_fn(
            |request: Request, next: Next| async move {
                println!("{} {}", request.method(), request.uri().path(),);

                next.run(request).await
            },
        ))
}
