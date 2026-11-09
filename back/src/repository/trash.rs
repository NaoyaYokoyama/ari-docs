use rusqlite::{Connection, OptionalExtension, Result, params};

pub struct TrashItem {
    pub trash_id: String,
    pub original_path: String,
    pub name: String,
    pub node_type: String,
    pub size: i64,
    // 削除したユーザーの表示名（ユーザーが消えていればユーザー ID）
    pub deleted_by: String,
    pub deleted_at: String,
}

const SELECT: &str = "
    SELECT
      trash.trash_id,
      trash.original_path,
      trash.name,
      trash.node_type,
      trash.size,
      COALESCE(user.display_name, trash.deleted_by),
      trash.deleted_at
    FROM
      trash
      LEFT JOIN user ON user.user_id = trash.deleted_by
    ";

fn map(row: &rusqlite::Row) -> Result<TrashItem> {
    Ok(TrashItem {
        trash_id: row.get(0)?,
        original_path: row.get(1)?,
        name: row.get(2)?,
        node_type: row.get(3)?,
        size: row.get(4)?,
        deleted_by: row.get(5)?,
        deleted_at: row.get(6)?,
    })
}

// 新しく削除したものから
pub fn find_all(conn: &Connection) -> Result<Vec<TrashItem>> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} ORDER BY trash.deleted_at DESC, trash.trash_id DESC"
    ))?;
    stmt.query_map([], map)?.collect()
}

pub fn find_by_id(conn: &Connection, trash_id: &str) -> Result<Option<TrashItem>> {
    conn.query_row(
        &format!("{SELECT} WHERE trash.trash_id = ?1"),
        [trash_id],
        map,
    )
    .optional()
}

// 保存期間を過ぎたもの
pub fn find_older_than(conn: &Connection, days: i64) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT trash_id FROM trash WHERE deleted_at < datetime('now', '-' || ?1 || ' days')",
    )?;
    stmt.query_map([days], |row| row.get(0))?.collect()
}

pub fn create(
    conn: &Connection,
    trash_id: &str,
    original_path: &str,
    name: &str,
    node_type: &str,
    size: i64,
    deleted_by: &str,
) -> Result<usize> {
    let sql = "
        INSERT INTO trash (
          trash_id,
          original_path,
          name,
          node_type,
          size,
          deleted_by
        )
        VALUES (
          ?1,
          ?2,
          ?3,
          ?4,
          ?5,
          ?6
        )
        ";
    conn.execute(
        sql,
        params![trash_id, original_path, name, node_type, size, deleted_by],
    )
}

pub fn delete(conn: &Connection, trash_id: &str) -> Result<usize> {
    conn.execute("DELETE FROM trash WHERE trash_id = ?1", [trash_id])
}
