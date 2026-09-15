use crate::model::note::Note;
use rusqlite::{Connection, OptionalExtension, Result, params, params_from_iter};
use std::collections::HashSet;

pub fn find_all_paths(conn: &Connection) -> Result<HashSet<String>> {
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

pub fn delete_node(conn: &Connection, user_id: &str, node_id: &str) -> Result<usize> {
    let sql = "
        DELETE FROM 
          node
        WHERE
          user_id = ?1
          AND node_id = ?2
        ";
    conn.execute(sql, params![user_id, node_id])
}
