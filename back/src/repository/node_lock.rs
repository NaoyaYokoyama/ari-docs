use rusqlite::{Connection, OptionalExtension, Result, params};
use std::collections::HashMap;

// ファイルのロック（FN0301-BR38）。期限（UNIX 秒）を過ぎたものは無いものとして扱う

#[derive(Debug, Clone, PartialEq)]
pub struct Lock {
    pub path: String,
    pub user_id: String,
    pub display_name: String,
    pub expires_at: i64,
}

// path のロックか、path がフォルダならその中のロック。ロックした人の名前（ユーザーが消えていれば外れたものとする）
const SELECT: &str = "
    SELECT
      node.path,
      node_lock.user_id,
      user.display_name,
      node_lock.expires_at
    FROM
      node_lock
      JOIN node ON node.node_id = node_lock.node_id
      JOIN user ON user.user_id = node_lock.user_id
    WHERE
      node_lock.expires_at > ?2
";

fn to_lock(row: &rusqlite::Row) -> Result<Lock> {
    Ok(Lock {
        path: row.get(0)?,
        user_id: row.get(1)?,
        display_name: row.get(2)?,
        expires_at: row.get(3)?,
    })
}

// path そのもののロック
pub fn find_by_path(conn: &Connection, path: &str, now: i64) -> Result<Option<Lock>> {
    conn.query_row(
        &format!("{SELECT} AND node.path = ?1"),
        params![path, now],
        to_lock,
    )
    .optional()
}

// path か、その中（フォルダのとき）で、user_id 以外の人がロックしているもの（1 つ）。
// LIKE だと名前の % や _ がワイルドカードになるため、先頭一致は substr で比べる
pub fn find_blocking(
    conn: &Connection,
    path: &str,
    user_id: &str,
    now: i64,
) -> Result<Option<Lock>> {
    conn.query_row(
        &format!(
            "{SELECT} AND node_lock.user_id <> ?3
               AND (node.path = ?1 OR substr(node.path, 1, length(?1) + 1) = ?1 || '/')
             ORDER BY node.path LIMIT 1"
        ),
        params![path, now, user_id],
        to_lock,
    )
    .optional()
}

// 一覧に出すロック（パスごと）
pub fn find_by_paths(
    conn: &Connection,
    paths: &[String],
    now: i64,
) -> Result<HashMap<String, Lock>> {
    let mut result = HashMap::new();
    let mut stmt = conn.prepare(&format!("{SELECT} AND node.path = ?1"))?;
    for path in paths {
        if let Some(lock) = stmt.query_row(params![path, now], to_lock).optional()? {
            result.insert(path.clone(), lock);
        }
    }
    Ok(result)
}

pub fn upsert(
    conn: &Connection,
    node_id: &str,
    user_id: &str,
    now: i64,
    expires_at: i64,
) -> Result<usize> {
    conn.execute(
        "INSERT INTO node_lock (node_id, user_id, locked_at, expires_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (node_id) DO UPDATE SET user_id = ?2, locked_at = ?3, expires_at = ?4",
        params![node_id, user_id, now, expires_at],
    )
}

pub fn delete_by_path(conn: &Connection, path: &str) -> Result<usize> {
    conn.execute(
        "DELETE FROM node_lock WHERE node_id IN (SELECT node_id FROM node WHERE path = ?1)",
        [path],
    )
}

// 期限の過ぎたもの・指すノードの無くなったものを消す
pub fn delete_stale(conn: &Connection, now: i64) -> Result<usize> {
    conn.execute(
        "DELETE FROM node_lock WHERE expires_at <= ?1 OR node_id NOT IN (SELECT node_id FROM node)",
        [now],
    )
}
