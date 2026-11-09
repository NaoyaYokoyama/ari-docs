use crate::{common::id::generate_node_id, database::connection, repository::node as node_repo};
use rusqlite::Connection;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

// ノード同期（BAT0301）。folder/ のすべてのファイル・フォルダを node テーブルに合わせる:
// 無いものを登録し、消えたものの行（とお気に入り）を消し、更新日時を記録する。
// ふだんは見張り（node_watch）が変わった所だけを反映するので、これは取りこぼしの補いとして 10 分ごとに動かす
pub fn execute(folder_root: &str) -> io::Result<()> {
    let root_path = Path::new(folder_root);
    let mut paths = Vec::new();
    scan_directory(root_path, &mut paths)?;
    let conn = connection::connect();
    let registered = node_repo::find_all_modified(&conn).map_err(io::Error::other)?;

    let mut seen = std::collections::HashSet::new();
    let mut added = 0;
    for path in paths {
        let Some(relative) = relative_path(root_path, &path) else {
            continue;
        };
        let modified_at = modified_at(&path);
        match registered.get(&relative) {
            None => {
                node_repo::create_node(&conn, &generate_node_id(), &relative)
                    .map_err(io::Error::other)?;
                node_repo::update_modified_at(&conn, &relative, modified_at)
                    .map_err(io::Error::other)?;
                added += 1;
            }
            Some(saved) if *saved != modified_at => {
                node_repo::update_modified_at(&conn, &relative, modified_at)
                    .map_err(io::Error::other)?;
            }
            Some(_) => {}
        }
        seen.insert(relative);
    }

    // 消えたもの（アプリの外で消された・移された）の行とお気に入りを消す
    let mut removed = 0;
    for path in registered.keys() {
        if !seen.contains(path) {
            removed += node_repo::delete_with_descendants(&conn, path).map_err(io::Error::other)?;
        }
    }
    if added > 0 || removed > 0 {
        println!("node_sync: added = {added}, removed = {removed}");
    }
    Ok(())
}

// 見張りで変わったと分かったパスだけを反映する。あれば登録して更新日時を記録し（フォルダなら中も）、無ければ行を消す
pub fn sync_paths(folder_root: &str, changed: &[PathBuf]) -> io::Result<()> {
    let root_path = Path::new(folder_root);
    let conn = connection::connect();
    for path in changed {
        let Some(relative) = relative_path(root_path, path) else {
            continue;
        };
        if fs::symlink_metadata(path).is_ok() {
            register(&conn, path, &relative)?;
            if path.is_dir() {
                let mut children = Vec::new();
                scan_directory(path, &mut children)?;
                for child in children {
                    if let Some(child_relative) = relative_path(root_path, &child) {
                        register(&conn, &child, &child_relative)?;
                    }
                }
            }
        } else {
            node_repo::delete_with_descendants(&conn, &relative).map_err(io::Error::other)?;
        }
    }
    Ok(())
}

fn register(conn: &Connection, path: &Path, relative: &str) -> io::Result<()> {
    if node_repo::find_node_id_by_node_path(conn, relative)
        .map_err(io::Error::other)?
        .is_none()
    {
        node_repo::create_node(conn, &generate_node_id(), relative).map_err(io::Error::other)?;
    }
    node_repo::update_modified_at(conn, relative, modified_at(path)).map_err(io::Error::other)?;
    Ok(())
}

// 画面側と合わせてルートからの相対パスにする（ルート自身・ルートの外は None）
fn relative_path(root_path: &Path, path: &Path) -> Option<String> {
    let relative = path
        .strip_prefix(root_path)
        .ok()?
        .to_string_lossy()
        .to_string();
    (!relative.is_empty()).then_some(relative)
}

fn modified_at(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// 読めないフォルダは飛ばす（1 つのフォルダのせいで全体の同期が止まらないように）
fn scan_directory(path: &Path, paths: &mut Vec<PathBuf>) -> io::Result<()> {
    let Ok(entries) = fs::read_dir(path) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let entry_path = entry.path();
        paths.push(entry_path.clone());
        // シンボリックリンクのフォルダはたどらない（ループを防ぐため）
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            scan_directory(&entry_path, paths)?;
        }
    }
    Ok(())
}
