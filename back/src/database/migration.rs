use std::{
    fs,
    path::{Path, PathBuf},
};

use std::collections::HashSet;

use rusqlite::Connection;

const MIGRATION_DIR: &str = "src/data/migration";

pub fn migrate(conn: &Connection) {
    println!("=== Migration Start ===");

    let files = load_migration_files();

    ensure_schema_migration_table(conn, &files);

    let applied = load_applied_migrations(conn);

    execute_pending_migrations(conn, &files, &applied);

    println!("=== Migration Complete ===");
}

fn load_migration_files() -> Vec<PathBuf> {
    let mut files = Vec::new();
    println!("current dir = {:?}", std::env::current_dir().unwrap());

    let entries = fs::read_dir(MIGRATION_DIR).expect("Failed to read migration directory");

    for entry in entries {
        let path = entry.unwrap().path();

        if path.is_file() && path.extension().is_some_and(|ext| ext == "sql") {
            files.push(path);
        }
    }

    files.sort();

    files
}

fn ensure_schema_migration_table(conn: &Connection, files: &[PathBuf]) {
    if schema_migration_exists(conn) {
        return;
    }

    println!("Create schema_migration table");

    let first = files
        .iter()
        .find(|f| f.file_name().unwrap().to_string_lossy().starts_with("T001"))
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

fn execute_sql_file(conn: &Connection, path: &Path) {
    println!("Execute {}", path.file_name().unwrap().to_string_lossy());

    let sql = fs::read_to_string(path).expect("Failed to read sql");

    conn.execute_batch(&sql)
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

fn execute_pending_migrations(conn: &Connection, files: &[PathBuf], applied: &HashSet<String>) {
    for file in files {
        let name = file.file_stem().unwrap().to_string_lossy().to_string();

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
