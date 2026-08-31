use crate::model::favorite::Favorite;
use rusqlite::{Connection, Result, params};

pub fn find_by_user_id(conn: &Connection, user_id: &str) -> Result<Vec<Favorite>> {
    let mut stmt = conn.prepare(
        "
        SELECT
          node_id,
          note_id,
          wiki_id
        FROM
          favorite
        WHERE user_id = ?1
        LIMIT 30
        ",
    )?;

    let favorites = stmt
        .query_map([user_id], |row| {
            Ok(Favorite {
                user_id: String::new(),
                node_path: row.get(0)?,
                note_id: row.get(1)?,
                wiki_id: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    Ok(favorites)
}
