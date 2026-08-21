use rusqlite::{Connection, Result};

use crate::model::user::User;

pub fn update_display_name(conn: &Connection, user_id: &str, display_name: &str) -> Result<usize> {
    conn.execute(
        "
        UPDATE
          user
        SET
          display_name = ?2
        WHERE user_id = ?1
        ",
        [user_id, display_name],
    )
}

pub fn update_password(conn: &Connection, user_id: &str, password: &str) -> Result<usize> {
    conn.execute(
        "
        UPDATE
          user
        SET
          password = ?2
        WHERE user_id = ?1
        ",
        [user_id, password],
    )
}
