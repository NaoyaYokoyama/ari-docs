use rusqlite::{Connection, OptionalExtension, Result};

// 管理者が決める設定（system_setting）。無ければ None
pub fn find(conn: &Connection, key: &str) -> Result<Option<String>> {
    conn.query_row(
        "SELECT value FROM system_setting WHERE key = ?1",
        [key],
        |row| row.get(0),
    )
    .optional()
}

pub fn upsert(conn: &Connection, key: &str, value: &str) -> Result<usize> {
    let sql = "
        INSERT INTO system_setting (
          key,
          value
        )
        VALUES (
          ?1,
          ?2
        )
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
        ";
    conn.execute(sql, [key, value])
}
