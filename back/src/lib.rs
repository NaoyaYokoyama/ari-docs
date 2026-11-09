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
