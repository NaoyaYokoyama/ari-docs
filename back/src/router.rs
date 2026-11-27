use axum::{
    Router,
    extract::{DefaultBodyLimit, Request},
    http::{
        HeaderName, HeaderValue, Method, StatusCode,
        header::{AUTHORIZATION, CONTENT_TYPE, ORIGIN},
    },
    middleware::{self, Next},
    response::IntoResponse,
    routing::{get, post},
};

use tower_http::cors::CorsLayer;

use crate::config::app_state::AppState;

use crate::api::admin_device;
use crate::api::app_update::handler as app_update;
use crate::api::auth;
use crate::api::history;
use crate::api::server_update;
use crate::api::{
    backup::handler as backup, content_folder::handler as content_folder,
    content_image::handler as content_image, docs::handler as docs, favorite::handler as favorite,
    home::handler as home, node::handler as node, note::handler as note, search::handler as search,
    setting::handler as setting, system::handler as system, task::handler as task,
    trash::handler as trash, user::handler as user, wiki::handler as wiki,
};

// 受け取る大きさの上限（1 GB）。ファイルのアップロードはサーバーの設定の上限を使う（FN0902-BR07）
pub const MAX_BODY_BYTES: usize = 1024 * 1024 * 1024;

// 画面の置き場所（オリジン）。開発時の画面（Vite）と、デスクトップアプリの画面（Linux・macOS は tauri://localhost、Windows は http://tauri.localhost）
const APP_ORIGINS: [&str; 3] = [
    "http://localhost:5173",
    "tauri://localhost",
    "http://tauri.localhost",
];

// ほかのサイトの画面から送られた書き換えの要求を断る（CSRF）。
// ブラウザは別のサイトへの POST に Origin を付ける。ファイルのアップロード（multipart）は事前の確認（CORS）なしで送れてしまうため、ここで止める。
// Origin の無い要求（インストーラーの確認・サーバーどうし）はそのまま通す
fn origin_allowed(method: &Method, origin: Option<&HeaderValue>) -> bool {
    if matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS) {
        return true;
    }
    origin.is_none_or(|origin| APP_ORIGINS.iter().any(|allowed| origin == *allowed))
}

pub fn create_router() -> Router<AppState> {
    let origins = APP_ORIGINS.map(|origin| origin.parse::<HeaderValue>().unwrap());
    let cors = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([
            CONTENT_TYPE,
            AUTHORIZATION,
            HeaderName::from_static(crate::service::admin_device::DEVICE_HEADER),
        ])
        .allow_credentials(true);

    Router::new()
        // Docs
        .route("/api/docs", get(docs::get_docs))
        .route("/api/doc", get(docs::get_doc))
        .route("/api/doc-image", get(docs::get_doc_image))
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
        .route("/api/search/exclusions", get(search::get_exclusions))
        .route(
            "/api/search/exclusions/create",
            post(search::create_exclusion),
        )
        .route(
            "/api/search/exclusions/delete",
            post(search::delete_exclusion),
        )
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
        .route("/api/favorite/order", post(favorite::update_favorite_order))
        // Common
        .route("/api/login", post(auth::login))
        .route("/api/logout", post(auth::logout))
        .route("/api/me", get(auth::get_me))
        .route("/api/server-info", get(auth::get_server_info))
        .route("/api/setup/admin", post(auth::setup_admin))
        // デスクトップアプリの更新（FN0904。ログイン不要）
        .route(
            "/api/app-update/{target}/{arch}/{current_version}",
            get(app_update::get_update),
        )
        .route(
            "/api/app-update/files/{file_name}",
            get(app_update::get_file),
        )
        // Node
        .route("/api/nodes", get(node::get_nodes))
        .route("/api/nodes/create", post(node::create_node))
        .route("/api/nodes/delete", post(node::delete_node))
        // 上限はサーバーの設定で決め、ハンドラーで確かめる（FN0902-BR07）
        .route(
            "/api/nodes/upload",
            post(node::upload_node).layer(DefaultBodyLimit::disable()),
        )
        .route("/api/nodes/open", post(node::open_node))
        .route("/api/nodes/rename", post(node::rename_node))
        .route("/api/nodes/description", post(node::update_description))
        .route("/api/nodes/move", post(node::move_nodes))
        .route("/api/nodes/copy", post(node::copy_nodes))
        .route("/api/nodes/lock", post(node::lock_node))
        .route("/api/nodes/locks", get(node::get_locks))
        .route("/api/nodes/versions", get(node::get_versions))
        .route("/api/nodes/versions/download", get(node::download_version))
        .route("/api/nodes/versions/restore", post(node::restore_version))
        .route("/api/nodes/unlock", post(node::unlock_node))
        .route("/api/nodes/download", get(node::download_node))
        .route("/api/nodes/preview-office", get(node::preview_office))
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
        // 個人のタスク（FN0602）
        .route("/api/tasks", get(task::get_tasks))
        .route("/api/tasks/create", post(task::create_task))
        .route("/api/tasks/update", post(task::update_task))
        .route("/api/tasks/order", post(task::reorder_tasks))
        .route("/api/tasks/move", post(task::move_task))
        .route("/api/tasks/delete", post(task::delete_task))
        .route("/api/tasks/delete-done", post(task::delete_done_tasks))
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
        .route("/api/wiki/editing", post(wiki::report_editing))
        .route(
            "/api/compare/files",
            post(crate::api::compare::compare_files),
        )
        .route(
            "/api/compare/folders",
            post(crate::api::compare::compare_folders),
        )
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
        .route("/api/system/licenses", get(system::get_licenses))
        // User（共有モードの管理者だけ）
        .route("/api/users", get(user::get_users))
        .route("/api/users/create", post(user::create_user))
        .route("/api/users/delete", post(user::delete_user))
        .route("/api/users/reset-password", post(user::reset_password))
        .route("/api/users/role", post(user::change_role))
        .route("/api/users/permissions", post(user::update_permissions))
        .route("/api/admin-devices", get(admin_device::get_devices))
        .route(
            "/api/admin-devices/pairing",
            post(admin_device::create_pairing),
        )
        .route(
            "/api/admin-devices/register",
            post(admin_device::register_device),
        )
        .route(
            "/api/admin-devices/delete",
            post(admin_device::delete_device),
        )
        // サーバーの更新（共有モードの管理者だけ。FN0904-BR14）
        .route("/api/server-update", get(server_update::get_status))
        .route("/api/server-update/apply", post(server_update::apply))
        .route("/api/server-update/upload", post(server_update::upload))
        // 受け取る大きさの上限。axum の既定（2 MB）では大きなファイルをアップロードできないため広げる（FN0301-BR29）
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(cors)
        .layer(middleware::from_fn(
            |request: Request, next: Next| async move {
                // 受け取った要求は開発のときだけ出す（配布物では出さない。ログが膨らみ、ファイルのパスも残るため）
                if cfg!(debug_assertions) {
                    println!("{} {}", request.method(), request.uri().path());
                }

                if !origin_allowed(request.method(), request.headers().get(ORIGIN)) {
                    return StatusCode::FORBIDDEN.into_response();
                }
                let mut response = next.run(request).await;
                // 返した中身をブラウザに推測させない（ファイルや画像を HTML として動かさない）
                response.headers_mut().insert(
                    axum::http::header::X_CONTENT_TYPE_OPTIONS,
                    axum::http::HeaderValue::from_static("nosniff"),
                );
                response
            },
        ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_from_other_sites_are_refused() {
        let other = HeaderValue::from_static("https://evil.example");
        let app = HeaderValue::from_static("http://tauri.localhost");
        assert!(!origin_allowed(&Method::POST, Some(&other)));
        assert!(!origin_allowed(
            &Method::POST,
            Some(&HeaderValue::from_static("null"))
        ));
        assert!(origin_allowed(&Method::POST, Some(&app)));
        assert!(origin_allowed(&Method::POST, None));
        // 読むだけの要求は CORS で中身を読めないので通す
        assert!(origin_allowed(&Method::GET, Some(&other)));
    }
}
