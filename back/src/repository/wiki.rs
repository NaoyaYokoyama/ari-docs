use crate::model::wiki::Wiki;
use rusqlite::{Connection, Result, params};

pub fn find_by_user_id(conn: &Connection, user_id: &str) -> Result<Vec<Wiki>> {
    let mut stmt = conn.prepare(
        "
        SELECT
          wiki_id,
          title,
          updated_at
        FROM
          wiki
        WHERE
          user_id = ?1
        ORDER BY
          title ASC 
        LIMIT 30
        ",
    )?;

    let wikis = stmt
        .query_map([user_id], |row| {
            Ok(Wiki {
                wiki_id: row.get(0)?,
                user_id: String::new(),
                title: row.get(1)?,
                content: String::new(),
                updated_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    Ok(wikis)
}

pub fn find_by_wiki_id(conn: &Connection, user_id: &str, wiki_id: &str) -> Result<Wiki> {
    let mut stmt = conn.prepare(
        "
        SELECT
          wiki_id,
          title,
          content,
          updated_at
        FROM
          wiki
        WHERE
          user_id = ?1
          AND wiki_id = ?2
        ",
    )?;

    let wiki = stmt.query_row(params![user_id, wiki_id], |row| {
        Ok(Wiki {
            wiki_id: row.get(0)?,
            user_id: String::new(),
            title: row.get(1)?,
            content: row.get(2)?,
            updated_at: row.get(3)?,
        })
    })?;
    Ok(wiki)
}

pub fn find_by_wiki_ids(conn: &Connection, user_id: &str, wiki_ids: &str) -> Result<Vec<Wiki>> {
    let mut stmt = conn.prepare(
        "
        SELECT
          note_id,
          title,
          content,
          updated_at
        FROM
          wiki
        WHERE
          user_id = ?1
          AND wiki_id in (?2)
        ",
    )?;

    let wikis = stmt
        .query_map(params![user_id, wiki_ids], |row| {
            Ok(Wiki {
                wiki_id: row.get(0)?,
                user_id: String::new(),
                title: row.get(1)?,
                content: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    Ok(wikis)
}

pub fn find_by_search(conn: &Connection, keyword: &str) -> Result<Vec<Wiki>> {
    let mut stmt = conn.prepare(
        "
        SELECT
          wiki_id,
          title,
          content,
          updated_at
        FROM
          wiki
        WHERE 
          title Like '%' || ?1 || '%'
          OR content Like '%' || ?1 || '%'
        ",
    )?;

    let wiki = stmt
        .query_map(params![keyword], |row| {
            Ok(Wiki {
                wiki_id: row.get(0)?,
                user_id: String::new(),
                title: row.get(1)?,
                content: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    Ok(wiki)
}

pub fn create_wiki(conn: &Connection, user_id: &str, wiki_id: &str, title: &str) -> Result<i64> {
    conn.execute(
        "
        INSERT INTO wiki (
          wiki_id,
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
        ",
        [wiki_id, user_id, title],
    )?;

    Ok(conn.last_insert_rowid())
}

pub fn delete_wiki(conn: &Connection, user_id: &str, wiki_id: &str) -> Result<usize> {
    conn.execute(
        "
        DELETE FROM 
          wiki
        WHERE
          user_id = ?1
          AND wiki_id = ?2
        ",
        params![user_id, wiki_id],
    )
}

pub fn update_wiki(
    conn: &Connection,
    user_id: &str,
    wiki_id: &str,
    title: &str,
    content: &str,
) -> Result<usize> {
    conn.execute(
        "
        UPDATE
          wiki
        SET
          title = ?3,
          content = ?4,
          updated_at = CURRENT_TIMESTAMP
        WHERE
          user_id = ?1
          AND wiki_id = ?2
        ",
        params![user_id, wiki_id, title, content],
    )
}
