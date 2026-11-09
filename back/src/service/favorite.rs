use crate::{
    common::id::{generate_favorite_id, generate_node_id},
    repository::favorite as favorite_repo,
    repository::node as node_repo,
};
use rusqlite::Connection;

pub fn create_favorite(
    conn: &Connection,
    user_id: &str,
    node_path: &str,
    note_id: &str,
    wiki_id: &str,
) -> rusqlite::Result<String> {
    let mut node_id = String::new();
    if !node_path.is_empty() {
        node_id = match node_repo::find_node_id_by_node_path(conn, node_path)? {
            Some(node_id) => node_id,
            None => {
                let node_id = generate_node_id();
                node_repo::create_node(conn, &node_id, node_path)?;
                node_id
            }
        };
    }
    if let Some(favorite_id) =
        favorite_repo::find_favorite_id(conn, user_id, &node_id, note_id, wiki_id)?
    {
        return Ok(favorite_id);
    }
    let favorite_id = generate_favorite_id();
    favorite_repo::create_favorite(conn, user_id, &favorite_id, &node_id, note_id, wiki_id)?;
    Ok(favorite_id)
}

pub fn delete_favorite(
    conn: &Connection,
    user_id: &str,
    favorite_id: &str,
) -> rusqlite::Result<usize> {
    let result = favorite_repo::delete_favorite(conn, user_id, favorite_id)?;
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
        conn
    }

    fn count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM favorite", [], |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn create_favorite_returns_existing_id_for_same_target() {
        let conn = connect();
        let first = create_favorite(&conn, "local", "a/memo.txt", "", "").unwrap();
        let second = create_favorite(&conn, "local", "a/memo.txt", "", "").unwrap();
        assert_eq!(first, second);
        let note = create_favorite(&conn, "local", "", "nt_1", "").unwrap();
        assert_eq!(
            note,
            create_favorite(&conn, "local", "", "nt_1", "").unwrap()
        );
        assert_eq!(count(&conn), 2);
    }

    #[test]
    fn create_favorite_is_per_user() {
        let conn = connect();
        let a = create_favorite(&conn, "a", "", "", "wk_1").unwrap();
        let b = create_favorite(&conn, "b", "", "", "wk_1").unwrap();
        assert_ne!(a, b);
        assert_eq!(count(&conn), 2);
    }
}
