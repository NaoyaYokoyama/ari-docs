use rusqlite::Connection;
use std::io::{Error, ErrorKind};

use crate::common::id::generate_node_id;
use crate::repository::{node as node_repo, node_lock as lock_repo};
use crate::service::{node, server_settings};

// ファイルのロック（FN0301-BR38。Box と同じ考え方）。ロックした人のほかは、上書き・名前の変更・移動・ゴミ箱への削除ができない。
// 開く・ダウンロード・コピーはできる。期限を過ぎたら自動で外れる。管理者はいつでも外せる（共有モードだけ）

pub fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

// 画面に出す期限（この PC の時刻）
pub fn format_time(seconds: i64) -> String {
    chrono::DateTime::from_timestamp(seconds, 0)
        .map(|time| {
            time.with_timezone(&chrono::Local)
                .format("%Y/%m/%d %H:%M")
                .to_string()
        })
        .unwrap_or_default()
}

fn name_of(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

// ほかの人がロックしているものを含むなら止める（フォルダなら中のものも見る）。ロックした本人はできる
pub fn ensure_unlocked(conn: &Connection, user_id: &str, paths: &[String]) -> std::io::Result<()> {
    let now = now();
    for path in paths {
        let path = path.trim_matches('/');
        if let Some(lock) =
            lock_repo::find_blocking(conn, path, user_id, now).map_err(Error::other)?
        {
            return Err(Error::new(
                ErrorKind::ResourceBusy,
                format!(
                    "「{}」は {}さんがロックしています（{} まで）。ロックした人か管理者が外すまで、上書き・名前の変更・移動・削除はできません",
                    name_of(&lock.path),
                    lock.display_name,
                    format_time(lock.expires_at)
                ),
            ));
        }
    }
    Ok(())
}

pub enum LockError {
    Invalid(String),
    Forbidden(String),
    Busy(String),
    NotFound,
    Db(rusqlite::Error),
}

impl From<rusqlite::Error> for LockError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Db(error)
    }
}

// ロックする（期限を変えるときも）。expires_at は UNIX 秒。期限はサーバーの設定の上限まで（FN0902）
pub fn lock(
    conn: &Connection,
    folder_root: &str,
    user_id: &str,
    path: &str,
    expires_at: i64,
) -> Result<(), LockError> {
    let path = path.trim_matches('/');
    let full = node::resolve(folder_root, path).map_err(|_| LockError::NotFound)?;
    if full.is_dir() {
        return Err(LockError::Invalid(
            "フォルダはロックできません。ファイルを選んでください".into(),
        ));
    }
    if !full.is_file() {
        return Err(LockError::NotFound);
    }
    let now = now();
    let max_days = server_settings::get(conn).file_lock_max_days;
    if expires_at <= now {
        return Err(LockError::Invalid(
            "期限は今より後の日時にしてください".into(),
        ));
    }
    // 画面で選んだ分の端数（1 分）は許す
    if expires_at > now + max_days * 86_400 + 60 {
        return Err(LockError::Invalid(format!(
            "期限は {max_days} 日後まで（サーバーの設定）にしてください"
        )));
    }
    lock_repo::delete_stale(conn, now)?;
    if let Some(lock) = lock_repo::find_by_path(conn, path, now)? {
        if lock.user_id != user_id {
            return Err(LockError::Busy(format!(
                "{}さんがロックしています（{} まで）",
                lock.display_name,
                format_time(lock.expires_at)
            )));
        }
    }
    // 見張り・同期がまだ登録していなければ、ここで登録する
    let node_id = match node_repo::find_node_id_by_node_path(conn, path)? {
        Some(id) => id,
        None => {
            node_repo::create_node(conn, &generate_node_id(), path)?;
            node_repo::find_node_id_by_node_path(conn, path)?.ok_or(LockError::NotFound)?
        }
    };
    lock_repo::upsert(conn, &node_id, user_id, now, expires_at)?;
    Ok(())
}

// ロックを外す。ロックした人と管理者だけ
pub fn unlock(
    conn: &Connection,
    user_id: &str,
    is_admin: bool,
    path: &str,
) -> Result<(), LockError> {
    let path = path.trim_matches('/');
    let Some(lock) = lock_repo::find_by_path(conn, path, now())? else {
        // もう外れている（期限が過ぎた・ほかの人が外した）
        lock_repo::delete_by_path(conn, path)?;
        return Ok(());
    };
    if lock.user_id != user_id && !is_admin {
        return Err(LockError::Forbidden(format!(
            "ロックを外せるのは、ロックした {}さんと管理者だけです",
            lock.display_name
        )));
    }
    lock_repo::delete_by_path(conn, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::migration::migrate;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn);
        for (id, name) in [("alice", "アリス"), ("bob", "ボブ")] {
            conn.execute(
                "INSERT INTO user (user_id, display_name, passwd, role_id) VALUES (?1, ?2, 'x', 'user')",
                [id, name],
            )
            .unwrap();
        }
        node_repo::create_node(&conn, "n1", "a/b.xlsx").unwrap();
        node_repo::create_node(&conn, "n2", "a").unwrap();
        conn
    }

    #[test]
    fn others_are_blocked_until_expired_and_owner_is_not() {
        let conn = setup();
        let now = now();
        lock_repo::upsert(&conn, "n1", "alice", now, now + 3600).unwrap();
        // ほかの人は、ファイルも、それを含むフォルダも操作できない
        let error = ensure_unlocked(&conn, "bob", &["a/b.xlsx".into()]).unwrap_err();
        assert_eq!(error.kind(), ErrorKind::ResourceBusy);
        assert!(error.to_string().contains("アリス"));
        assert!(ensure_unlocked(&conn, "bob", &["a".into()]).is_err());
        // 似た名前のフォルダは関係ない
        assert!(ensure_unlocked(&conn, "bob", &["a/b".into()]).is_ok());
        // 本人はできる
        assert!(ensure_unlocked(&conn, "alice", &["a/b.xlsx".into(), "a".into()]).is_ok());
        // 期限が過ぎたら外れる
        lock_repo::upsert(&conn, "n1", "alice", now - 10, now - 1).unwrap();
        assert!(ensure_unlocked(&conn, "bob", &["a/b.xlsx".into()]).is_ok());
    }

    #[test]
    fn only_owner_or_admin_can_unlock() {
        let conn = setup();
        let now = now();
        lock_repo::upsert(&conn, "n1", "alice", now, now + 3600).unwrap();
        assert!(matches!(
            unlock(&conn, "bob", false, "a/b.xlsx"),
            Err(LockError::Forbidden(_))
        ));
        assert!(unlock(&conn, "bob", true, "a/b.xlsx").is_ok());
        assert!(
            lock_repo::find_by_path(&conn, "a/b.xlsx", now)
                .unwrap()
                .is_none()
        );
    }
}
