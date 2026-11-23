use rusqlite::{Connection, Result};

// 管理者の PC（FN0102-BR12。TBL0106）

pub struct AdminDevice {
    pub device_id: String,
    pub user_id: String,
    pub display_name: String,
    pub name: String,
    pub created_at: String,
    pub last_used_at: String,
    pub key_hash: String,
}

// その鍵の PC を登録しているか。登録していれば使った日時を書き換える
// （管理者の要求のたびに書かないよう、前に書いてから 1 分たったときだけ）
pub fn touch(conn: &Connection, user_id: &str, key_hash: &str) -> Result<bool> {
    let registered: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM admin_device WHERE user_id = ?1 AND key_hash = ?2)",
        [user_id, key_hash],
        |row| row.get(0),
    )?;
    if registered {
        conn.execute(
            "UPDATE admin_device SET last_used_at = CURRENT_TIMESTAMP
             WHERE user_id = ?1 AND key_hash = ?2 AND last_used_at < datetime('now', '-1 minutes')",
            [user_id, key_hash],
        )?;
    }
    Ok(registered)
}

pub fn count_by_user(conn: &Connection, user_id: &str) -> Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM admin_device WHERE user_id = ?1",
        [user_id],
        |row| row.get(0),
    )
}

pub fn count_all(conn: &Connection) -> Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM admin_device", [], |row| row.get(0))
}

// 登録する（同じ PC がもうあれば名前だけ書き換える）
pub fn insert(
    conn: &Connection,
    device_id: &str,
    user_id: &str,
    key_hash: &str,
    name: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO admin_device (device_id, user_id, key_hash, name) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (user_id, key_hash) DO UPDATE SET name = excluded.name",
        [device_id, user_id, key_hash, name],
    )?;
    Ok(())
}

pub fn find_all(conn: &Connection) -> Result<Vec<AdminDevice>> {
    let mut stmt = conn.prepare(
        "SELECT d.device_id, d.user_id, COALESCE(u.display_name, d.user_id), d.name, d.created_at, d.last_used_at, d.key_hash
         FROM admin_device d LEFT JOIN user u ON u.user_id = d.user_id
         ORDER BY d.user_id, d.created_at",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(AdminDevice {
            device_id: row.get(0)?,
            user_id: row.get(1)?,
            display_name: row.get(2)?,
            name: row.get(3)?,
            created_at: row.get(4)?,
            last_used_at: row.get(5)?,
            key_hash: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn delete(conn: &Connection, device_id: &str) -> Result<usize> {
    conn.execute("DELETE FROM admin_device WHERE device_id = ?1", [device_id])
}

pub fn delete_by_user(conn: &Connection, user_id: &str) -> Result<usize> {
    conn.execute("DELETE FROM admin_device WHERE user_id = ?1", [user_id])
}
