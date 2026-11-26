use rusqlite::{Connection, Result, params};

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
            admin_elsewhere: false,
        })
    })
}

// ローカルモードで使うユーザー local が無ければ作る（パスワードはローカルモードでは使わない）
pub fn ensure_local_user(conn: &Connection) -> Result<usize> {
    let sql = "
        INSERT OR IGNORE INTO user (
          user_id,
          passwd,
          display_name,
          role_id
        )
        VALUES (
          'local',
          '-',
          'ローカルユーザー',
          '1'
        )
        ";
    conn.execute(sql, [])
}

// 共有モードのユーザー数（ローカルモードのユーザー local は数えない）
pub fn count_users(conn: &Connection) -> Result<i64> {
    let sql = "
        SELECT
          COUNT(*)
        FROM user
        WHERE user_id <> 'local'
        ";
    conn.query_row(sql, [], |row| row.get(0))
}

// ユーザーの一覧（ユーザー local を除く。ユーザーID の昇順）
pub fn find_all(conn: &Connection) -> Result<Vec<User>> {
    let sql = "
        SELECT
            user_id,
            passwd,
            display_name,
            role_id,
            updated_at
        FROM user
        WHERE user_id <> 'local'
        ORDER BY user_id ASC
        ";
    let mut stmt = conn.prepare(sql)?;
    stmt.query_map([], |row| {
        Ok(User {
            user_id: row.get(0)?,
            passwd: row.get(1)?,
            display_name: row.get(2)?,
            role_id: row.get(3)?,
            updated_at: row.get(4)?,
            admin_elsewhere: false,
        })
    })?
    .collect()
}

// 同じユーザーID があれば登録せず 0 を返す
pub fn create_user(
    conn: &Connection,
    user_id: &str,
    password_hash: &str,
    display_name: &str,
    role_id: &str,
) -> Result<usize> {
    let sql = "
        INSERT OR IGNORE INTO user (
          user_id,
          passwd,
          display_name,
          role_id
        )
        VALUES (
          ?1,
          ?2,
          ?3,
          ?4
        )
        ";
    conn.execute(sql, params![user_id, password_hash, display_name, role_id])
}

// ユーザーが 1 人もいないときだけ登録する（同時に 2 人が最初の管理者になるのを防ぐため 1 つの SQL で行う）
pub fn create_first_user(
    conn: &Connection,
    user_id: &str,
    password_hash: &str,
    display_name: &str,
    role_id: &str,
) -> Result<usize> {
    let sql = "
        INSERT INTO user (
          user_id,
          passwd,
          display_name,
          role_id
        )
        SELECT
          ?1,
          ?2,
          ?3,
          ?4
        WHERE NOT EXISTS (
          SELECT 1 FROM user WHERE user_id <> 'local'
        )
        ";
    conn.execute(sql, params![user_id, password_hash, display_name, role_id])
}

// ユーザーと、そのユーザーだけのデータ（Note・お気に入り・設定・検索の対象外）を削除する。Wiki は共有のため残す
// 管理者・利用者を切り替える（ユーザー local は対象外）
pub fn update_role(conn: &Connection, user_id: &str, role_id: &str) -> Result<usize> {
    conn.execute(
        "UPDATE user SET role_id = ?2, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?1 AND user_id <> 'local'",
        [user_id, role_id],
    )
}

pub fn delete_user(conn: &Connection, user_id: &str) -> Result<usize> {
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM favorite WHERE user_id = ?1 OR note_id IN (SELECT note_id FROM note WHERE user_id = ?1)",
        [user_id],
    )?;
    tx.execute(
        "DELETE FROM content_history WHERE kind = 'note' AND content_id IN (SELECT note_id FROM note WHERE user_id = ?1)",
        [user_id],
    )?;
    // Note のフォルダと入れ場所（FN0403）。Wiki のフォルダは残す
    tx.execute(
        "DELETE FROM content_folder_item WHERE kind = 'note' AND item_id IN (SELECT note_id FROM note WHERE user_id = ?1)",
        [user_id],
    )?;
    tx.execute(
        "DELETE FROM content_folder WHERE kind = 'note' AND user_id = ?1",
        [user_id],
    )?;
    tx.execute("DELETE FROM note WHERE user_id = ?1", [user_id])?;
    tx.execute("DELETE FROM user_setting WHERE user_id = ?1", [user_id])?;
    // 本人だけの検索の対象外（FN0202-BR17）
    tx.execute("DELETE FROM search_exclusion WHERE user_id = ?1", [user_id])?;
    tx.execute("DELETE FROM trash_favorite WHERE user_id = ?1", [user_id])?;
    tx.execute("DELETE FROM user_permission WHERE user_id = ?1", [user_id])?;
    tx.execute("DELETE FROM admin_device WHERE user_id = ?1", [user_id])?;
    // その人のファイルのロックは外す（FN0301-BR38）
    tx.execute("DELETE FROM node_lock WHERE user_id = ?1", [user_id])?;
    // その人のタスク（FN0602）
    tx.execute("DELETE FROM task WHERE user_id = ?1", [user_id])?;
    let result = tx.execute("DELETE FROM user WHERE user_id = ?1", [user_id])?;
    tx.commit()?;
    Ok(result)
}
