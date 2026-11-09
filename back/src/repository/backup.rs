use rusqlite::{Connection, OptionalExtension, Result, params};

pub struct Backup {
    pub backup_id: String,
    pub file_name: String,
    pub dir: String,
    pub size: i64,
    pub kind: String,
    // 作ったユーザーの表示名（定期は system）
    pub created_by: String,
    pub created_at: String,
}

const SELECT: &str = "
    SELECT
      backup.backup_id,
      backup.file_name,
      backup.dir,
      backup.size,
      backup.kind,
      COALESCE(user.display_name, backup.created_by),
      backup.created_at
    FROM
      backup
      LEFT JOIN user ON user.user_id = backup.created_by
    ";

fn map(row: &rusqlite::Row) -> Result<Backup> {
    Ok(Backup {
        backup_id: row.get(0)?,
        file_name: row.get(1)?,
        dir: row.get(2)?,
        size: row.get(3)?,
        kind: row.get(4)?,
        created_by: row.get(5)?,
        created_at: row.get(6)?,
    })
}

// 新しいものから
pub fn find_all(conn: &Connection) -> Result<Vec<Backup>> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} ORDER BY backup.created_at DESC, backup.backup_id DESC"
    ))?;
    stmt.query_map([], map)?.collect()
}

pub fn find_by_id(conn: &Connection, backup_id: &str) -> Result<Option<Backup>> {
    conn.query_row(
        &format!("{SELECT} WHERE backup.backup_id = ?1"),
        [backup_id],
        map,
    )
    .optional()
}

// 定期のバックアップで、その期間のものがあるか
pub fn exists_period(conn: &Connection, period: &str) -> Result<bool> {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM backup WHERE kind = 'auto' AND period = ?1)",
        [period],
        |row| row.get(0),
    )
}

// 保存期間を過ぎた定期・復元前のバックアップ（手動のものは消さない）
pub fn find_expired(conn: &Connection, days: i64) -> Result<Vec<Backup>> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE backup.kind <> 'manual' AND backup.created_at < datetime('now', '-' || ?1 || ' days')"
    ))?;
    stmt.query_map([days], map)?.collect()
}

#[allow(clippy::too_many_arguments)]
pub fn create(
    conn: &Connection,
    backup_id: &str,
    file_name: &str,
    dir: &str,
    size: i64,
    kind: &str,
    period: &str,
    created_by: &str,
) -> Result<usize> {
    let sql = "
        INSERT INTO backup (
          backup_id,
          file_name,
          dir,
          size,
          kind,
          period,
          created_by
        )
        VALUES (
          ?1,
          ?2,
          ?3,
          ?4,
          ?5,
          ?6,
          ?7
        )
        ";
    conn.execute(
        sql,
        params![backup_id, file_name, dir, size, kind, period, created_by],
    )
}

pub fn delete(conn: &Connection, backup_id: &str) -> Result<usize> {
    conn.execute("DELETE FROM backup WHERE backup_id = ?1", [backup_id])
}
