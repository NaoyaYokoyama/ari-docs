use rusqlite::Connection;
use rusqlite::config::DbConfig;
use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
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
    harden(&conn);
    conn
}

// SQL インジェクションの守り（SQL は「?」で値を渡し、組み立ててよい名前は sql_guard のテストで縛る）。
// 万一すり抜けても被害を小さくするため、アプリで使わない危ない操作を DB の側でも止める
pub fn harden(conn: &Connection) {
    // DB の構造を直に書き換える操作（writable_schema など）を止め、DB の中の定義からの関数の呼び出しを信じない
    conn.set_db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true)
        .expect("Failed to enable defensive mode");
    conn.set_db_config(DbConfig::SQLITE_DBCONFIG_TRUSTED_SCHEMA, false)
        .expect("Failed to disable trusted schema");
    conn.authorizer(Some(authorize));
}

// 使っている途中でも壊れない DB の写しを path に作る（バックアップ・サーバーの更新の前の写し）。
// VACUUM INTO は中で ATTACH を使うので、この間だけ authorize を外す（SQL は決まった文で、写し先は「?」で渡す）
pub fn vacuum_into(conn: &Connection, path: &std::path::Path) -> rusqlite::Result<usize> {
    conn.authorizer(None::<fn(AuthContext<'_>) -> Authorization>);
    let result = conn.execute("VACUUM INTO ?1", [path.to_string_lossy().to_string()]);
    conn.authorizer(Some(authorize));
    result
}

// ほかのファイルを DB としてつなぐ（ATTACH。好きな場所にファイルを作れてしまう）・拡張の読み込みを断る
fn authorize(context: AuthContext<'_>) -> Authorization {
    match context.action {
        AuthAction::Attach { .. } | AuthAction::Detach { .. } => Authorization::Deny,
        // つなぐ先の名前を「?」で渡したときは名前が無く、種類の番号だけで届く
        AuthAction::Unknown { code, .. }
            if code == rusqlite::ffi::SQLITE_ATTACH || code == rusqlite::ffi::SQLITE_DETACH =>
        {
            Authorization::Deny
        }
        AuthAction::Function { function_name }
            if function_name.eq_ignore_ascii_case("load_extension") =>
        {
            Authorization::Deny
        }
        AuthAction::Pragma { pragma_name, .. }
            if pragma_name.eq_ignore_ascii_case("writable_schema") =>
        {
            Authorization::Deny
        }
        _ => Authorization::Allow,
    }
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

    #[test]
    fn hardened_connection_refuses_dangerous_statements() {
        let dir = std::env::temp_dir().join(format!("ari-docs-harden-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let conn = Connection::open(dir.join("a.db")).unwrap();
        harden(&conn);
        conn.execute_batch("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('x');")
            .unwrap();
        let other = dir.join("other.db").to_string_lossy().to_string();
        assert!(
            conn.execute("ATTACH DATABASE ?1 AS other", [&other])
                .is_err()
        );
        assert!(!std::path::Path::new(&other).exists());
        assert!(conn.execute_batch("PRAGMA writable_schema = ON").is_err());
        assert!(
            conn.query_row("SELECT load_extension('x')", [], |_| Ok(()))
                .is_err()
        );
        // 1 回に 1 つの命令だけ（「'; DROP TABLE t; --」のような続けての命令は実行しない）
        assert!(
            conn.execute("INSERT INTO t VALUES ('a'); DROP TABLE t", [])
                .is_err()
        );
        // バックアップ・サーバーの更新で使う写し（VACUUM INTO）は使える
        let copy = dir.join("copy.db");
        assert!(
            conn.execute("VACUUM INTO ?1", [copy.to_string_lossy().to_string()])
                .is_err()
        );
        vacuum_into(&conn, &copy).unwrap();
        assert!(copy.exists());
        // 写しのあとも守りは戻っている
        assert!(
            conn.execute("ATTACH DATABASE ?1 AS other", [&other])
                .is_err()
        );
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM t", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
        // Windows は開いたままの DB のファイルを消せないので、先に閉じる
        drop(conn);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
