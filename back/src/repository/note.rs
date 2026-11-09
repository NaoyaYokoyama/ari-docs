use crate::model::note::Note;
use rusqlite::{Connection, Result, params, params_from_iter};

pub fn find_by_user_id(conn: &Connection, user_id: &str) -> Result<Vec<Note>> {
    let sql = "
        SELECT
          note_id,
          title,
          updated_at
        FROM
          note
        WHERE user_id = ?1
        ORDER BY title ASC 
        ";
    let mut stmt = conn.prepare(sql)?;
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

pub fn find_by_search(conn: &Connection, user_id: &str, keyword: &str) -> Result<Vec<Note>> {
    let sql = "
        SELECT
          note_id,
          title,
          updated_at
        FROM
          note
        WHERE
          user_id = ?2
          AND (
            title Like '%' || ?1 || '%'
            OR content Like '%' || ?1 || '%'
          )
        ORDER BY updated_at ASC 
        ";
    let mut stmt = conn.prepare(sql)?;
    let notes = stmt
        .query_map(params![keyword, user_id], |row| {
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

pub fn find_by_note_id(conn: &Connection, user_id: &str, note_id: &str) -> Result<Note> {
    let sql = "
        SELECT
          note_id,
          title,
          content,
          updated_at
        FROM
          note
        WHERE user_id = ?1
              AND note_id = ?2
        ";
    let mut stmt = conn.prepare(sql)?;
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

pub fn find_by_note_ids(
    conn: &Connection,
    user_id: &str,
    note_ids: &[String],
) -> Result<Vec<Note>> {
    let placeholders = vec!["?"; note_ids.len()].join(",");
    let sql = format!(
        "
        SELECT
          note_id,
          title,
          content,
          updated_at
        FROM
          note
        WHERE user_id = ?
              AND note_id in ({})
        ",
        placeholders
    );
    let mut stmt = conn.prepare(&sql)?;
    let params = std::iter::once(user_id).chain(note_ids.iter().map(String::as_str));
    let notes = stmt
        .query_map(params_from_iter(params), |row| {
            Ok(Note {
                note_id: row.get(0)?,
                user_id: String::new(),
                title: row.get(1)?,
                content: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    Ok(notes)
}

pub fn create_note(conn: &Connection, user_id: &str, note_id: &str, title: &str) -> Result<i64> {
    let sql = "
        INSERT INTO note (
          note_id,
          user_id,
          title,
          content
        )
        VALUES (
          ?1,
          ?2,
          ?3,
          ''
        )
        ";
    conn.execute(sql, [note_id, user_id, title])?;
    Ok(conn.last_insert_rowid())
}

pub fn delete_note(conn: &Connection, user_id: &str, note_id: &str) -> Result<usize> {
    let sql = "
        DELETE FROM 
          note
        WHERE
          user_id = ?1
          AND note_id = ?2
        ";
    conn.execute(sql, params![user_id, note_id])
}

pub fn update_note(
    conn: &Connection,
    user_id: &str,
    note_id: &str,
    title: &str,
    content: &str,
) -> Result<usize> {
    let sql = "
        UPDATE
          note
        SET
          title = ?3,
          content = ?4,
          updated_at = CURRENT_TIMESTAMP
        WHERE
          user_id = ?1
          AND note_id = ?2
        ";
    conn.execute(sql, params![user_id, note_id, title, content])
}

// 本人の最近更新した Note（ホーム。FN0201-BR07）。戻り値は (note_id, title, updated_at)
pub fn find_recent(
    conn: &Connection,
    user_id: &str,
    limit: i64,
) -> Result<Vec<(String, String, String)>> {
    let sql = "
        SELECT
          note_id,
          title,
          updated_at
        FROM
          note
        WHERE
          user_id = ?1
        ORDER BY
          updated_at DESC
        LIMIT ?2
        ";
    let mut stmt = conn.prepare(sql)?;
    stmt.query_map(params![user_id, limit], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    })?
    .collect()
}
