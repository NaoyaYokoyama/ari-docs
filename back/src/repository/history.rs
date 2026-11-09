use rusqlite::{Connection, OptionalExtension, Result, params};

pub struct History {
    pub history_id: i64,
    pub kind: String,
    pub content_id: String,
    pub title: String,
    pub content: String,
    // 保存したユーザーの表示名（ユーザーが消えていればユーザー ID）
    pub updated_by: String,
    pub saved_at: String,
}

const SELECT: &str = "
    SELECT
      content_history.history_id,
      content_history.kind,
      content_history.content_id,
      content_history.title,
      content_history.content,
      COALESCE(user.display_name, content_history.updated_by),
      content_history.saved_at
    FROM
      content_history
      LEFT JOIN user ON user.user_id = content_history.updated_by
    ";

fn map(row: &rusqlite::Row) -> Result<History> {
    Ok(History {
        history_id: row.get(0)?,
        kind: row.get(1)?,
        content_id: row.get(2)?,
        title: row.get(3)?,
        content: row.get(4)?,
        updated_by: row.get(5)?,
        saved_at: row.get(6)?,
    })
}

pub fn exists(conn: &Connection, kind: &str, content_id: &str) -> Result<bool> {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM content_history WHERE kind = ?1 AND content_id = ?2)",
        [kind, content_id],
        |row| row.get(0),
    )
}

// 版を残し、keep 件を超えた古いものを消す（keep は管理者が決める。FN0902）
pub fn add(
    conn: &Connection,
    kind: &str,
    content_id: &str,
    title: &str,
    content: &str,
    updated_by: &str,
    saved_at: &str,
    keep: i64,
) -> Result<()> {
    conn.execute(
        "INSERT INTO content_history (kind, content_id, title, content, updated_by, saved_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        [kind, content_id, title, content, updated_by, saved_at],
    )?;
    conn.execute(
        "
        DELETE FROM content_history
        WHERE kind = ?1 AND content_id = ?2 AND history_id NOT IN (
          SELECT history_id FROM content_history
          WHERE kind = ?1 AND content_id = ?2
          ORDER BY history_id DESC
          LIMIT ?3
        )
        ",
        params![kind, content_id, keep],
    )?;
    Ok(())
}

// 新しい版から
pub fn find_by_content(conn: &Connection, kind: &str, content_id: &str) -> Result<Vec<History>> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE content_history.kind = ?1 AND content_history.content_id = ?2 ORDER BY content_history.history_id DESC"
    ))?;
    stmt.query_map([kind, content_id], map)?.collect()
}

pub fn find_by_id(conn: &Connection, history_id: i64) -> Result<Option<History>> {
    conn.query_row(
        &format!("{SELECT} WHERE content_history.history_id = ?1"),
        [history_id],
        map,
    )
    .optional()
}

pub fn delete_by_content(conn: &Connection, kind: &str, content_id: &str) -> Result<usize> {
    conn.execute(
        "DELETE FROM content_history WHERE kind = ?1 AND content_id = ?2",
        [kind, content_id],
    )
}
