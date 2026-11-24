// 起動。設定は引数の設定ファイル（共有サーバーとして動かすとき。例: back /opt/ari-docs/config.toml）、
// 無ければ back/config.toml（開発時の cargo run）から読む。`back --version` は版を出して終わる
use std::path::Path;

use ari_back::{enable_self_update, load_config_file, load_dev_config, server};

#[tokio::main]
async fn main() {
    let arg = std::env::args().nth(1);
    // サーバーの更新で、新しい版がこの PC で動くかを確かめるのにも使う（FN0904-BR16）
    if arg.as_deref() == Some("--version") {
        println!("ari-docs {}", env!("CARGO_PKG_VERSION"));
        return;
    }
    let config = match arg {
        Some(path) => {
            // 設定ファイルを付けて起動したサーバーは、管理者が画面から更新できる（FN0904-BR14）
            enable_self_update();
            load_config_file(Path::new(&path)).unwrap_or_else(|e| {
                eprintln!("{e}");
                std::process::exit(1);
            })
        }
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
