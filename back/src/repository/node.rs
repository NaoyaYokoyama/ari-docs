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

pub fn update_modified_at(conn: &Connection, path: &str, modified_at: i64) -> Result<usize> {
    conn.execute(
        "UPDATE node SET modified_at = ?2 WHERE path = ?1 AND modified_at <> ?2",
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
          node_id IN ({})
        ",
        placeholders
    );

    let mut stmt = conn.prepare(&sql)?;

    let nodes = stmt
        .query_map(params_from_iter(node_ids), |row| {
            Ok(Node {
                node_id: row.get(0)?,
                path: row.get(1)?,
                description: String::new(),
                status: String::new(),
                updated_by: String::new(),
                updated_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

    Ok(nodes)
}

// パスにキーワードを含むノード（ファイル名・フォルダ名での検索）
// 戻り値は (node_id, path)
pub fn find_by_search(conn: &Connection, keyword: &str) -> Result<Vec<(String, String)>> {
    let sql = "
        SELECT
          node_id,
          path
        FROM
          node
        WHERE
          path LIKE '%' || ?1 || '%'
        ORDER BY path ASC
    ";

    let mut stmt = conn.prepare(sql)?;
    let nodes = stmt.query_map([keyword], |row| Ok((row.get(0)?, row.get(1)?)))?;
    nodes.collect()
}

pub fn create_node(conn: &Connection, node_id: &str, path: &str) -> Result<i64> {
    let sql = "
        INSERT INTO node (
          node_id,
          path,
          description,
          status,
          updated_by
        )
        VALUES (
          ?1,
          ?2,
          '',
          0,
          ''
        )
    ";
    conn.execute(sql, [node_id, path])?;
    Ok(conn.last_insert_rowid())
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
}
