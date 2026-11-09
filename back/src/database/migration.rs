use std::collections::HashSet;

use rusqlite::Connection;
use rust_embed::RustEmbed;

// マイグレーションの SQL は実行ファイルに埋め込む（配布先に src/ が無くても動くように）
#[derive(RustEmbed)]
#[folder = "src/data/migration"]
struct Migrations;

pub fn migrate(conn: &Connection) {
    println!("=== Migration Start ===");

    let files = load_migration_files();

    ensure_schema_migration_table(conn, &files);

    let applied = load_applied_migrations(conn);

    execute_pending_migrations(conn, &files, &applied);

    println!("=== Migration Complete ===");
}

// ファイル名（例: T001_create_schema_migration.sql）を番号順に返す
fn load_migration_files() -> Vec<String> {
    let mut files: Vec<String> = Migrations::iter().map(|file| file.to_string()).collect();
    files.sort();
    files
}

fn ensure_schema_migration_table(conn: &Connection, files: &[String]) {
    if schema_migration_exists(conn) {
        return;
    }

    println!("Create schema_migration table");

    let first = files
        .iter()
        .find(|f| f.starts_with("T001"))
        .expect("T001 migration not found");

    execute_sql_file(conn, first);
}

fn schema_migration_exists(conn: &Connection) -> bool {
    let sql = "
        SELECT COUNT(*)
        FROM sqlite_master
        WHERE type='table'
          AND name='schema_migration'
    ";

    let count: i64 = conn.query_row(sql, [], |row| row.get(0)).unwrap();

    count > 0
}

fn execute_sql_file(conn: &Connection, name: &str) {
    println!("Execute {}", name);

    let file = Migrations::get(name).expect("Failed to read sql");
    let sql = std::str::from_utf8(&file.data).expect("Failed to read sql");

    conn.execute_batch(sql)
        .expect("Failed to execute migration");
}

fn load_applied_migrations(conn: &Connection) -> HashSet<String> {
    let mut stmt = conn
        .prepare(
            "SELECT migration_name
             FROM schema_migration",
        )
        .unwrap();

    let rows = stmt.query_map([], |row| row.get::<_, String>(0)).unwrap();

    rows.map(Result::unwrap).collect()
}

fn execute_pending_migrations(conn: &Connection, files: &[String], applied: &HashSet<String>) {
    for file in files {
        let name = file.trim_end_matches(".sql").to_string();

        if applied.contains(&name) {
            continue;
        }

        execute_sql_file(conn, file);

        register_migration(conn, &name);
    }
}

fn register_migration(conn: &Connection, name: &str) {
    conn.execute(
        "
        INSERT INTO schema_migration
        (
            migration_name
        )
        VALUES
        (
            ?
        )
        ",
        [name],
    )
    .unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::user as user_repo;

    fn tables(conn: &Connection) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .unwrap();
        stmt.query_map([], |row| row.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect()
    }

    #[test]
    fn migrate_creates_all_tables_from_embedded_sql() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn);
        assert_eq!(
            tables(&conn),
            [
                "backup",
                "content_folder",
                "content_folder_item",
                "content_history",
                "content_image",
                "favorite",
                "keyword",
                "login_failure",
                "node",
                "node_content",
                "node_keyword",
                "note",
                "role",
                "schema_migration",
                "search_dictionary",
                "session",
                "system_setting",
                "trash",
                "user",
                "user_setting",
                "wiki"
            ]
        );
        // 2 回目は何も実行しない（適用済み）
        migrate(&conn);
        let applied: i64 = conn
            .query_row("SELECT COUNT(*) FROM schema_migration", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(applied as usize, load_migration_files().len());
    }

    #[test]
    fn ensure_local_user_creates_once() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn);
        user_repo::ensure_local_user(&conn).unwrap();
        user_repo::ensure_local_user(&conn).unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM user WHERE user_id = 'local'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }
}
