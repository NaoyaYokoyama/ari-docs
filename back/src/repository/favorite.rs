use crate::model::favorite::Favorite;
use rusqlite::OptionalExtension;
use rusqlite::{Connection, Result, params};

pub fn find_by_user_id(conn: &Connection, user_id: &str) -> Result<Vec<Favorite>> {
    let sql = "
        SELECT
          favorite_id,
          node_path,
          note_id,
          wiki_id
        FROM
          favorite
        WHERE user_id = ?1
        LIMIT 30
        ";
    let mut stmt = conn.prepare(sql)?;
    let favorites = stmt
        .query_map(params![user_id], |row| {
            Ok(Favorite {
                favorite_id: row.get(0)?,
                user_id: String::new(),
                node_path: row.get(1)?,
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
          node_path,
          note_id,
          wiki_id
        FROM
          favorite
        WHERE
          user_id = ?1
          AND wiki_id = ?2
        LIMIT 30
        ";
    let mut stmt = conn.prepare(sql)?;
    let favorite = stmt
        .query_row(params![user_id, wiki_id], |row| {
            Ok(Favorite {
                favorite_id: row.get(0)?,
                user_id: String::new(),
                node_path: row.get(1)?,
                note_id: row.get(2)?,
                wiki_id: row.get(3)?,
            })
        })
        .optional()?;
    Ok(favorite)
}

pub fn create_favorite(
    conn: &Connection,
    user_id: &str,
    favorite_id: &str,
    node_path: &str,
    note_id: &str,
    wiki_id: &str,
) -> Result<i64> {
    let sql = "
        INSERT INTO favorite (
          favorite_id,
          user_id,
          node_path,
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
    conn.execute(sql, [favorite_id, user_id, node_path, note_id, wiki_id])?;
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

pub fn delete_favorite_wiki(conn: &Connection, user_id: &str, wiki_id: &str) -> Result<usize> {
    let sql = "
        DELETE FROM 
          favorite
        WHERE
          user_id = ?1
          AND wiki_id = ?2
        ";
    conn.execute(sql, params![user_id, wiki_id])
}
