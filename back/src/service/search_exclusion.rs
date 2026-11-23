use rusqlite::Connection;

use crate::{
    api::search::response::{ExclusionItem, ExclusionsResponse},
    common::id,
    repository::search_exclusion as exclusion_repo,
    search::exclusion::{self, Exclusions},
};

#[derive(Debug)]
pub enum ExclusionError {
    Invalid(String),
    Conflict(String),
    // 全員の対象外を変えられない（共有モードの管理者以外）・ほかの人の対象外
    Forbidden(String),
    NotFound,
    Db(rusqlite::Error),
}

impl From<rusqlite::Error> for ExclusionError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Db(error)
    }
}

// 検索に使う対象外。user_id が None なら全員の対象外だけ（取り込みバッチ）
pub fn load(conn: &Connection, user_id: Option<&str>) -> rusqlite::Result<Exclusions> {
    let rows = exclusion_repo::find_for(conn, user_id)?;
    Ok(Exclusions::new(
        rows.iter()
            .map(|row| (row.kind.as_str(), row.value.as_str())),
    ))
}

// can_edit_all: 全員の対象外を変えられる（ローカルモード、または共有モードの管理者）。
// personal: 個人の対象外を使う（共有モード。ローカルモードは 1 人なので全員の対象外だけにする）
pub fn get_list(
    conn: &Connection,
    user_id: &str,
    can_edit_all: bool,
    personal: bool,
) -> rusqlite::Result<ExclusionsResponse> {
    let mut all = Vec::new();
    let mut mine = Vec::new();
    for row in exclusion_repo::find_for(conn, Some(user_id))? {
        let target = if row.user_id.is_empty() {
            &mut all
        } else {
            &mut mine
        };
        target.push(ExclusionItem {
            exclusion_id: row.exclusion_id,
            kind: row.kind,
            value: row.value,
            created_by: row.created_by,
            created_at: row.created_at,
        });
    }
    Ok(ExclusionsResponse {
        all,
        mine,
        can_edit_all,
        personal,
    })
}

// for_all: 全員の対象外にする。そうでなければ本人だけ。登録した値（そろえたもの）を返す
pub fn create(
    conn: &Connection,
    user_id: &str,
    for_all: bool,
    kind: &str,
    value: &str,
    can_edit_all: bool,
) -> Result<String, ExclusionError> {
    if for_all && !can_edit_all {
        return Err(ExclusionError::Forbidden(
            "全員の検索の対象外は管理者（と許可を付けられた人）だけが変更できます".to_string(),
        ));
    }
    let value = exclusion::normalize(kind, value).map_err(ExclusionError::Invalid)?;
    let owner = if for_all { "" } else { user_id };
    let created = exclusion_repo::create(
        conn,
        &id::generate_search_exclusion_id(),
        owner,
        kind,
        &value,
        user_id,
    )?;
    if created == 0 {
        return Err(ExclusionError::Conflict(format!(
            "「{value}」はもう対象外にしています"
        )));
    }
    Ok(value)
}

pub fn delete(
    conn: &Connection,
    user_id: &str,
    exclusion_id: &str,
    can_edit_all: bool,
) -> Result<(), ExclusionError> {
    let owner = exclusion_repo::find_owner(conn, exclusion_id)?.ok_or(ExclusionError::NotFound)?;
    if owner.is_empty() && !can_edit_all {
        return Err(ExclusionError::Forbidden(
            "全員の検索の対象外は管理者（と許可を付けられた人）だけが変更できます".to_string(),
        ));
    }
    if !owner.is_empty() && owner != user_id {
        // ほかの人の対象外は見せないので、無いものとして扱う
        return Err(ExclusionError::NotFound);
    }
    exclusion_repo::delete(conn, exclusion_id)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connect() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        for sql in [
            include_str!("../data/migration/T002_create_user.sql"),
            include_str!("../data/migration/T018_create_search_exclusion.sql"),
        ] {
            conn.execute_batch(sql).unwrap();
        }
        conn
    }

    #[test]
    fn personal_exclusions_apply_only_to_owner() {
        let conn = connect();
        create(&conn, "u1", true, "name", "backup*", true).unwrap();
        create(&conn, "u1", false, "path", "/a/old/", false).unwrap();

        assert!(load(&conn, None).unwrap().excludes("backup/x.txt"));
        assert!(!load(&conn, None).unwrap().excludes("a/old/x.txt"));
        assert!(load(&conn, Some("u1")).unwrap().excludes("a/old/x.txt"));
        assert!(!load(&conn, Some("u2")).unwrap().excludes("a/old/x.txt"));

        let list = get_list(&conn, "u1", true, true).unwrap();
        assert_eq!(list.all.len(), 1);
        assert_eq!(list.mine.len(), 1);
        assert_eq!(list.mine[0].value, "a/old");
        assert!(get_list(&conn, "u2", false, true).unwrap().mine.is_empty());
    }

    #[test]
    fn only_editors_change_exclusions_for_all() {
        let conn = connect();
        assert!(matches!(
            create(&conn, "u1", true, "name", "backup*", false),
            Err(ExclusionError::Forbidden(_))
        ));
        create(&conn, "admin", true, "name", "backup*", true).unwrap();
        assert!(matches!(
            create(&conn, "admin", true, "name", "backup*", true),
            Err(ExclusionError::Conflict(_))
        ));
        let id = get_list(&conn, "u1", false, true).unwrap().all[0]
            .exclusion_id
            .clone();
        assert!(matches!(
            delete(&conn, "u1", &id, false),
            Err(ExclusionError::Forbidden(_))
        ));
        delete(&conn, "admin", &id, true).unwrap();
        assert!(load(&conn, None).unwrap().is_empty());
    }

    #[test]
    fn others_cannot_delete_personal_exclusions() {
        let conn = connect();
        create(&conn, "u1", false, "name", "old", false).unwrap();
        let id = get_list(&conn, "u1", false, true).unwrap().mine[0]
            .exclusion_id
            .clone();
        assert!(matches!(
            delete(&conn, "u2", &id, true),
            Err(ExclusionError::NotFound)
        ));
        delete(&conn, "u1", &id, false).unwrap();
    }
}
