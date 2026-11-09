use rusqlite::{Connection, OptionalExtension, Result, params};

// Note・Wiki のフォルダ（FN0403）。kind は "note" / "wiki"。
// owner は Note のときだけ持ち主で絞り込む（Wiki のフォルダは全員で使うので None）
pub struct FolderRow {
    pub folder_id: String,
    pub parent_id: String,
    pub name: String,
}

const OWNER: &str = "(?2 IS NULL OR user_id = ?2)";

pub fn find_all(conn: &Connection, kind: &str, owner: Option<&str>) -> Result<Vec<FolderRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT folder_id, parent_id, name FROM content_folder WHERE kind = ?1 AND {OWNER} ORDER BY name"
    ))?;
    stmt.query_map(params![kind, owner], |row| {
        Ok(FolderRow {
            folder_id: row.get(0)?,
            parent_id: row.get(1)?,
            name: row.get(2)?,
        })
    })?
    .collect()
}

pub fn find(
    conn: &Connection,
    kind: &str,
    owner: Option<&str>,
    folder_id: &str,
) -> Result<Option<FolderRow>> {
    conn.query_row(
        &format!(
            "SELECT folder_id, parent_id, name FROM content_folder WHERE kind = ?1 AND {OWNER} AND folder_id = ?3"
        ),
        params![kind, owner, folder_id],
        |row| {
            Ok(FolderRow {
                folder_id: row.get(0)?,
                parent_id: row.get(1)?,
                name: row.get(2)?,
            })
        },
    )
    .optional()
}

// 同じ親の下に同じ名前のフォルダがあるか（except は名前を変えるフォルダ自身）
pub fn name_exists(
    conn: &Connection,
    kind: &str,
    owner: Option<&str>,
    parent_id: &str,
    name: &str,
    except: &str,
) -> Result<bool> {
    conn.query_row(
        &format!(
            "SELECT EXISTS (SELECT 1 FROM content_folder WHERE kind = ?1 AND {OWNER} AND parent_id = ?3 AND name = ?4 AND folder_id <> ?5)"
        ),
        params![kind, owner, parent_id, name, except],
        |row| row.get(0),
    )
}

pub fn create(
    conn: &Connection,
    kind: &str,
    user_id: &str,
    folder_id: &str,
    parent_id: &str,
    name: &str,
) -> Result<usize> {
    conn.execute(
        "INSERT INTO content_folder (folder_id, kind, user_id, parent_id, name) VALUES (?1, ?2, ?3, ?4, ?5)",
        [folder_id, kind, user_id, parent_id, name],
    )
}

pub fn rename(conn: &Connection, folder_id: &str, name: &str) -> Result<usize> {
    conn.execute(
        "UPDATE content_folder SET name = ?2 WHERE folder_id = ?1",
        [folder_id, name],
    )
}

pub fn set_parent(conn: &Connection, folder_id: &str, parent_id: &str) -> Result<usize> {
    conn.execute(
        "UPDATE content_folder SET parent_id = ?2 WHERE folder_id = ?1",
        [folder_id, parent_id],
    )
}

pub fn delete(conn: &Connection, folder_id: &str) -> Result<usize> {
    conn.execute(
        "DELETE FROM content_folder WHERE folder_id = ?1",
        [folder_id],
    )
}

// 中にフォルダか Note・Wiki があるか
pub fn has_children(conn: &Connection, kind: &str, folder_id: &str) -> Result<bool> {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM content_folder WHERE parent_id = ?2)
             OR EXISTS (SELECT 1 FROM content_folder_item WHERE kind = ?1 AND folder_id = ?2)",
        [kind, folder_id],
        |row| row.get(0),
    )
}

// Note・Wiki の入っているフォルダ。戻り値は (item_id, folder_id)。
// Note は持ち主のものだけ（ほかの人の Note の ID を返さないため）
pub fn find_items(
    conn: &Connection,
    kind: &str,
    owner: Option<&str>,
) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT item_id, folder_id FROM content_folder_item WHERE kind = ?1
           AND folder_id IN (SELECT folder_id FROM content_folder WHERE kind = ?1 AND {OWNER})"
    ))?;
    stmt.query_map(params![kind, owner], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect()
}

// Note・Wiki をフォルダへ入れる。folder_id が '' なら一番上（行を消す）
pub fn place_item(conn: &Connection, kind: &str, item_id: &str, folder_id: &str) -> Result<usize> {
    if folder_id.is_empty() {
        return delete_item(conn, kind, item_id);
    }
    conn.execute(
        "INSERT INTO content_folder_item (kind, item_id, folder_id) VALUES (?1, ?2, ?3)
         ON CONFLICT(kind, item_id) DO UPDATE SET folder_id = excluded.folder_id",
        [kind, item_id, folder_id],
    )
}

// Note・Wiki を削除したとき
pub fn delete_item(conn: &Connection, kind: &str, item_id: &str) -> Result<usize> {
    conn.execute(
        "DELETE FROM content_folder_item WHERE kind = ?1 AND item_id = ?2",
        [kind, item_id],
    )
}
