use rusqlite::{Connection, OptionalExtension, Result, params};

// 検索の対象外（search_exclusion。FN0202-BR16）
pub struct ExclusionRow {
    pub exclusion_id: String,
    // 空なら全員
    pub user_id: String,
    pub kind: String,
    pub value: String,
    // 登録したユーザーの表示名
    pub created_by: String,
    pub created_at: String,
}

// 全員の対象外と、user_id の人の対象外（user_id が None なら全員の対象外だけ）
pub fn find_for(conn: &Connection, user_id: Option<&str>) -> Result<Vec<ExclusionRow>> {
    let sql = "
        SELECT
          search_exclusion.exclusion_id,
          search_exclusion.user_id,
          search_exclusion.kind,
          search_exclusion.value,
          COALESCE(user.display_name, search_exclusion.created_by),
          search_exclusion.created_at
        FROM
          search_exclusion
          LEFT JOIN user ON user.user_id = search_exclusion.created_by
        WHERE
          search_exclusion.user_id = ''
          OR search_exclusion.user_id = ?1
        ORDER BY
          search_exclusion.kind ASC,
          search_exclusion.value ASC
        ";
    let mut stmt = conn.prepare(sql)?;
    // user_id が None のときは、どの人にも一致しない値で探す（空は全員を表すため使えない）
    stmt.query_map([user_id.unwrap_or("\0")], |row| {
        Ok(ExclusionRow {
            exclusion_id: row.get(0)?,
            user_id: row.get(1)?,
            kind: row.get(2)?,
            value: row.get(3)?,
            created_by: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?
    .collect()
}

// 同じもの（同じ人・種類・値）があれば登録せず 0 を返す
pub fn create(
    conn: &Connection,
    exclusion_id: &str,
    user_id: &str,
    kind: &str,
    value: &str,
    created_by: &str,
) -> Result<usize> {
    let sql = "
        INSERT OR IGNORE INTO search_exclusion (
          exclusion_id,
          user_id,
          kind,
          value,
          created_by
        )
        VALUES (
          ?1,
          ?2,
          ?3,
          ?4,
          ?5
        )
        ";
    conn.execute(sql, params![exclusion_id, user_id, kind, value, created_by])
}

// 対象外にする人（空なら全員）。無ければ None
pub fn find_owner(conn: &Connection, exclusion_id: &str) -> Result<Option<String>> {
    conn.query_row(
        "SELECT user_id FROM search_exclusion WHERE exclusion_id = ?1",
        [exclusion_id],
        |row| row.get(0),
    )
    .optional()
}

pub fn delete(conn: &Connection, exclusion_id: &str) -> Result<usize> {
    conn.execute(
        "DELETE FROM search_exclusion WHERE exclusion_id = ?1",
        [exclusion_id],
    )
}
