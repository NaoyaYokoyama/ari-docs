use rusqlite::{Connection, Result};

use crate::model::user::User;

pub fn find_by_user_id(conn: &Connection, user_id: &str) -> Result<User> {
    let sql = "
        SELECT
            user_id,
            passwd,
            display_name,
            role_id,
            updated_at
        FROM user
        WHERE user_id = ?1
        ";
    conn.query_row(sql, [user_id], |row| {
        Ok(User {
            user_id: row.get(0)?,
            passwd: row.get(1)?,
            display_name: row.get(2)?,
            role_id: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })
}
