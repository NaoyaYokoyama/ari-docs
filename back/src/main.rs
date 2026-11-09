// 起動。設定は引数の設定ファイル（共有サーバーとして動かすとき。例: back /opt/ari-docs/config.toml）、
// 無ければ back/config.toml（開発時の cargo run）から読む
use std::path::Path;

use ari_back::{load_config_file, load_dev_config, server};

#[tokio::main]
async fn main() {
    let config = match std::env::args().nth(1) {
        Some(path) => load_config_file(Path::new(&path)).unwrap_or_else(|e| {
            eprintln!("{e}");
            std::process::exit(1);
        }),
        None => load_dev_config(),
    };
    let port = config.port;
    if let Err(e) = server::start(config, port).await {
        eprintln!("{e}");
        std::process::exit(1);
    }
    // API とバッチは裏で動いているので、Ctrl+C まで待つ
    let _ = tokio::signal::ctrl_c().await;
}
