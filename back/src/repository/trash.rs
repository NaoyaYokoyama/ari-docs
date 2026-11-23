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

// 容量の上限を超えた分（古いものから。FN0302-BR09）。新しいものから足していき、上限を超えたものから先を返す
pub fn find_over_capacity(conn: &Connection, max_bytes: i64) -> Result<Vec<String>> {
    let mut stmt =
        conn.prepare("SELECT trash_id, size FROM trash ORDER BY deleted_at DESC, trash_id DESC")?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?
        .collect::<Result<Vec<_>>>()?;
    let mut total = 0i64;
    Ok(rows
        .into_iter()
        .filter_map(|(id, size)| {
            total = total.saturating_add(size.max(0));
            (total > max_bytes).then_some(id)
        })
        .collect())
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

// ゴミ箱の 1 件を消す（そのお気に入りの控えも）
pub fn delete(conn: &Connection, trash_id: &str) -> Result<usize> {
    conn.execute("DELETE FROM trash_favorite WHERE trash_id = ?1", [trash_id])?;
    conn.execute(
        "DELETE FROM trash_description WHERE trash_id = ?1",
        [trash_id],
    )?;
    conn.execute("DELETE FROM trash WHERE trash_id = ?1", [trash_id])
}

// ゴミ箱へ移すものとその中のもののお気に入りを控える（FN0302-BR08）。path は folder/ からの相対パス
pub fn save_favorites(conn: &Connection, trash_id: &str, path: &str) -> Result<usize> {
    let separator = std::path::MAIN_SEPARATOR.to_string();
    conn.execute(
        "
        INSERT OR IGNORE INTO trash_favorite (trash_id, user_id, path)
        SELECT
          ?1,
          favorite.user_id,
          CASE WHEN node.path = ?2 THEN '' ELSE substr(node.path, length(?2) + 2) END
        FROM
          favorite
          JOIN node ON node.node_id = favorite.node_id
        WHERE
          node.path = ?2
          OR substr(node.path, 1, length(?2) + 1) = ?2 || '/'
          OR substr(node.path, 1, length(?2) + 1) = ?2 || ?3
        ",
        params![trash_id, path, separator],
    )
}

// 控えたお気に入り（ユーザー ID・ゴミ箱へ移したものからの相対パス）
pub fn find_favorites(conn: &Connection, trash_id: &str) -> Result<Vec<(String, String)>> {
    let mut stmt =
        conn.prepare("SELECT user_id, path FROM trash_favorite WHERE trash_id = ?1 ORDER BY path")?;
    let rows = stmt.query_map([trash_id], |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect()
}

// ゴミ箱へ移すものとその中のものの説明を控える（FN0301-BR33）。path は folder/ からの相対パス
pub fn save_descriptions(conn: &Connection, trash_id: &str, path: &str) -> Result<usize> {
    let separator = std::path::MAIN_SEPARATOR.to_string();
    conn.execute(
        "
        INSERT OR IGNORE INTO trash_description (trash_id, path, description)
        SELECT
          ?1,
          CASE WHEN path = ?2 THEN '' ELSE substr(path, length(?2) + 2) END,
          description
        FROM
          node
        WHERE
          description <> ''
          AND (
            path = ?2
            OR substr(path, 1, length(?2) + 1) = ?2 || '/'
            OR substr(path, 1, length(?2) + 1) = ?2 || ?3
          )
        ",
        params![trash_id, path, separator],
    )
}

// 控えた説明（ゴミ箱へ移したものからの相対パス・説明）
pub fn find_descriptions(conn: &Connection, trash_id: &str) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT path, description FROM trash_description WHERE trash_id = ?1 ORDER BY path",
    )?;
    let rows = stmt.query_map([trash_id], |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect()
}
