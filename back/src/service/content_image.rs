// Note・Wiki の本文に貼り付けた画像（FN0404）。画面で縮小（WebP・長い辺 1920 画素）してから送られてくる。
// 画像は DB に入れる（バックアップ・復元で本文と一緒に扱えるように）
use rusqlite::Connection;

use crate::common::id;
use crate::repository::content_image as image_repo;

// 受け取る大きさの上限（縮小したあとの画像。アニメーションの GIF などは縮小しないのでこの大きさで止める）
pub const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

#[derive(Debug, PartialEq)]
pub enum SaveError {
    // 種類（note / wiki）が違う
    InvalidKind,
    // PNG・JPEG・GIF・WebP 以外（SVG は中にスクリプトを書けるので受け取らない）
    UnsupportedType,
    TooLarge,
    Db(String),
}

// 中身の先頭のバイトで形式を見る（送られてきた Content-Type や名前は信用しない）
pub fn detect_mime(data: &[u8]) -> Option<&'static str> {
    if data.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

pub fn save(
    conn: &Connection,
    user_id: &str,
    kind: &str,
    data: &[u8],
) -> Result<String, SaveError> {
    if kind != "note" && kind != "wiki" {
        return Err(SaveError::InvalidKind);
    }
    if data.len() > MAX_IMAGE_BYTES {
        return Err(SaveError::TooLarge);
    }
    let mime = detect_mime(data).ok_or(SaveError::UnsupportedType)?;
    let image_id = id::generate_image_id();
    image_repo::insert(conn, &image_id, kind, user_id, mime, data)
        .map_err(|e| SaveError::Db(e.to_string()))?;
    Ok(image_id)
}

// 見られる画像なら（形式, 中身）。Wiki の画像は誰でも、Note の画像は貼り付けた本人と、その画像を使っている Wiki を読める人
pub fn load(conn: &Connection, user_id: &str, image_id: &str) -> Option<(String, Vec<u8>)> {
    let image = image_repo::find(conn, image_id).ok()??;
    let readable = image.kind == "wiki"
        || image.user_id == user_id
        || image_repo::used_by_wiki(conn, image_id).unwrap_or(false);
    readable.then_some((image.mime, image.data))
}

// 使われなくなった画像を消す（BAT0901。1 時間ごと）
pub fn purge_unused(conn: &Connection) {
    match image_repo::delete_unused(conn) {
        Ok(0) => {}
        Ok(count) => println!("content image: removed {count} unused images"),
        Err(e) => eprintln!("content image purge: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n0000";

    fn connect() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        for sql in [
            include_str!("../data/migration/T006_create_note.sql"),
            include_str!("../data/migration/T007_create_wiki.sql"),
            include_str!("../data/migration/T014_create_content_history.sql"),
            include_str!("../data/migration/T017_create_content_image.sql"),
        ] {
            conn.execute_batch(sql).unwrap();
        }
        conn
    }

    #[test]
    fn detects_only_raster_images() {
        assert_eq!(detect_mime(PNG), Some("image/png"));
        assert_eq!(detect_mime(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(detect_mime(b"GIF89a...."), Some("image/gif"));
        assert_eq!(detect_mime(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(
            detect_mime(b"<svg xmlns=\"http://www.w3.org/2000/svg\">"),
            None
        );
        assert_eq!(detect_mime(b""), None);
    }

    #[test]
    fn save_checks_kind_type_and_size() {
        let conn = connect();
        assert_eq!(save(&conn, "a", "file", PNG), Err(SaveError::InvalidKind));
        assert_eq!(
            save(&conn, "a", "note", b"<svg/>"),
            Err(SaveError::UnsupportedType)
        );
        let mut large = PNG.to_vec();
        large.resize(MAX_IMAGE_BYTES + 1, 0);
        assert_eq!(save(&conn, "a", "note", &large), Err(SaveError::TooLarge));
        assert!(save(&conn, "a", "note", PNG).unwrap().starts_with("im_"));
    }

    #[test]
    fn note_image_is_private_unless_used_by_wiki() {
        let conn = connect();
        let note_image = save(&conn, "a", "note", PNG).unwrap();
        let wiki_image = save(&conn, "a", "wiki", PNG).unwrap();
        assert_eq!(load(&conn, "a", &note_image).unwrap().0, "image/png");
        assert!(load(&conn, "b", &note_image).is_none());
        assert!(load(&conn, "b", &wiki_image).is_some());
        assert!(load(&conn, "a", "im_none").is_none());
        // Note の画像を Wiki に写したら、ほかの人も見られる
        conn.execute(
            "INSERT INTO wiki (wiki_id, user_id, title, content) VALUES ('w', 'a', 't', ?1)",
            [format!("![画像](/api/content-image/{note_image})")],
        )
        .unwrap();
        assert!(load(&conn, "b", &note_image).is_some());
    }

    #[test]
    fn purge_removes_only_old_unused_images() {
        let conn = connect();
        let used_by_note = save(&conn, "a", "note", PNG).unwrap();
        let used_by_history = save(&conn, "a", "wiki", PNG).unwrap();
        let unused = save(&conn, "a", "note", PNG).unwrap();
        let fresh = save(&conn, "a", "note", PNG).unwrap();
        conn.execute(
            "INSERT INTO note (note_id, user_id, title, content) VALUES ('n', 'a', 't', ?1)",
            [format!("![](/api/content-image/{used_by_note})")],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO content_history (kind, content_id, title, content, updated_by, saved_at) VALUES ('wiki', 'w', 't', ?1, 'a', '')",
            [format!("![](/api/content-image/{used_by_history})")],
        )
        .unwrap();
        conn.execute(
            "UPDATE content_image SET created_at = datetime('now', '-2 days') WHERE image_id <> ?1",
            [&fresh],
        )
        .unwrap();
        purge_unused(&conn);
        for (image_id, kept) in [
            (&used_by_note, true),
            (&used_by_history, true),
            (&unused, false),
            (&fresh, true),
        ] {
            assert_eq!(
                image_repo::find(&conn, image_id).unwrap().is_some(),
                kept,
                "{image_id}"
            );
        }
    }
}
