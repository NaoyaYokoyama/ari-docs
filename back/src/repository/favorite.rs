use crate::model::favorite::Favorite;
use rusqlite::{Connection, Result, params};

pub fn find_by_user_id(conn: &Connection, user_id: &str) -> Result<Vec<Favorite>> {
    let mut stmt = conn.prepare(
        "
        SELECT
          favorite_id,
          node_path,
          note_id,
          wiki_id
        FROM
          favorite
        WHERE user_id = ?1
        LIMIT 30
        ",
    )?;

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
