//! ari-docs のバックエンド（API・バッチ）。
//! 開発時は src/main.rs から、デスクトップアプリでは desktop/src-tauri から server::start を呼ぶ。

mod api;
mod batch;
mod common;
mod config;
mod database;
mod model;
mod repository;
mod router;
mod search;
mod service;

pub mod server;

pub use config::app::{AppConfig, AppMode};
pub use config::loader::{load as load_dev_config, load_file as load_config_file};
// この PC を共有サーバーとして公開する前に、ユーザー local のデータを管理者に移す（docs の FN0005）
pub use service::host::publish_local_data;

// エラーのログに書く（デスクトップアプリの起動エラーなど。バックエンドを起動したあとだけ書く）
pub fn log_error(message: &str) {
    common::error_log::write(message);
}
