use crate::model::node::Node;
use rusqlite::{Connection, OptionalExtension, Result, params_from_iter};

#[cfg(test)]
pub fn find_all_paths(conn: &Connection) -> Result<std::collections::HashSet<String>> {
    let sql = "
        SELECT
          path
        FROM
          node
    ";

    let mut stmt = conn.prepare(sql)?;
    let paths = stmt.query_map([], |row| row.get::<_, String>(0))?;
    paths.collect()
}

// すべてのノード。戻り値は (node_id, path)
pub fn find_all(conn: &Connection) -> Result<Vec<(String, String)>> {
    let sql = "
        SELECT
          node_id,
          path
        FROM
          node
    ";

    let mut stmt = conn.prepare(sql)?;
    let nodes = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    nodes.collect()
}

// すべてのノードの path -> 更新日時（UNIX 時間の秒）
pub fn find_all_modified(conn: &Connection) -> Result<std::collections::HashMap<String, i64>> {
    let mut stmt = conn.prepare("SELECT path, modified_at FROM node")?;
    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect()
}

// 更新日時が変わっていれば書き換える。ari-docs の外で変わったので、更新者（FN0301-BR34）は消す
pub fn update_modified_at(conn: &Connection, path: &str, modified_at: i64) -> Result<usize> {
    conn.execute(
        "UPDATE node SET modified_at = ?2, updated_by = '' WHERE path = ?1 AND modified_at <> ?2",
        rusqlite::params![path, modified_at],
    )
}

// 最近更新されたファイル（フォルダは除く。FN0201-BR07）。戻り値は (path, 更新日時)
pub fn find_recent_files(conn: &Connection, limit: i64) -> Result<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT path, modified_at FROM node WHERE modified_at > 0 ORDER BY modified_at DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit * 3], |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect()
}

// 更新日時（UNIX 秒）が from 以上・to 未満のノードを新しい順に（検索の期間。FN0201-BR11）
pub fn find_modified_between(
    conn: &Connection,
    from: i64,
    to: i64,
    limit: i64,
) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT node_id, path FROM node WHERE modified_at >= ?1 AND modified_at < ?2 ORDER BY modified_at DESC LIMIT ?3",
    )?;
    let rows = stmt.query_map([from, to, limit], |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect()
}

pub fn find_node_id_by_node_path(conn: &Connection, path: &str) -> Result<Option<String>> {
    let sql = "
        SELECT
          node_id
        FROM
          node
        WHERE
          path = ?1
    ";

    conn.query_row(sql, [path], |row| row.get(0)).optional()
}

pub fn find_by_node_ids(conn: &Connection, node_ids: &[String]) -> Result<Vec<Node>> {
    if node_ids.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders = vec!["?"; node_ids.len()].join(",");

    let sql = format!(
        "
        SELECT
          node_id,
          path,
          updated_at
        FROM
          node
        WHERE
          node_id IN ({placeholders})
        "
    );

    let mut stmt = conn.prepare(&sql)?;

    let nodes = stmt
        .query_map(params_from_iter(node_ids), |row| {
            Ok(Node {
                node_id: row.get(0)?,
                path: row.get(1)?,
                description: String::new(),
                updated_by: String::new(),
                updated_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

    Ok(nodes)
}

// パスか説明にキーワードを含むノード（ファイル名・フォルダ名・説明での検索。FN0301-BR33）
// 戻り値は (node_id, path)
pub fn find_by_search(conn: &Connection, keyword: &str) -> Result<Vec<(String, String)>> {
    let sql = "
        SELECT
          node_id,
          path
        FROM
          node
        WHERE
          path LIKE '%' || ?1 || '%' ESCAPE '\\'
          OR description LIKE '%' || ?1 || '%' ESCAPE '\\'
        ORDER BY path ASC
    ";

    // 検索語の % _ は文字として探す（API0201）
    let mut stmt = conn.prepare(sql)?;
    let keyword = super::search::escape_like(keyword);
    let nodes = stmt.query_map([keyword], |row| Ok((row.get(0)?, row.get(1)?)))?;
    nodes.collect()
}

// 一覧に出すノードの説明（パス → 説明。空のものは含めない。FN0301-BR33）
pub fn find_descriptions_by_paths(
    conn: &Connection,
    paths: &[String],
) -> Result<std::collections::HashMap<String, String>> {
    if paths.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    let placeholders = vec!["?"; paths.len()].join(",");
    let sql = format!(
        "SELECT path, description FROM node WHERE description <> '' AND path IN ({placeholders})"
    );
    let mut stmt = conn.prepare(&sql)?;
    stmt.query_map(params_from_iter(paths), |row| {
        Ok((row.get(0)?, row.get(1)?))
    })?
    .collect()
}

// ari-docs で変えた人と、変えたあとの更新日時を記録する（FN0301-BR34）。行が無ければ作る。
// 更新日時をそろえておくので、見張り・同期が同じ変更を見ても更新者は消えない（外で変わったときだけ消える）
pub fn record_update(
    conn: &Connection,
    node_id: &str,
    path: &str,
    user_id: &str,
    modified_at: i64,
) -> Result<usize> {
    create_node(conn, node_id, path)?;
    conn.execute(
        "UPDATE node SET updated_by = ?2, modified_at = ?3 WHERE path = ?1",
        rusqlite::params![path, user_id, modified_at],
    )
}

// 一覧に出すノードの更新者（パス → 表示名。消えたユーザーは ID のまま。FN0301-BR34）
pub fn find_updated_by_names(
    conn: &Connection,
    paths: &[String],
) -> Result<std::collections::HashMap<String, String>> {
    if paths.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    let placeholders = vec!["?"; paths.len()].join(",");
    let sql = format!(
        "SELECT node.path, COALESCE(user.display_name, node.updated_by)
         FROM node LEFT JOIN user ON user.user_id = node.updated_by
         WHERE node.updated_by <> '' AND node.path IN ({placeholders})"
    );
    let mut stmt = conn.prepare(&sql)?;
    stmt.query_map(params_from_iter(paths), |row| {
        Ok((row.get(0)?, row.get(1)?))
    })?
    .collect()
}

// 説明を書き換える。行が無ければ（見張り・同期がまだ登録していない）作る
pub fn update_description(
    conn: &Connection,
    node_id: &str,
    path: &str,
    description: &str,
) -> Result<usize> {
    create_node(conn, node_id, path)?;
    conn.execute(
        "UPDATE node SET description = ?2 WHERE path = ?1",
        rusqlite::params![path, description],
    )
}

pub fn create_node(conn: &Connection, node_id: &str, path: &str) -> Result<i64> {
    let sql = "
        INSERT OR IGNORE INTO node (
          node_id,
          path,
          description,
          updated_by
        )
        VALUES (
          ?1,
          ?2,
          '',
          ''
        )
    ";
    // 同じパスがもうあれば登録しない（path は一意。ファイルの見張りと同期が同時に登録することがあるため）。登録した件数を返す
    Ok(conn.execute(sql, [node_id, path])? as i64)
}

// 指定パスのノードと、その配下（フォルダの中身）のノードを削除する。
// 先に、それらを指すお気に入り（全ユーザー分。ノードは全員で共有するため）と、
// 中身の検索の取り込みの状態・単語の対応を削除する（FN0202-BR08。残すと「取り込み直し待ち」に数え続けるため）
pub fn delete_with_descendants(conn: &Connection, path: &str) -> Result<usize> {
    // LIKE だと名前の % や _ がワイルドカードになるため、先頭一致は substr で比べる
    let target = "
        SELECT
          node_id
        FROM
          node
        WHERE
          path = ?1
          OR substr(path, 1, length(?1) + 1) = ?1 || '/'
          OR substr(path, 1, length(?1) + 1) = ?1 || ?2
    ";
    let separator = std::path::MAIN_SEPARATOR.to_string();
    conn.execute(
        &format!("DELETE FROM favorite WHERE node_id IN ({target})"),
        [path, &separator],
    )?;
    for table in ["node_keyword", "node_content"] {
        conn.execute(
            &format!("DELETE FROM {table} WHERE node_id IN ({target})"),
            [path, &separator],
        )?;
    }
    conn.execute(
        &format!("DELETE FROM node WHERE node_id IN ({target})"),
        [path, &separator],
    )
}

// 移した・名前を変えたノード（フォルダなら中のものも）のパスを変える（node_id はそのまま）。
// 移動先に実体の無い古い行があれば先に消す（パスが重ならないように）
pub fn move_paths(conn: &Connection, old: &str, new: &str) -> Result<usize> {
    let tx = conn.unchecked_transaction()?;
    delete_with_descendants(&tx, new)?;
    let separator = std::path::MAIN_SEPARATOR.to_string();
    let result = tx.execute(
        "
        UPDATE
          node
        SET
          path = ?2 || substr(path, length(?1) + 1)
        WHERE
          path = ?1
          OR substr(path, 1, length(?1) + 1) = ?1 || '/'
          OR substr(path, 1, length(?1) + 1) = ?1 || ?3
        ",
        [old, new, &separator],
    )?;
    tx.commit()?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connect() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../data/migration/T004_create_node.sql"))
            .unwrap();
        conn.execute_batch(include_str!("../data/migration/T005_create_favorite.sql"))
            .unwrap();
        conn.execute_batch(include_str!(
            "../data/migration/T009_create_search_index.sql"
        ))
        .unwrap();
        conn
    }

    // T019: 重なった行は先の行にまとめ、お気に入りを付け替え、そのあとは同じパスを登録しない
    #[test]
    fn duplicate_paths_are_merged_and_prevented() {
        let conn = connect();
        conn.execute_batch(
            "INSERT INTO node (node_id, path) VALUES ('n1', 'a.txt'), ('n2', 'a.txt'), ('n3', 'b.txt');
             INSERT INTO favorite VALUES ('fv_1', 'u', 'n2', '', '');",
        )
        .unwrap();
        conn.execute_batch(include_str!(
            "../data/migration/T019_add_node_path_unique.sql"
        ))
        .unwrap();
        let mut ids: Vec<String> = find_all(&conn)
            .unwrap()
            .into_iter()
            .map(|(id, _)| id)
            .collect();
        ids.sort();
        assert_eq!(ids, vec!["n1", "n3"]);
        let favorite: String = conn
            .query_row("SELECT node_id FROM favorite", [], |row| row.get(0))
            .unwrap();
        assert_eq!(favorite, "n1");
        assert_eq!(create_node(&conn, "n4", "a.txt").unwrap(), 0);
        assert_eq!(
            find_node_id_by_node_path(&conn, "a.txt").unwrap().unwrap(),
            "n1"
        );
    }

    #[test]
    fn name_search_treats_percent_and_underscore_as_text() {
        let conn = connect();
        for (id, path) in [
            ("n1", "100%.txt"),
            ("n2", "100円.txt"),
            ("n3", "a_b"),
            ("n4", "axb"),
        ] {
            create_node(&conn, id, path).unwrap();
        }
        let paths = |keyword: &str| -> Vec<String> {
            find_by_search(&conn, keyword)
                .unwrap()
                .into_iter()
                .map(|(_, path)| path)
                .collect()
        };
        assert_eq!(paths("0%"), vec!["100%.txt"]);
        assert_eq!(paths("a_b"), vec!["a_b"]);
    }

    #[test]
    fn delete_with_descendants_removes_children_and_favorites() {
        let conn = connect();
        for (id, path) in [
            ("n1", "a"),
            ("n2", "a/b.txt"),
            ("n3", "a/c/d.txt"),
            ("n4", "ab"),
            ("n5", "a_b"),
        ] {
            create_node(&conn, id, path).unwrap();
            conn.execute(
                "INSERT INTO favorite VALUES (?1, 'u', ?2, '', '')",
                [format!("fv_{id}"), id.to_string()],
            )
            .unwrap();
            crate::repository::search::replace_node_words(
                &conn,
                id,
                &["議事録".to_string()].into_iter().collect(),
                0,
                0,
                1,
            )
            .unwrap();
        }

        assert_eq!(delete_with_descendants(&conn, "a").unwrap(), 3);
        let mut left: Vec<String> = find_all_paths(&conn).unwrap().into_iter().collect();
        left.sort();
        assert_eq!(left, ["a_b", "ab"]);
        let favorites: i64 = conn
            .query_row("SELECT COUNT(*) FROM favorite", [], |row| row.get(0))
            .unwrap();
        assert_eq!(favorites, 2);
        // 中身の検索の状態・単語の対応も消える（残りの 2 つ分だけ）
        for table in ["node_content", "node_keyword"] {
            let count: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(count, 2, "{table}");
        }
    }

    // FN0301-BR34: ari-docs で記録した更新者は、同じ更新日時なら残り、外で変わる（更新日時が変わる）と消える
    #[test]
    fn updated_by_is_cleared_when_changed_outside() {
        let conn = connect();
        conn.execute_batch(include_str!(
            "../data/migration/T012_add_node_modified_at.sql"
        ))
        .unwrap();
        conn.execute_batch(
            "CREATE TABLE user (user_id TEXT PRIMARY KEY, display_name TEXT NOT NULL);
             INSERT INTO user VALUES ('taro', '太郎');",
        )
        .unwrap();
        record_update(&conn, "n1", "a.txt", "taro", 100).unwrap();
        let paths = vec!["a.txt".to_string()];
        update_modified_at(&conn, "a.txt", 100).unwrap();
        assert_eq!(
            find_updated_by_names(&conn, &paths).unwrap().get("a.txt"),
            Some(&"太郎".to_string())
        );
        update_modified_at(&conn, "a.txt", 200).unwrap();
        assert!(find_updated_by_names(&conn, &paths).unwrap().is_empty());
    }
}
