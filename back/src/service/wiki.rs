use crate::{
    api::wiki::{response::Wiki, response::WikiResponse},
    common::id::generate_wiki_id,
    repository::{
        content_folder as folder_repo, favorite as favorite_repo, history as history_repo,
        wiki as wiki_repo,
    },
    service::content::{self, Current, SaveError},
};
use rusqlite::Connection;

pub fn get_wikis(conn: &Connection) -> rusqlite::Result<WikiResponse> {
    let wikis = wiki_repo::find_all(conn)?;
    let wikis = wikis
        .into_iter()
        .map(|wiki| Wiki {
            wiki_id: wiki.wiki_id,
            title: wiki.title,
            content: wiki.content,
            updated_at: wiki.updated_at,
            favorite_id: "".to_string(),
            updated_by: String::new(),
        })
        .collect();
    Ok(WikiResponse { wikis })
}

pub fn get_wiki(conn: &Connection, user_id: &str, wiki_id: &str) -> rusqlite::Result<Wiki> {
    let wiki_result = wiki_repo::find_by_wiki_id(conn, wiki_id)?;
    let favorite_result = favorite_repo::find_by_wiki_id(conn, user_id, wiki_id)?;

    let mut wiki = Wiki {
        updated_by: wiki_repo::find_updated_by_name(conn, &wiki_result.wiki_id)?,
        wiki_id: wiki_result.wiki_id,
        title: wiki_result.title,
        content: wiki_result.content,
        updated_at: wiki_result.updated_at,
        favorite_id: String::new(),
    };

    if let Some(favorite) = favorite_result {
        wiki.favorite_id = favorite.favorite_id;
    }

    Ok(wiki)
}

pub fn create_wiki(conn: &Connection, user_id: &str, title: &str) -> rusqlite::Result<Wiki> {
    let wiki_id = generate_wiki_id();
    wiki_repo::create_wiki(conn, user_id, &wiki_id, title)?;
    let wiki_result = wiki_repo::find_by_wiki_id(conn, &wiki_id)?;
    let wiki = Wiki {
        updated_by: wiki_repo::find_updated_by_name(conn, &wiki_result.wiki_id)?,
        wiki_id: wiki_result.wiki_id,
        title: wiki_result.title,
        content: wiki_result.content,
        updated_at: wiki_result.updated_at,
        favorite_id: "".to_string(),
    };
    Ok(wiki)
}

pub fn delete_wiki(conn: &Connection, wiki_id: &str) -> rusqlite::Result<usize> {
    favorite_repo::delete_favorite_wiki(conn, wiki_id)?;
    history_repo::delete_by_content(conn, "wiki", wiki_id)?;
    folder_repo::delete_item(conn, "wiki", wiki_id)?;
    let result = wiki_repo::delete_wiki(conn, wiki_id)?;
    Ok(result)
}

// 保存（FN0501-BR10・FN0402）。保存したあとの更新日時を返す
pub fn update_wiki(
    conn: &Connection,
    user_id: &str,
    wiki_id: &str,
    title: &str,
    content: &str,
    base_updated_at: Option<&str>,
    force: bool,
) -> Result<String, SaveError> {
    let wiki = wiki_repo::find_by_wiki_id(conn, wiki_id)?;
    let updated_by: String = conn.query_row(
        "SELECT CASE updated_by WHEN '' THEN user_id ELSE updated_by END FROM wiki WHERE wiki_id = ?1",
        [wiki_id],
        |row| row.get(0),
    )?;
    let current = Current {
        title: wiki.title,
        content: wiki.content,
        updated_at: wiki.updated_at,
        updated_by,
        who: format!("{}さんが", wiki_repo::find_updated_by_name(conn, wiki_id)?),
    };
    content::save(
        conn,
        "wiki",
        wiki_id,
        user_id,
        current,
        base_updated_at,
        force,
        || wiki_repo::update_wiki(conn, wiki_id, title, content, user_id),
        || wiki_repo::find_by_wiki_id(conn, wiki_id).map(|wiki| wiki.updated_at),
        title,
        content,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::history as history_repo;

    fn connect() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        for sql in [
            include_str!("../data/migration/T002_create_user.sql"),
            include_str!("../data/migration/T005_create_favorite.sql"),
            include_str!("../data/migration/T007_create_wiki.sql"),
            include_str!("../data/migration/T013_add_wiki_updated_by.sql"),
            include_str!("../data/migration/T014_create_content_history.sql"),
            include_str!("../data/migration/T016_create_content_folder.sql"),
        ] {
            conn.execute_batch(sql).unwrap();
        }
        conn.execute_batch(
            "INSERT INTO user (user_id, passwd, display_name, role_id) VALUES ('a', '-', '山田', 'user'), ('b', '-', '佐藤', 'user');",
        )
        .unwrap();
        conn
    }

    #[test]
    fn update_wiki_detects_conflict_and_keeps_history() {
        let conn = connect();
        let wiki = create_wiki(&conn, "a", "手順").unwrap();
        // 山田さんが開いたときの更新日時（更新日時は秒までなので、はっきり違う値にする）
        let opened = "1999-01-01 00:00:00".to_string();

        // 佐藤さんが保存すると、最終更新者が佐藤さんになり、履歴は「作成時」と「保存後」の 2 件
        conn.execute("UPDATE wiki SET updated_at = '2000-01-01 00:00:00'", [])
            .unwrap();
        let saved = update_wiki(
            &conn,
            "b",
            &wiki.wiki_id,
            "手順",
            "v1",
            Some("2000-01-01 00:00:00"),
            false,
        )
        .ok()
        .unwrap();
        assert_eq!(
            get_wiki(&conn, "a", &wiki.wiki_id).unwrap().updated_by,
            "佐藤"
        );
        assert_eq!(
            history_repo::find_by_content(&conn, "wiki", &wiki.wiki_id)
                .unwrap()
                .len(),
            2
        );

        // 山田さんは古い更新日時で保存しようとするので、食い違いになる
        let error = update_wiki(
            &conn,
            "a",
            &wiki.wiki_id,
            "手順",
            "v2",
            Some(&opened),
            false,
        );
        assert!(
            matches!(error, Err(SaveError::Conflict(message)) if message.contains("佐藤さんが"))
        );
        // 上書きを選べば保存できる
        update_wiki(&conn, "a", &wiki.wiki_id, "手順", "v2", Some(&saved), false)
            .ok()
            .unwrap();
        let versions = history_repo::find_by_content(&conn, "wiki", &wiki.wiki_id).unwrap();
        assert_eq!(versions[0].content, "v2");
        assert_eq!(versions[0].updated_by, "山田");
        // 削除すると履歴も消える
        delete_wiki(&conn, &wiki.wiki_id).unwrap();
        assert!(
            history_repo::find_by_content(&conn, "wiki", &wiki.wiki_id)
                .unwrap()
                .is_empty()
        );
    }
}
