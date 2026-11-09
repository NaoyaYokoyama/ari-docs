use crate::model::favorite::Favorite;
use rusqlite::OptionalExtension;
use rusqlite::{Connection, Result, params, params_from_iter};
use std::collections::HashMap;

pub fn find_by_user_id(conn: &Connection, user_id: &str) -> Result<Vec<Favorite>> {
    let sql = "
        SELECT
          favorite_id,
          node_id,
          note_id,
          wiki_id
        FROM
          favorite
        WHERE user_id = ?1
        ";
    let mut stmt = conn.prepare(sql)?;
    let favorites = stmt
        .query_map(params![user_id], |row| {
            Ok(Favorite {
                favorite_id: row.get(0)?,
                user_id: String::new(),
                node_id: row.get(1)?,
                note_id: row.get(2)?,
                wiki_id: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    Ok(favorites)
}

pub fn find_by_wiki_id(
    conn: &Connection,
    user_id: &str,
    wiki_id: &str,
) -> Result<Option<Favorite>> {
    let sql = "
        SELECT
          favorite_id,
          node_id,
          note_id,
          wiki_id
        FROM
          favorite
        WHERE
          user_id = ?1
          AND wiki_id = ?2
        ";
    let mut stmt = conn.prepare(sql)?;
    let favorite = stmt
        .query_row(params![user_id, wiki_id], |row| {
            Ok(Favorite {
                favorite_id: row.get(0)?,
                user_id: String::new(),
                node_id: row.get(1)?,
                note_id: row.get(2)?,
                wiki_id: row.get(3)?,
            })
        })
        .optional()?;
    Ok(favorite)
}

pub fn find_by_note_id(
    conn: &Connection,
    user_id: &str,
    note_id: &str,
) -> Result<Option<Favorite>> {
    let sql = "
        SELECT
          favorite_id,
          node_id,
          note_id,
          wiki_id
        FROM
          favorite
        WHERE
          user_id = ?1
          AND note_id = ?2
        ";
    let mut stmt = conn.prepare(sql)?;
    let favorite = stmt
        .query_row(params![user_id, note_id], |row| {
            Ok(Favorite {
                favorite_id: row.get(0)?,
                user_id: String::new(),
                node_id: row.get(1)?,
                note_id: row.get(2)?,
                wiki_id: row.get(3)?,
            })
        })
        .optional()?;
    Ok(favorite)
}

// 同じ対象のお気に入りが既にあればその favorite_id を返す（二重登録を防ぐため）
pub fn find_favorite_id(
    conn: &Connection,
    user_id: &str,
    node_id: &str,
    note_id: &str,
    wiki_id: &str,
) -> Result<Option<String>> {
    let sql = "
        SELECT
          favorite_id
        FROM
          favorite
        WHERE
          user_id = ?1
          AND node_id = ?2
          AND note_id = ?3
          AND wiki_id = ?4
        LIMIT 1
        ";
    conn.query_row(sql, params![user_id, node_id, note_id, wiki_id], |row| {
        row.get(0)
    })
    .optional()
}

pub fn create_favorite(
    conn: &Connection,
    user_id: &str,
    favorite_id: &str,
    node_id: &str,
    note_id: &str,
    wiki_id: &str,
) -> Result<i64> {
    let sql = "
        INSERT INTO favorite (
          favorite_id,
          user_id,
          node_id,
          note_id,
          wiki_id
        )
        VALUES (
          ?1,
          ?2,
          ?3,
          ?4,
          ?5
        )
        ";
    conn.execute(sql, [favorite_id, user_id, node_id, note_id, wiki_id])?;
    Ok(conn.last_insert_rowid())
}

pub fn delete_favorite(conn: &Connection, user_id: &str, favorite_id: &str) -> Result<usize> {
    let sql = "
        DELETE FROM 
          favorite
        WHERE
          user_id = ?1
          AND favorite_id = ?2
        ";
    conn.execute(sql, params![user_id, favorite_id])
}

// Wikiは共有のため、全ユーザーのお気に入りを削除する
pub fn delete_favorite_wiki(conn: &Connection, wiki_id: &str) -> Result<usize> {
    let sql = "
        DELETE FROM
          favorite
        WHERE
          wiki_id = ?1
        ";
    conn.execute(sql, params![wiki_id])
}

pub fn delete_favorite_note(conn: &Connection, user_id: &str, note_id: &str) -> Result<usize> {
    let sql = "
        DELETE FROM 
          favorite
        WHERE
          user_id = ?1
          AND note_id = ?2
        ";
    conn.execute(sql, params![user_id, note_id])
}

// 指定パスのノードのうち、ユーザーがお気に入り登録しているものを path -> favorite_id で返す
pub fn find_node_favorite_ids_by_paths(
    conn: &Connection,
    user_id: &str,
    paths: &[String],
) -> Result<HashMap<String, String>> {
    if paths.is_empty() {
        return Ok(HashMap::new());
    }

    let placeholders = vec!["?"; paths.len()].join(",");
    let sql = format!(
        "
        SELECT
          node.path,
          favorite.favorite_id
        FROM
          favorite
          INNER JOIN node ON node.node_id = favorite.node_id
        WHERE
          favorite.user_id = ?
          AND node.path IN ({})
        ",
        placeholders
    );

    let mut stmt = conn.prepare(&sql)?;
    let params = std::iter::once(user_id).chain(paths.iter().map(String::as_str));
    stmt.query_map(params_from_iter(params), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?
    .collect()
}
