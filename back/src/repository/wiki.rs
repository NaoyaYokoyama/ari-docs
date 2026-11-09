use crate::model::wiki::Wiki;
use rusqlite::{Connection, Result, params, params_from_iter};

// Wikiは全ユーザーで共有するため、作成者(user_id)では絞り込まない
pub fn find_all(conn: &Connection) -> Result<Vec<Wiki>> {
    let sql = "
        SELECT
          wiki_id,
          title,
          updated_at
        FROM
          wiki
        ORDER BY
          title ASC 
        ";
    let mut stmt = conn.prepare(sql)?;

    let wikis = stmt
        .query_map([], |row| {
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

pub fn find_by_wiki_id(conn: &Connection, wiki_id: &str) -> Result<Wiki> {
    let sql = "
        SELECT
          wiki_id,
          title,
          content,
          updated_at
        FROM
          wiki
        WHERE
          wiki_id = ?1
        ";

    let mut stmt = conn.prepare(sql)?;

    let wiki = stmt.query_row(params![wiki_id], |row| {
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

pub fn find_by_wiki_ids(conn: &Connection, wiki_ids: &[String]) -> Result<Vec<Wiki>> {
    if wiki_ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = vec!["?"; wiki_ids.len()].join(",");
    let sql = format!(
        "
            SELECT
              wiki_id,
              title,
              content,
              updated_at
            FROM
              wiki
            WHERE
              wiki_id IN ({})
            ",
        placeholders
    );
    let mut stmt = conn.prepare(&sql)?;
    let wikis = stmt
        .query_map(params_from_iter(wiki_ids), |row| {
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
    let sql = "
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
        ";

    let mut stmt = conn.prepare(sql)?;

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
    let sql = "
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
        ";

    conn.execute(sql, [wiki_id, user_id, title])?;

    Ok(conn.last_insert_rowid())
}

pub fn delete_wiki(conn: &Connection, wiki_id: &str) -> Result<usize> {
    let sql = "
        DELETE FROM
          wiki
        WHERE
          wiki_id = ?1
        ";
    conn.execute(sql, params![wiki_id])
}

pub fn update_wiki(
    conn: &Connection,
    wiki_id: &str,
    title: &str,
    content: &str,
    updated_by: &str,
) -> Result<usize> {
    let sql = "
        UPDATE
          wiki
        SET
          title = ?2,
          content = ?3,
          updated_by = ?4,
          updated_at = CURRENT_TIMESTAMP
        WHERE
          wiki_id = ?1
        ";
    conn.execute(sql, params![wiki_id, title, content, updated_by])
}

// 最後に更新した人（まだ誰も更新していなければ作成者）の表示名（FN0501-BR09）
pub fn find_updated_by_name(conn: &Connection, wiki_id: &str) -> Result<String> {
    let sql = "
        SELECT
          COALESCE(user.display_name, CASE wiki.updated_by WHEN '' THEN wiki.user_id ELSE wiki.updated_by END)
        FROM
          wiki
          LEFT JOIN user ON user.user_id = CASE wiki.updated_by WHEN '' THEN wiki.user_id ELSE wiki.updated_by END
        WHERE
          wiki.wiki_id = ?1
        ";
    conn.query_row(sql, [wiki_id], |row| row.get(0))
}

// 最近更新された Wiki（ホーム。FN0201-BR07）。戻り値は (wiki_id, title, updated_at, 最後に更新した人の表示名)
pub fn find_recent(conn: &Connection, limit: i64) -> Result<Vec<(String, String, String, String)>> {
    let sql = "
        SELECT
          wiki.wiki_id,
          wiki.title,
          wiki.updated_at,
          COALESCE(user.display_name, CASE wiki.updated_by WHEN '' THEN wiki.user_id ELSE wiki.updated_by END)
        FROM
          wiki
          LEFT JOIN user ON user.user_id = CASE wiki.updated_by WHEN '' THEN wiki.user_id ELSE wiki.updated_by END
        ORDER BY
          wiki.updated_at DESC
        LIMIT ?1
        ";
    let mut stmt = conn.prepare(sql)?;
    stmt.query_map([limit], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    })?
    .collect()
}
