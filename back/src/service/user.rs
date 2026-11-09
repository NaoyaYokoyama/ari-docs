use rusqlite::Connection;

use crate::{
    api::user::response::UserItem,
    model::user::User,
    repository::{session as session_repo, setting as setting_repo, user as user_repo},
    service::auth::{ROLE_ADMIN, ROLE_USER, hash_password, is_admin, verify_password},
};

pub enum UserError {
    // 入力の誤り（400）
    Invalid(String),
    // 同じユーザーID がある、既に管理者がいる（409）
    Conflict(String),
    NotFound,
    Db(rusqlite::Error),
}

impl From<rusqlite::Error> for UserError {
    fn from(error: rusqlite::Error) -> Self {
        UserError::Db(error)
    }
}

fn to_item(user: User) -> UserItem {
    UserItem {
        is_admin: is_admin(&user),
        user_id: user.user_id,
        display_name: user.display_name,
        updated_at: user.updated_at,
    }
}

// 最初の管理者を登録する。既にユーザーがいれば登録しない
pub fn create_first_admin(
    conn: &Connection,
    user_id: &str,
    display_name: &str,
    password: &str,
) -> Result<User, UserError> {
    let created = user_repo::create_first_user(
        conn,
        user_id,
        &hash_password(password),
        display_name,
        ROLE_ADMIN,
    )?;
    if created == 0 {
        return Err(UserError::Conflict(
            "管理者は登録済みです。ログインしてください".to_string(),
        ));
    }
    Ok(user_repo::find_by_user_id(conn, user_id)?)
}

pub fn get_users(conn: &Connection) -> Result<Vec<UserItem>, UserError> {
    Ok(user_repo::find_all(conn)?
        .into_iter()
        .map(to_item)
        .collect())
}

pub fn create_user(
    conn: &Connection,
    user_id: &str,
    display_name: &str,
    password: &str,
    admin: bool,
) -> Result<(), UserError> {
    let role = if admin { ROLE_ADMIN } else { ROLE_USER };
    let created =
        user_repo::create_user(conn, user_id, &hash_password(password), display_name, role)?;
    if created == 0 {
        return Err(UserError::Conflict(format!(
            "ユーザーID「{user_id}」は既に使われています"
        )));
    }
    Ok(())
}

// 自分は削除できない（管理者が 1 人もいなくなるのを防ぐため）。削除したユーザーはログアウトさせる
pub fn delete_user(conn: &Connection, login_user_id: &str, user_id: &str) -> Result<(), UserError> {
    if user_id == login_user_id {
        return Err(UserError::Invalid("自分は削除できません".to_string()));
    }
    if user_id == "local" || user_repo::delete_user(conn, user_id)? == 0 {
        return Err(UserError::NotFound);
    }
    let _ = session_repo::delete_by_user(conn, user_id);
    Ok(())
}

// 管理者がパスワードを再設定する。そのユーザーはログアウトさせる
pub fn reset_password(conn: &Connection, user_id: &str, password: &str) -> Result<(), UserError> {
    if user_id == "local"
        || setting_repo::update_password(conn, user_id, &hash_password(password))? == 0
    {
        return Err(UserError::NotFound);
    }
    let _ = session_repo::delete_by_user(conn, user_id);
    Ok(())
}

// 本人がパスワードを変える。現在のパスワードと確認用の一致を確かめる
pub fn change_password(
    conn: &Connection,
    user_id: &str,
    current_password: &str,
    new_password: &str,
    new_password_confirm: &str,
) -> Result<(), UserError> {
    let user = user_repo::find_by_user_id(conn, user_id)?;
    if !verify_password(current_password, &user.passwd) {
        return Err(UserError::Invalid("現在のパスワードが違います".to_string()));
    }
    if new_password != new_password_confirm {
        return Err(UserError::Invalid(
            "新しいパスワードが一致しません".to_string(),
        ));
    }
    setting_repo::update_password(conn, user_id, &hash_password(new_password))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connect() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        for sql in [
            include_str!("../data/migration/T002_create_user.sql"),
            include_str!("../data/migration/T005_create_favorite.sql"),
            include_str!("../data/migration/T006_create_note.sql"),
            include_str!("../data/migration/T008_create_user_setting.sql"),
            include_str!("../data/migration/T011_create_session.sql"),
            include_str!("../data/migration/T014_create_content_history.sql"),
            include_str!("../data/migration/T015_add_session_client.sql"),
            include_str!("../data/migration/T016_create_content_folder.sql"),
        ] {
            conn.execute_batch(sql).unwrap();
        }
        user_repo::ensure_local_user(&conn).unwrap();
        conn
    }

    #[test]
    fn first_admin_can_be_created_only_once() {
        let conn = connect();
        let admin = create_first_admin(&conn, "admin", "管理者", "password1")
            .ok()
            .unwrap();
        assert!(is_admin(&admin));
        assert!(matches!(
            create_first_admin(&conn, "other", "他", "password1"),
            Err(UserError::Conflict(_))
        ));
    }

    #[test]
    fn create_user_rejects_duplicate_id() {
        let conn = connect();
        create_user(&conn, "taro", "太郎", "password1", false)
            .ok()
            .unwrap();
        assert!(matches!(
            create_user(&conn, "taro", "太郎", "password1", false),
            Err(UserError::Conflict(_))
        ));
        let users = get_users(&conn).ok().unwrap();
        assert_eq!(users.len(), 1);
        assert!(!users[0].is_admin);
    }

    #[test]
    fn delete_user_removes_own_data_and_sessions() {
        let conn = connect();
        create_user(&conn, "admin", "管理者", "password1", true)
            .ok()
            .unwrap();
        create_user(&conn, "taro", "太郎", "password1", false)
            .ok()
            .unwrap();
        conn.execute_batch(
            "INSERT INTO note (note_id, user_id, title) VALUES ('nt_1', 'taro', 'a');
             INSERT INTO favorite VALUES ('fv_1', 'taro', '', '', 'wk_1');
             INSERT INTO favorite VALUES ('fv_2', 'admin', '', 'nt_1', '');",
        )
        .unwrap();
        session_repo::create(&conn, "s1", "taro", "").unwrap();
        session_repo::create(&conn, "s2", "admin", "").unwrap();

        assert!(matches!(
            delete_user(&conn, "admin", "admin"),
            Err(UserError::Invalid(_))
        ));
        assert!(matches!(
            delete_user(&conn, "admin", "local"),
            Err(UserError::NotFound)
        ));
        delete_user(&conn, "admin", "taro").ok().unwrap();

        let count = |sql: &str| -> i64 { conn.query_row(sql, [], |row| row.get(0)).unwrap() };
        assert_eq!(count("SELECT COUNT(*) FROM note"), 0);
        assert_eq!(count("SELECT COUNT(*) FROM favorite"), 0);
        assert_eq!(count("SELECT COUNT(*) FROM user WHERE user_id = 'taro'"), 0);
        assert!(
            session_repo::find_user_id(&conn, "s1", 30)
                .unwrap()
                .is_none()
        );
        assert!(
            session_repo::find_user_id(&conn, "s2", 30)
                .unwrap()
                .is_some()
        );
    }

    #[test]
    fn change_password_checks_current_and_confirm() {
        let conn = connect();
        create_user(&conn, "taro", "太郎", "password1", false)
            .ok()
            .unwrap();
        assert!(matches!(
            change_password(&conn, "taro", "wrong", "password2", "password2"),
            Err(UserError::Invalid(_))
        ));
        assert!(matches!(
            change_password(&conn, "taro", "password1", "password2", "password3"),
            Err(UserError::Invalid(_))
        ));
        change_password(&conn, "taro", "password1", "password2", "password2")
            .ok()
            .unwrap();
        let user = user_repo::find_by_user_id(&conn, "taro").unwrap();
        assert!(verify_password("password2", &user.passwd));
    }
}
