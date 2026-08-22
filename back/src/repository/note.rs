use crate::model::note::Note;
use rusqlite::{Connection, Result, params};

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

pub fn find_by_note_id(conn: &Connection, user_id: &str, note_id: &i64) -> Result<Note> {
    let mut stmt = conn.prepare(
        "
        SELECT
          note_id,
          title,
          content,
          updated_at
        FROM
          note
        WHERE user_id = ?1
              AND note_id = ?2
        ",
    )?;

    let note = stmt.query_row(params![user_id, note_id], |row| {
        Ok(Note {
            note_id: row.get(0)?,
            user_id: String::new(),
            title: row.get(1)?,
            content: row.get(2)?,
            updated_at: row.get(3)?,
        })
    })?;
    Ok(note)
}

pub fn create_note(conn: &Connection, user_id: &str, title: &str) -> Result<i64> {
    conn.execute(
        "
        INSERT INTO note (
          user_id,
          title,
          content
        )
        VALUES (
          ?1,
          ?2,
          ''
        )
        ",
        [user_id, title],
    )?;

    Ok(conn.last_insert_rowid())
}
