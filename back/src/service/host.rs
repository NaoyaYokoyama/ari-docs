use rusqlite::Connection;

use crate::{
    api::user::request::{validate_display_name, validate_password, validate_user_id},
    database::connection,
    service::user::{self as user_service, UserError},
};

// ユーザー local を指す列（表・列）。この PC を公開するときに、登録した管理者へ書き換える（docs の FN0005-BR03）
const LOCAL_USER_COLUMNS: [(&str, &str); 18] = [
    ("note", "user_id"),
    ("favorite", "user_id"),
    ("wiki", "user_id"),
    ("wiki", "updated_by"),
    ("user_setting", "user_id"),
    ("content_history", "updated_by"),
    ("content_folder", "user_id"),
    ("content_image", "user_id"),
    ("search_dictionary", "created_by"),
    ("search_exclusion", "user_id"),
    ("search_exclusion", "created_by"),
    ("trash", "deleted_by"),
    ("backup", "created_by"),
    ("node", "updated_by"),
    ("trash_favorite", "user_id"),
    ("node_lock", "user_id"),
    ("node_version", "replaced_by"),
    ("task", "user_id"),
];

// 入力チェックの結果を、画面に出す文にする
fn check(result: Result<(), validator::ValidationError>) -> Result<(), UserError> {
    result.map_err(|e| {
        UserError::Invalid(
            e.message
                .map(|message| message.to_string())
                .unwrap_or_else(|| "入力が正しくありません".to_string()),
        )
    })
}

// この PC を共有サーバーとして公開する前の準備（docs の FN0005）。最初の管理者を登録し、
// ユーザー local（ローカルモードの本人）の Note・お気に入り・設定などをその管理者に移す。
// 既にユーザーがいれば何もしない（409）。すべて 1 つのトランザクションで行う
pub fn take_over_local_user(
    conn: &Connection,
    user_id: &str,
    display_name: &str,
    password: &str,
) -> Result<(), UserError> {
    let user_id = user_id.trim();
    let display_name = display_name.trim();
    check(validate_user_id(user_id))?;
    check(validate_display_name(display_name))?;
    check(validate_password(password))?;

    let tx = conn.unchecked_transaction()?;
    user_service::create_first_admin(&tx, user_id, display_name, password)?;
    move_local_user(&tx, user_id)?;
    tx.commit()?;
    Ok(())
}

// ユーザー local を指す列を user_id に書き換え、ユーザー local を消す。
// 公開したあとに、公開する前（ローカルモード）のバックアップを復元したときにも使う（FN0901-BR10）
pub fn move_local_user(conn: &Connection, user_id: &str) -> rusqlite::Result<()> {
    for (table, column) in LOCAL_USER_COLUMNS {
        conn.execute(
            &format!("UPDATE {table} SET {column} = ?1 WHERE {column} = 'local'"),
            [user_id],
        )?;
    }
    conn.execute("DELETE FROM user WHERE user_id = 'local'", [])?;
    Ok(())
}

// デスクトップアプリから呼ぶ（起動しているバックエンドの DB を使う）。失敗したら画面に出す文を返す
pub fn publish_local_data(user_id: &str, display_name: &str, password: &str) -> Result<(), String> {
    let conn = connection::connect();
    take_over_local_user(&conn, user_id, display_name, password).map_err(|e| match e {
        UserError::Invalid(message) | UserError::Conflict(message) => message,
        UserError::NotFound => "ユーザーが見つかりません".to_string(),
        UserError::Db(e) => format!("データの移し替えに失敗しました: {e}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{database::migration, repository::user as user_repo};

    fn connect() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migration::migrate(&conn);
        user_repo::ensure_local_user(&conn).unwrap();
        conn
    }

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |row| row.get(0)).unwrap()
    }

    #[test]
    fn local_user_data_moves_to_the_admin() {
        let conn = connect();
        conn.execute_batch(
            "INSERT INTO note (note_id, user_id, title, content) VALUES ('nt_1', 'local', 'メモ', '');
             INSERT INTO favorite (favorite_id, user_id, node_id, note_id, wiki_id) VALUES ('fv_1', 'local', '', 'nt_1', '');
             INSERT INTO user_setting (user_id, docs_root) VALUES ('local', '');",
        )
        .unwrap();
        take_over_local_user(&conn, " admin ", "管理者", "password1")
            .ok()
            .unwrap();

        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM note WHERE user_id = 'admin'"),
            1
        );
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM favorite WHERE user_id = 'admin'"
            ),
            1
        );
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM user_setting WHERE user_id = 'admin'"
            ),
            1
        );
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM user WHERE user_id = 'local'"),
            0
        );
        assert_eq!(
            user_repo::find_by_user_id(&conn, "admin").unwrap().role_id,
            "admin"
        );

        // 2 回目は、もう管理者がいるので移さない
        assert!(matches!(
            take_over_local_user(&conn, "other", "ほか", "password1"),
            Err(UserError::Conflict(_))
        ));
    }

    #[test]
    fn invalid_input_changes_nothing() {
        let conn = connect();
        for (user_id, name, password) in [
            ("local", "管理者", "password1"),
            ("a b", "管理者", "password1"),
            ("admin", " ", "password1"),
            ("admin", "管理者", "short"),
        ] {
            assert!(matches!(
                take_over_local_user(&conn, user_id, name, password),
                Err(UserError::Invalid(_))
            ));
        }
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM user WHERE user_id = 'local'"),
            1
        );
        assert_eq!(user_repo::count_users(&conn).unwrap(), 0);
    }
}
