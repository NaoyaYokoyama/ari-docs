use rusqlite::{Connection, Result};
use std::collections::HashMap;

// 利用者に付けた許可（FN0102-BR11。TBL0105）

pub fn exists(conn: &Connection, user_id: &str, permission: &str) -> Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM user_permission WHERE user_id = ?1 AND permission = ?2)",
        [user_id, permission],
        |row| row.get(0),
    )
}

pub fn find_by_user(conn: &Connection, user_id: &str) -> Result<Vec<String>> {
    let mut stmt = conn
        .prepare("SELECT permission FROM user_permission WHERE user_id = ?1 ORDER BY permission")?;
    let rows = stmt.query_map([user_id], |row| row.get(0))?;
    rows.collect()
}

// ユーザー ID → 許可（ユーザーの一覧に出す）
pub fn find_all(conn: &Connection) -> Result<HashMap<String, Vec<String>>> {
    let mut stmt =
        conn.prepare("SELECT user_id, permission FROM user_permission ORDER BY permission")?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get(1)?)))?;
    let mut result: HashMap<String, Vec<String>> = HashMap::new();
    for row in rows {
        let (user_id, permission) = row?;
        result.entry(user_id).or_default().push(permission);
    }
    Ok(result)
}

// そのユーザーの許可を入れ替える
pub fn replace(conn: &Connection, user_id: &str, permissions: &[&str]) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM user_permission WHERE user_id = ?1", [user_id])?;
    for permission in permissions {
        tx.execute(
            "INSERT INTO user_permission (user_id, permission) VALUES (?1, ?2)",
            [user_id, permission],
        )?;
    }
    tx.commit()
}
