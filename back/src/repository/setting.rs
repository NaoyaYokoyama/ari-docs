use rusqlite::{Connection, OptionalExtension, Result};

pub fn update_display_name(conn: &Connection, user_id: &str, display_name: &str) -> Result<usize> {
    let sql = "
        UPDATE
          user
        SET
          display_name = ?2
        WHERE user_id = ?1
        ";
    conn.execute(sql, [user_id, display_name])
}

pub fn update_password(conn: &Connection, user_id: &str, password: &str) -> Result<usize> {
    let sql = "
        UPDATE
          user
        SET
          passwd = ?2
        WHERE user_id = ?1
        ";
    conn.execute(sql, [user_id, password])
}

// Docs の初期フォルダ。未設定なら空文字
pub fn find_docs_root(conn: &Connection, user_id: &str) -> Result<String> {
    let sql = "
        SELECT
          docs_root
        FROM
          user_setting
        WHERE user_id = ?1
        ";
    conn.query_row(sql, [user_id], |row| row.get(0))
        .optional()
        .map(Option::unwrap_or_default)
}

pub fn upsert_docs_root(conn: &Connection, user_id: &str, docs_root: &str) -> Result<usize> {
    let sql = "
        INSERT INTO user_setting (
          user_id,
          docs_root
        )
        VALUES (
          ?1,
          ?2
        )
        ON CONFLICT (user_id) DO UPDATE SET
          docs_root = excluded.docs_root,
          updated_at = CURRENT_TIMESTAMP
        ";
    conn.execute(sql, [user_id, docs_root])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connect() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!(
            "../data/migration/T008_create_user_setting.sql"
        ))
        .unwrap();
        conn
    }

    #[test]
    fn find_docs_root_returns_empty_when_not_saved() {
        let conn = connect();
        assert_eq!(find_docs_root(&conn, "local").unwrap(), "");
    }

    #[test]
    fn upsert_docs_root_inserts_then_updates() {
        let conn = connect();
        upsert_docs_root(&conn, "local", "/a").unwrap();
        assert_eq!(find_docs_root(&conn, "local").unwrap(), "/a");
        upsert_docs_root(&conn, "local", "/b").unwrap();
        assert_eq!(find_docs_root(&conn, "local").unwrap(), "/b");
        upsert_docs_root(&conn, "local", "").unwrap();
        assert_eq!(find_docs_root(&conn, "local").unwrap(), "");
    }
}
