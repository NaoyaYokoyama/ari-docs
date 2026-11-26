use std::io;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::{
    common::{
        fs_util::{move_path, relative_slash_path, remove_path, size_of, unique_name},
        id::generate_trash_id,
    },
    config::app::AppConfig,
    repository::{node as node_repo, trash as trash_repo},
    service::node::{resolve, validate_name},
};

// ゴミ箱のフォルダ（<データのフォルダ>/trash）。1 件ごとに trash_id のフォルダを作り、その中に元の名前で置く
pub fn trash_dir(config: &AppConfig) -> PathBuf {
    config.data_dir().join("trash")
}

fn item_path(config: &AppConfig, trash_id: &str, name: &str) -> PathBuf {
    trash_dir(config).join(trash_id).join(name)
}

fn not_found(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::NotFound, message.to_string())
}

fn db_error(e: rusqlite::Error) -> io::Error {
    io::Error::other(e)
}

// 削除（FN0302-BR01）。ファイル・フォルダをゴミ箱へ移し、node の行とお気に入りを消す（FN0301-BR15）
pub fn move_to_trash(
    conn: &Connection,
    config: &AppConfig,
    parent_path: &str,
    node_type: &str,
    name: &str,
    user_id: &str,
) -> io::Result<()> {
    // name が空や ".." だと親フォルダ以上を消してしまうため弾く
    validate_name(name)?;
    let full_path = resolve(&config.folder_root, parent_path)?.join(name);
    if std::fs::symlink_metadata(&full_path).is_err() {
        return Err(not_found("ファイル・フォルダが見つかりません"));
    }
    let relative_path =
        relative_slash_path(Path::new(&config.folder_root), &full_path).unwrap_or_default();
    let trash_id = generate_trash_id();
    let size = size_of(&full_path) as i64;
    let node_type = if full_path.is_dir() {
        "folder"
    } else {
        node_type
    };
    move_path(&full_path, &item_path(config, &trash_id, name))?;
    trash_repo::create(
        conn,
        &trash_id,
        &relative_path,
        name,
        node_type,
        size,
        user_id,
    )
    .map_err(db_error)?;
    // ファイルは移っているので、失敗してもログに出すだけにする。お気に入りは元に戻すときのために控えてから消す（FN0302-BR08）
    if !relative_path.is_empty() {
        if let Err(e) = trash_repo::save_favorites(conn, &trash_id, &relative_path) {
            crate::elog!("move_to_trash favorites error: {:?}", e);
        }
        if let Err(e) = trash_repo::save_descriptions(conn, &trash_id, &relative_path) {
            crate::elog!("move_to_trash descriptions error: {:?}", e);
        }
        // 以前の版（FN0301-BR39）は、元に戻したときのためにゴミ箱の中のものとして控える
        crate::service::node_version::to_trash(conn, &trash_id, &relative_path);
        if let Err(e) = node_repo::delete_with_descendants(conn, &relative_path) {
            crate::elog!("move_to_trash cleanup error: {:?}", e);
        }
    }
    Ok(())
}

// 元の場所に戻す（FN0302-BR03）。元のフォルダが無ければ作り、同じ名前があれば「名前 (2)」にする。戻した場所を返す
pub fn restore(conn: &Connection, config: &AppConfig, trash_id: &str) -> io::Result<String> {
    let item = trash_repo::find_by_id(conn, trash_id)
        .map_err(db_error)?
        .ok_or_else(|| not_found("ゴミ箱に見つかりません"))?;
    let source = item_path(config, trash_id, &item.name);
    if std::fs::symlink_metadata(&source).is_err() {
        trash_repo::delete(conn, trash_id).map_err(db_error)?;
        return Err(not_found("ゴミ箱の中のファイルが見つかりません"));
    }
    let parent_relative = Path::new(&item.original_path)
        .parent()
        .map(|parent| parent.to_string_lossy().to_string())
        .unwrap_or_default();
    let parent = resolve(&config.folder_root, &parent_relative)?;
    std::fs::create_dir_all(&parent)?;
    let name = unique_name(&parent, &item.name);
    move_path(&source, &parent.join(&name))?;
    let _ = std::fs::remove_dir_all(trash_dir(config).join(trash_id));
    let restored = if parent_relative.is_empty() {
        name
    } else {
        format!("{parent_relative}/{name}")
    };
    // お気に入りを、戻した場所で入れ直す（名前が変わっていても。FN0302-BR08）
    for (user_id, path) in trash_repo::find_favorites(conn, trash_id).unwrap_or_default() {
        let target = if path.is_empty() {
            restored.clone()
        } else {
            format!("{restored}/{path}")
        };
        if let Err(e) = crate::service::favorite::create_favorite(conn, &user_id, &target, "", "") {
            crate::elog!("restore favorite error: {:?}", e);
        }
    }
    // 説明も戻した場所で入れ直す（FN0301-BR33）
    for (path, description) in trash_repo::find_descriptions(conn, trash_id).unwrap_or_default() {
        let target = if path.is_empty() {
            restored.clone()
        } else {
            format!("{restored}/{path}")
        };
        let node_id = crate::common::id::generate_node_id();
        if let Err(e) = node_repo::update_description(conn, &node_id, &target, &description) {
            crate::elog!("restore description error: {:?}", e);
        }
    }
    crate::service::node_version::from_trash(conn, trash_id, &restored);
    trash_repo::delete(conn, trash_id).map_err(db_error)?;
    Ok(restored)
}

// 完全に削除（FN0302-BR04）
pub fn delete_permanently(conn: &Connection, config: &AppConfig, trash_id: &str) -> io::Result<()> {
    let dir = trash_dir(config).join(trash_id);
    if dir.exists() {
        remove_path(&dir)?;
    }
    crate::service::node_version::delete_trashed(conn, config, trash_id);
    if trash_repo::delete(conn, trash_id).map_err(db_error)? == 0 {
        return Err(not_found("ゴミ箱に見つかりません"));
    }
    Ok(())
}

// ゴミ箱を空にする。消した件数を返す
pub fn empty(conn: &Connection, config: &AppConfig) -> io::Result<usize> {
    let items = trash_repo::find_all(conn).map_err(db_error)?;
    for item in &items {
        delete_permanently(conn, config, &item.trash_id)?;
    }
    Ok(items.len())
}

// 保存期間を過ぎたものを消す（FN0302-BR05）
pub fn purge(conn: &Connection, config: &AppConfig, days: i64, max_mb: i64) -> io::Result<usize> {
    let mut ids = trash_repo::find_older_than(conn, days).map_err(db_error)?;
    // 容量の上限（0 は上限なし）を超えた分は、古いものから消す（FN0302-BR09）
    if max_mb > 0 {
        for id in trash_repo::find_over_capacity(conn, max_mb.saturating_mul(1024 * 1024))
            .map_err(db_error)?
        {
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
    }
    for id in &ids {
        delete_permanently(conn, config, id)?;
    }
    Ok(ids.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::app::AppMode;
    use std::fs;

    fn setup(name: &str) -> (PathBuf, AppConfig, Connection) {
        let dir = std::env::temp_dir().join(format!("ari-trash-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("folder/a/b")).unwrap();
        fs::write(dir.join("folder/a/b/memo.txt"), "memo").unwrap();
        fs::write(dir.join("folder/keep.txt"), "").unwrap();
        let config = AppConfig {
            mode: AppMode::Local,
            folder_root: dir.join("folder").to_string_lossy().to_string(),
            database_path: dir.join("data/ari.db").to_string_lossy().to_string(),
            docs_default_root: String::new(),
            bind_address: String::new(),
            port: 0,
            tls_cert: String::new(),
            tls_key: String::new(),
            ocr_models_dir: String::new(),
        };
        let conn = Connection::open_in_memory().unwrap();
        for sql in [
            include_str!("../data/migration/T002_create_user.sql"),
            include_str!("../data/migration/T004_create_node.sql"),
            include_str!("../data/migration/T005_create_favorite.sql"),
            include_str!("../data/migration/T009_create_search_index.sql"),
            include_str!("../data/migration/T010_create_trash_backup.sql"),
            include_str!("../data/migration/T020_create_trash_favorite.sql"),
            include_str!("../data/migration/T021_add_favorite_sort_order.sql"),
            include_str!("../data/migration/T022_node_description.sql"),
            include_str!("../data/migration/T025_node_version.sql"),
        ] {
            conn.execute_batch(sql).unwrap();
        }
        (dir, config, conn)
    }

    #[test]
    fn trash_and_restore() {
        let (dir, config, conn) = setup("restore");
        node_repo::create_node(&conn, "n1", "a/b").unwrap();
        node_repo::create_node(&conn, "n2", "a/b/memo.txt").unwrap();
        node_repo::update_description(&conn, "n2", "a/b/memo.txt", "大事なメモ").unwrap();
        conn.execute_batch(
            "INSERT INTO favorite (favorite_id, user_id, node_id, note_id, wiki_id) VALUES ('fv_1', 'u1', 'n1', '', ''), ('fv_2', 'u2', 'n2', '', '');",
        )
        .unwrap();

        move_to_trash(&conn, &config, "a", "folder", "b", "local").unwrap();
        let favorites = |conn: &Connection| -> Vec<(String, String)> {
            let mut stmt = conn
                .prepare("SELECT favorite.user_id, node.path FROM favorite JOIN node USING (node_id) ORDER BY 1")
                .unwrap();
            stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
                .unwrap()
                .map(Result::unwrap)
                .collect()
        };
        assert!(favorites(&conn).is_empty());
        assert!(!dir.join("folder/a/b").exists());
        assert!(node_repo::find_all(&conn).unwrap().is_empty());
        let items = trash_repo::find_all(&conn).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!((items[0].original_path.as_str(), items[0].size), ("a/b", 4));

        // 元のフォルダが消えていても作り直し、同じ名前があれば (2) を付ける
        fs::remove_dir_all(dir.join("folder/a")).unwrap();
        assert_eq!(restore(&conn, &config, &items[0].trash_id).unwrap(), "a/b");
        // お気に入りも戻る（FN0302-BR08）
        assert_eq!(
            favorites(&conn),
            vec![
                ("u1".to_string(), "a/b".to_string()),
                ("u2".to_string(), "a/b/memo.txt".to_string())
            ]
        );
        // 説明も戻る（FN0301-BR33）
        let descriptions =
            node_repo::find_descriptions_by_paths(&conn, &["a/b/memo.txt".to_string()]).unwrap();
        assert_eq!(descriptions["a/b/memo.txt"], "大事なメモ");
        assert_eq!(
            fs::read_to_string(dir.join("folder/a/b/memo.txt")).unwrap(),
            "memo"
        );
        move_to_trash(&conn, &config, "", "file", "keep.txt", "local").unwrap();
        fs::write(dir.join("folder/keep.txt"), "new").unwrap();
        let id = trash_repo::find_all(&conn).unwrap()[0].trash_id.clone();
        assert_eq!(restore(&conn, &config, &id).unwrap(), "keep (2).txt");
        assert!(trash_repo::find_all(&conn).unwrap().is_empty());
        assert!(move_to_trash(&conn, &config, "", "file", "..", "local").is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn delete_empty_and_purge() {
        let (dir, config, conn) = setup("purge");
        move_to_trash(&conn, &config, "", "file", "keep.txt", "local").unwrap();
        move_to_trash(&conn, &config, "", "folder", "a", "local").unwrap();
        let id = trash_repo::find_all(&conn).unwrap()[0].trash_id.clone();
        delete_permanently(&conn, &config, &id).unwrap();
        assert!(!trash_dir(&config).join(&id).exists());
        // 保存期間内なら消さない
        assert_eq!(purge(&conn, &config, 30, 0).unwrap(), 0);
        conn.execute(
            "UPDATE trash SET deleted_at = datetime('now', '-31 days')",
            [],
        )
        .unwrap();
        assert_eq!(purge(&conn, &config, 30, 0).unwrap(), 1);
        move_to_trash(&conn, &config, "", "folder", "a", "local").ok();
        assert_eq!(empty(&conn, &config).unwrap(), 0);
        fs::remove_dir_all(&dir).unwrap();
    }

    // 容量の上限を超えたら、古いものから消す（FN0302-BR09）
    #[test]
    fn purge_over_capacity() {
        let (dir, config, conn) = setup("capacity");
        fs::write(dir.join("folder/big.bin"), vec![0u8; 700 * 1024]).unwrap();
        fs::write(dir.join("folder/new.bin"), vec![0u8; 700 * 1024]).unwrap();
        move_to_trash(&conn, &config, "", "file", "big.bin", "local").unwrap();
        conn.execute(
            "UPDATE trash SET deleted_at = datetime('now', '-1 days')",
            [],
        )
        .unwrap();
        move_to_trash(&conn, &config, "", "file", "new.bin", "local").unwrap();
        // 上限なし・上限内なら消さない
        assert_eq!(purge(&conn, &config, 30, 0).unwrap(), 0);
        assert_eq!(purge(&conn, &config, 30, 2).unwrap(), 0);
        // 1 MB を超えた分（古い big.bin）を消す
        assert_eq!(purge(&conn, &config, 30, 1).unwrap(), 1);
        let left = trash_repo::find_all(&conn).unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].name, "new.bin");
        fs::remove_dir_all(&dir).unwrap();
    }
}
