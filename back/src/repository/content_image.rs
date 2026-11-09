use rusqlite::{Connection, OptionalExtension, Result, params};

// Note・Wiki の本文に貼り付けた画像（content_image）

pub struct ContentImage {
    pub kind: String,
    pub user_id: String,
    pub mime: String,
    pub data: Vec<u8>,
}

pub fn insert(
    conn: &Connection,
    image_id: &str,
    kind: &str,
    user_id: &str,
    mime: &str,
    data: &[u8],
) -> Result<()> {
    conn.execute(
        "INSERT INTO content_image (image_id, kind, user_id, mime, data, size) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![image_id, kind, user_id, mime, data, data.len() as i64],
    )?;
    Ok(())
}

pub fn find(conn: &Connection, image_id: &str) -> Result<Option<ContentImage>> {
    conn.query_row(
        "SELECT kind, user_id, mime, data FROM content_image WHERE image_id = ?1",
        params![image_id],
        |row| {
            Ok(ContentImage {
                kind: row.get(0)?,
                user_id: row.get(1)?,
                mime: row.get(2)?,
                data: row.get(3)?,
            })
        },
    )
    .optional()
}

// Wiki（今の本文か変更履歴）がその画像を使っているか。Note から Wiki へ写した画像もほかの人が見られるように
pub fn used_by_wiki(conn: &Connection, image_id: &str) -> Result<bool> {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM wiki WHERE instr(content, ?1) > 0)
             OR EXISTS (SELECT 1 FROM content_history WHERE kind = 'wiki' AND instr(content, ?1) > 0)",
        params![image_id],
        |row| row.get(0),
    )
}

// 本文・変更履歴のどこからも使われていない画像のうち、貼り付けてから 1 日たったものを消す
// （貼り付けてから保存するまでの間に消さないように 1 日待つ）。消した数を返す
pub fn delete_unused(conn: &Connection) -> Result<usize> {
    conn.execute(
        "DELETE FROM content_image
          WHERE created_at < datetime('now', '-1 day')
            AND NOT EXISTS (SELECT 1 FROM note WHERE instr(note.content, content_image.image_id) > 0)
            AND NOT EXISTS (SELECT 1 FROM wiki WHERE instr(wiki.content, content_image.image_id) > 0)
            AND NOT EXISTS (
                SELECT 1 FROM content_history WHERE instr(content_history.content, content_image.image_id) > 0
            )",
        [],
    )
}
