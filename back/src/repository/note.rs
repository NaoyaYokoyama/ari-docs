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
            title LIKE '%' || ?1 || '%' ESCAPE '\\'
            OR content LIKE '%' || ?1 || '%' ESCAPE '\\'
          )
        -- タイトルに合うものを先に、同じなら新しい順（FN0201-BR03）
        ORDER BY (title LIKE '%' || ?1 || '%' ESCAPE '\\') DESC, updated_at DESC
        ";
    let mut stmt = conn.prepare(sql)?;
    let notes = stmt
        .query_map(
            params![super::search::escape_like(keyword), user_id],
            |row| {
                Ok(Note {
                    note_id: row.get(0)?,
                    user_id: String::new(),
                    title: row.get(1)?,
                    content: String::new(),
                    updated_at: row.get(2)?,
                })
            },
        )?
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
              AND note_id in ({placeholders})
        "
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

#[cfg(test)]
mod tests {
    use super::*;

    // タイトルに合うものが先、同じなら新しい順（FN0201-BR03）
    #[test]
    fn search_puts_title_matches_first() {
        let conn = Connection::open_in_memory().unwrap();
        crate::database::migration::migrate(&conn);
        for (id, title, content, at) in [
            ("nt_1", "議事録", "", "2026-01-01 00:00:00"),
            ("nt_2", "メモ", "議事録の下書き", "2026-03-01 00:00:00"),
            ("nt_3", "議事録 2", "", "2026-02-01 00:00:00"),
            ("nt_4", "ほか", "", "2026-04-01 00:00:00"),
        ] {
            conn.execute(
                "INSERT INTO note (note_id, user_id, title, content, updated_at) VALUES (?1, 'local', ?2, ?3, ?4)",
                params![id, title, content, at],
            )
            .unwrap();
        }
        let ids: Vec<String> = find_by_search(&conn, "local", "議事録")
            .unwrap()
            .into_iter()
            .map(|note| note.note_id)
            .collect();
        assert_eq!(ids, ["nt_3", "nt_1", "nt_2"]);
    }
}
