use rusqlite::{Connection, Result};

use crate::model::note::Note;

pub fn find_by_user_id(conn: &Connection, user_id: &str) -> Result<Vec<Note>> {
    let mut stmt = conn.prepare(
        "
        SELECT
          note_id,
          title,
          updated_at
        FROM
          note
        WHERE user_id = ?1
        ORDER BY title ASC 
        LIMIT 30
        ",
    )?;

    let notes = stmt
        .query_map([user_id], |row| {
            Ok(Note {
                note_id: row.get(0)?,
                user_id: String::new(),
                title: row.get(1)?,
                content: String::new(),
                updated_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    Ok(notes)
}
