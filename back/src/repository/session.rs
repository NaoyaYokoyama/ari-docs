use rusqlite::{Connection, OptionalExtension, Result, params};

// 有効期限（日数）・ロックの回数と分数は管理者が決める（service/server_settings.rs。FN0902）

pub fn create(conn: &Connection, session_id: &str, user_id: &str, client: &str) -> Result<usize> {
    conn.execute(
        "INSERT INTO session (session_id, user_id, client) VALUES (?1, ?2, ?3)",
        [session_id, user_id, client],
    )
}

// ログイン中の端末（設定画面。FN0101-BR15）
// key はトークンを画面に出さないための番号（rowid）
pub struct SessionRow {
    pub key: i64,
    pub session_id: String,
    pub client: String,
    pub created_at: String,
    pub last_used_at: String,
}

// 本人の有効なセッション。最後に使った順
pub fn find_by_user(conn: &Connection, user_id: &str, days: i64) -> Result<Vec<SessionRow>> {
    let mut stmt = conn.prepare(
        "SELECT rowid, session_id, client, created_at, last_used_at FROM session WHERE user_id = ?1 AND last_used_at > datetime('now', '-' || ?2 || ' days') ORDER BY last_used_at DESC",
    )?;
    stmt.query_map(params![user_id, days], |row| {
        Ok(SessionRow {
            key: row.get(0)?,
            session_id: row.get(1)?,
            client: row.get(2)?,
            created_at: row.get(3)?,
            last_used_at: row.get(4)?,
        })
    })?
    .collect()
}

// 有効なセッションのユーザー ID。使った日時を更新する（書き込みを減らすため 1 時間に 1 回）
pub fn find_user_id(conn: &Connection, session_id: &str, days: i64) -> Result<Option<String>> {
    let user_id: Option<String> = conn
        .query_row(
            "SELECT user_id FROM session WHERE session_id = ?1 AND last_used_at > datetime('now', '-' || ?2 || ' days')",
            params![session_id, days],
            |row| row.get(0),
        )
        .optional()?;
    if user_id.is_some() {
        conn.execute(
            "UPDATE session SET last_used_at = CURRENT_TIMESTAMP WHERE session_id = ?1 AND last_used_at < datetime('now', '-1 hours')",
            [session_id],
        )?;
    }
    Ok(user_id)
}

pub fn delete(conn: &Connection, session_id: &str) -> Result<usize> {
    conn.execute("DELETE FROM session WHERE session_id = ?1", [session_id])
}

pub fn delete_by_user(conn: &Connection, user_id: &str) -> Result<usize> {
    conn.execute("DELETE FROM session WHERE user_id = ?1", [user_id])
}

// 本人のほかのセッション（パスワードを変えたとき、ほかの PC をログアウトさせる）
pub fn delete_others(conn: &Connection, user_id: &str, keep: &str) -> Result<usize> {
    conn.execute(
        "DELETE FROM session WHERE user_id = ?1 AND session_id <> ?2",
        [user_id, keep],
    )
}

// 本人の 1 つのセッション（ほかの端末をログアウトさせる）
pub fn delete_own(conn: &Connection, user_id: &str, key: i64) -> Result<usize> {
    conn.execute(
        "DELETE FROM session WHERE user_id = ?1 AND rowid = ?2",
        params![user_id, key],
    )
}

pub fn delete_expired(conn: &Connection, days: i64) -> Result<usize> {
    conn.execute(
        "DELETE FROM session WHERE last_used_at <= datetime('now', '-' || ?1 || ' days')",
        [days],
    )
}

// ロック中か（?2 はロックする分数）。ロックした日時（updated_at）から ?2 分を過ぎていればロックしていない
const LOCKED: &str = "locked_until > datetime('now') AND datetime(updated_at, '+' || ?2 || ' minutes') > datetime('now')";

// ロック中なら終わりの日時（UTC）を返す。ロックした日時（updated_at）から lock_minutes 分を過ぎていればロックしていない
// （管理者がロックの時間を短くしたら、ロック中の人にもすぐ効くように。長くしても今のロックは延ばさない）
pub fn locked_until(conn: &Connection, user_id: &str, lock_minutes: i64) -> Result<Option<String>> {
    conn.query_row(
        &format!("SELECT locked_until FROM login_failure WHERE user_id = ?1 AND {LOCKED}"),
        params![user_id, lock_minutes],
        |row| row.get(0),
    )
    .optional()
}

// 失敗を数える。max_failures 回目で lock_minutes 分ロックし、数え直す
pub fn record_failure(
    conn: &Connection,
    user_id: &str,
    max_failures: i64,
    lock_minutes: i64,
) -> Result<()> {
    conn.execute(
        &"
        INSERT INTO login_failure (user_id, failures) VALUES (?1, 1)
        ON CONFLICT(user_id) DO UPDATE SET
          failures = CASE WHEN {LOCKED} THEN failures ELSE failures + 1 END,
          -- ロック中は updated_at（ロックした日時）を動かさない
          updated_at = CASE WHEN {LOCKED} THEN updated_at ELSE CURRENT_TIMESTAMP END
        "
        .replace("{LOCKED}", LOCKED),
        params![user_id, lock_minutes],
    )?;
    conn.execute(
        "
        UPDATE login_failure SET
          failures = 0,
          locked_until = datetime('now', '+' || ?2 || ' minutes')
        WHERE user_id = ?1 AND failures >= ?3
        ",
        params![user_id, lock_minutes, max_failures],
    )?;
    Ok(())
}

pub fn clear_failures(conn: &Connection, user_id: &str) -> Result<usize> {
    conn.execute("DELETE FROM login_failure WHERE user_id = ?1", [user_id])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connect() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../data/migration/T011_create_session.sql"))
            .unwrap();
        conn.execute_batch(include_str!(
            "../data/migration/T015_add_session_client.sql"
        ))
        .unwrap();
        conn
    }

    #[test]
    fn session_expires_after_days() {
        let conn = connect();
        create(&conn, "s1", "taro", "").unwrap();
        assert_eq!(find_user_id(&conn, "s1", 30).unwrap().unwrap(), "taro");
        conn.execute(
            "UPDATE session SET last_used_at = datetime('now', '-31 days')",
            [],
        )
        .unwrap();
        assert!(find_user_id(&conn, "s1", 30).unwrap().is_none());
        // 期限を延ばせば切れていない
        assert_eq!(delete_expired(&conn, 60).unwrap(), 0);
        assert_eq!(delete_expired(&conn, 30).unwrap(), 1);
    }

    #[test]
    fn locks_after_max_failures() {
        let conn = connect();
        for _ in 0..2 {
            record_failure(&conn, "taro", 3, 15).unwrap();
        }
        assert!(locked_until(&conn, "taro", 15).unwrap().is_none());
        record_failure(&conn, "taro", 3, 15).unwrap();
        assert!(locked_until(&conn, "taro", 15).unwrap().is_some());
        // ロックの時間を短くすると、今のロックにもすぐ効く
        conn.execute(
            "UPDATE login_failure SET updated_at = datetime('now', '-5 minutes')",
            [],
        )
        .unwrap();
        assert!(locked_until(&conn, "taro", 15).unwrap().is_some());
        assert!(locked_until(&conn, "taro", 3).unwrap().is_none());
        // ロックが解けたあとの失敗は、元のロックの終わりより前でも数える
        for _ in 0..3 {
            record_failure(&conn, "taro", 3, 3).unwrap();
        }
        assert!(locked_until(&conn, "taro", 3).unwrap().is_some());
        clear_failures(&conn, "taro").unwrap();
        assert!(locked_until(&conn, "taro", 15).unwrap().is_none());
    }

    #[test]
    fn find_by_user_and_delete_own() {
        let conn = connect();
        create(&conn, "s1", "taro", "Windows").unwrap();
        create(&conn, "s2", "taro", "Linux").unwrap();
        create(&conn, "s3", "hanako", "").unwrap();
        assert_eq!(find_by_user(&conn, "taro", 30).unwrap().len(), 2);
        let key = |id: &str| -> i64 {
            conn.query_row(
                "SELECT rowid FROM session WHERE session_id = ?1",
                [id],
                |row| row.get(0),
            )
            .unwrap()
        };
        // ほかの人のセッションは消せない
        assert_eq!(delete_own(&conn, "taro", key("s3")).unwrap(), 0);
        assert_eq!(delete_own(&conn, "taro", key("s2")).unwrap(), 1);
        let rows = find_by_user(&conn, "taro", 30).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].client, "Windows");
    }
}
