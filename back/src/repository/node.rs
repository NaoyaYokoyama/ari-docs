use crate::model::node::Node;
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
