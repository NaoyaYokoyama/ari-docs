use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::RwLock;

// DB ファイルの場所。起動時に init で決める（未設定なら開発用の data/ari.db）。
// デスクトップアプリで起動に失敗し、別の作業フォルダで起動し直すこともあるため、上書きできるようにする
static DATABASE_PATH: RwLock<Option<PathBuf>> = RwLock::new(None);

pub fn init(path: &str) {
    *DATABASE_PATH.write().unwrap() = Some(PathBuf::from(path));
}

pub fn connect() -> Connection {
    let path = DATABASE_PATH
        .read()
        .unwrap()
        .clone()
        .unwrap_or_else(|| PathBuf::from("data/ari.db"));
    if let Some(dir) = path.parent().filter(|dir| !dir.as_os_str().is_empty()) {
        std::fs::create_dir_all(dir).expect("Failed to create database directory");
    }
    let conn = Connection::open(path).expect("Failed to open database");
    // 取り込みバッチ（BAT0302）が書き込み中でも、API が待ってから読み書きできるようにする
    conn.busy_timeout(std::time::Duration::from_secs(10))
        .expect("Failed to set busy timeout");
    conn
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_can_change_database_path() {
        let dir = std::env::temp_dir().join(format!("ari-docs-conn-{}", std::process::id()));
        let first = dir.join("a").join("ari.db");
        let second = dir.join("b").join("ari.db");
        init(first.to_str().unwrap());
        connect();
        init(second.to_str().unwrap());
        connect();
        assert!(first.exists());
        assert!(second.exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
