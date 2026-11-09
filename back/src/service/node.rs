use crate::api::node::{response::Node, response::NodeResponse};
use crate::common::fs_util::{copy_recursive, split_extension};
use crate::model::node_type::NodeType;
use crate::repository::{favorite as favorite_repo, node as node_repo};
use rusqlite::Connection;
use std::fs;
use std::path::{Component, Path, PathBuf};

// 一覧（FN0301-BR02）。読めない項目（アクセス権が無い・壊れたリンクなど）は飛ばし、一覧の取得は止めない
pub fn get_nodes(
    conn: &Connection,
    folder_root: &str,
    user_id: &str,
    path: &str,
) -> std::io::Result<NodeResponse> {
    let path = if path == "/" {
        ""
    } else {
        path.trim_start_matches('/')
    };
    let full_path = PathBuf::from(folder_root).join(path);
    let entries = fs::read_dir(&full_path)?;
    let mut nodes = Vec::new();
    let current_path = path.trim_start_matches('/').to_string();
    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };
        // リンクは先をたどった情報を使い、たどれなければリンク自身の情報を使う
        let Ok(metadata) = fs::metadata(entry.path()).or_else(|_| entry.metadata()) else {
            continue;
        };
        let node_type = if metadata.is_dir() {
            NodeType::Folder
        } else {
            NodeType::File
        };
        let updated_at = metadata.modified().unwrap_or(std::time::UNIX_EPOCH);
        let size = if metadata.is_file() {
            metadata.len()
        } else {
            0
        };
        let relative_path = relative_path(folder_root, &full_path.join(entry.file_name()));
        if relative_path.is_empty() {
            continue;
        }
        nodes.push(Node {
            node_id: String::new(),
            path: relative_path,
            name: entry.file_name().to_string_lossy().to_string(),
            node_type,
            status: "working".to_string(),
            description: String::new(),
            updated_by: String::new(),
            updated_at: chrono::DateTime::<chrono::Local>::from(updated_at)
                .format("%Y/%m/%d %H:%M")
                .to_string(),
            favorite_id: String::new(),
            size,
        });
    }

    let paths: Vec<String> = nodes.iter().map(|node| node.path.clone()).collect();
    let favorite_ids = favorite_repo::find_node_favorite_ids_by_paths(conn, user_id, &paths)
        .map_err(std::io::Error::other)?;
    for node in &mut nodes {
        if let Some(favorite_id) = favorite_ids.get(&node.path) {
            node.favorite_id = favorite_id.clone();
        }
    }

    Ok(NodeResponse {
        current_path: current_path.to_string(),
        nodes: nodes,
    })
}

// ノードを作る。同じ名前があればエラーにする（ファイルを空で上書きしないため）
pub fn create_node(
    folder_root: &str,
    parent_path: &str,
    node_type: &str,
    name: &str,
) -> std::io::Result<()> {
    validate_name(name)?;
    let parent = resolve(folder_root, parent_path)?;
    if !parent.is_dir() {
        return Err(not_found("作成先のフォルダが見つかりません"));
    }
    let full_path = parent.join(name);
    if full_path.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            format!("「{name}」は既にあります"),
        ));
    }

    if node_type == "folder" {
        fs::create_dir(full_path)
    } else {
        fs::File::create_new(full_path).map(|_| ())
    }
}

// ノードのルートからの相対パス（一覧取得と同じ作り方。node テーブルのパスと一致させるため）
fn relative_path(folder_root: &str, full_path: &Path) -> String {
    full_path
        .strip_prefix(folder_root)
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn conflict(message: String) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::AlreadyExists, message)
}

// 名前を変える。node テーブルのパス（フォルダなら中のものも）も変え、お気に入りなどをそのまま使えるようにする
pub fn rename_node(
    conn: &Connection,
    folder_root: &str,
    parent_path: &str,
    name: &str,
    new_name: &str,
) -> std::io::Result<()> {
    validate_name(name)?;
    validate_name(new_name)?;
    let parent = resolve(folder_root, parent_path)?;
    let from = parent.join(name);
    let to = parent.join(new_name);
    if fs::symlink_metadata(&from).is_err() {
        return Err(not_found("ファイル・フォルダが見つかりません"));
    }
    if name == new_name {
        return Ok(());
    }
    // 大文字・小文字だけを変えるとき（Windows では同じ名前として「ある」と判定される）は許す
    if to.exists() && name.to_lowercase() != new_name.to_lowercase() {
        return Err(conflict(format!("「{new_name}」は既にあります")));
    }
    fs::rename(&from, &to)?;
    update_node_paths(conn, folder_root, &from, &to);
    Ok(())
}

// 移動先のフォルダへ移す。どれか 1 つでも移せないとき（同じ名前がある・自分の中へ移す）は、何も移さない
pub fn move_nodes(
    conn: &Connection,
    folder_root: &str,
    paths: &[String],
    dest_path: &str,
) -> std::io::Result<usize> {
    let dest = resolve(folder_root, dest_path)?;
    if !dest.is_dir() {
        return Err(not_found("移動先のフォルダが見つかりません"));
    }
    let mut moves = Vec::new();
    for path in paths {
        let from = resolve(folder_root, path)?;
        let name = file_name(&from);
        if name.is_empty() || fs::symlink_metadata(&from).is_err() {
            return Err(not_found("ファイル・フォルダが見つかりません"));
        }
        let to = dest.join(&name);
        if to == from {
            // 同じフォルダへの移動は何もしない
            continue;
        }
        if dest.starts_with(&from) {
            return Err(invalid(&format!(
                "「{name}」をその中のフォルダへは移動できません"
            )));
        }
        if to.exists() {
            return Err(conflict(format!("移動先に「{name}」が既にあります")));
        }
        moves.push((from, to));
    }
    for (from, to) in &moves {
        fs::rename(from, to)?;
        update_node_paths(conn, folder_root, from, to);
    }
    Ok(moves.len())
}

// コピー先のフォルダへ複製する。同じ名前があれば「名前 - コピー」「名前 - コピー (2)」… にする。
// コピーしたものは、次のノード同期（BAT0301）で node テーブルに登録される
pub fn copy_nodes(
    folder_root: &str,
    paths: &[String],
    dest_path: &str,
) -> std::io::Result<Vec<String>> {
    let dest = resolve(folder_root, dest_path)?;
    if !dest.is_dir() {
        return Err(not_found("コピー先のフォルダが見つかりません"));
    }
    let mut sources = Vec::new();
    for path in paths {
        let from = resolve(folder_root, path)?;
        let name = file_name(&from);
        if name.is_empty() || fs::symlink_metadata(&from).is_err() {
            return Err(not_found("ファイル・フォルダが見つかりません"));
        }
        if from.is_dir() && dest.starts_with(&from) {
            return Err(invalid(&format!(
                "「{name}」をその中のフォルダへはコピーできません"
            )));
        }
        sources.push((from, name));
    }
    let mut names = Vec::new();
    for (from, name) in sources {
        let new_name = unique_copy_name(&dest, &name);
        copy_recursive(&from, &dest.join(&new_name))?;
        names.push(new_name);
    }
    Ok(names)
}

// "memo.txt" -> "memo - コピー.txt"、"memo - コピー (2).txt" …（Windows のエクスプローラーと同じ付け方）
fn unique_copy_name(dir: &Path, name: &str) -> String {
    if !dir.join(name).exists() {
        return name.to_string();
    }
    let (stem, ext) = split_extension(name);
    (1..)
        .map(|n| {
            let suffix = if n == 1 {
                " - コピー".to_string()
            } else {
                format!(" - コピー ({n})")
            };
            format!("{stem}{suffix}{ext}")
        })
        .find(|candidate| !dir.join(candidate).exists())
        .unwrap()
}

// 移した・名前を変えたノードの node テーブルのパスを変える。ファイルはもう移っているので、失敗してもログに出すだけにする
fn update_node_paths(conn: &Connection, folder_root: &str, from: &Path, to: &Path) {
    let old = relative_path(folder_root, from);
    let new = relative_path(folder_root, to);
    if old.is_empty() || new.is_empty() {
        return;
    }
    if let Err(e) = node_repo::move_paths(conn, &old, &new) {
        eprintln!("update node paths error: {:?}", e);
    }
}

// ダウンロードするファイル。フォルダは対象外
pub fn file_for_download(folder_root: &str, path: &str) -> std::io::Result<PathBuf> {
    let full_path = resolve(folder_root, path)?;
    if !full_path.is_file() {
        return Err(not_found("ファイルが見つかりません"));
    }
    Ok(full_path)
}

fn invalid(message: &str) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidInput, message.to_string())
}

fn not_found(message: &str) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::NotFound, message.to_string())
}

// ノードのルートからの相対パスを、ルートの中の絶対パスにする。
// ".."・絶対パス・ドライブ指定を含むものはルートの外を指せるため弾く（先頭の "/" は取り除く）
pub fn resolve(folder_root: &str, relative: &str) -> std::io::Result<PathBuf> {
    let relative = Path::new(relative.trim_start_matches(['/', '\\']));
    if relative
        .components()
        .any(|component| !matches!(component, Component::Normal(_) | Component::CurDir))
    {
        return Err(invalid("パスが正しくありません"));
    }
    Ok(PathBuf::from(folder_root).join(relative))
}

// ファイル・フォルダの名前。Windows で使えない文字も弾く
pub fn validate_name(name: &str) -> std::io::Result<()> {
    if name.trim().is_empty() {
        return Err(invalid("名前を入力してください"));
    }
    if name == "." || name == ".." {
        return Err(invalid("この名前は使えません"));
    }
    if name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|']) {
        return Err(invalid("名前に / \\ : * ? \" < > | は使えません"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_rejects_paths_outside_root() {
        assert_eq!(resolve("/r", "a/b").unwrap(), PathBuf::from("/r/a/b"));
        assert_eq!(resolve("/r", "/a").unwrap(), PathBuf::from("/r/a"));
        assert_eq!(resolve("/r", "").unwrap(), PathBuf::from("/r"));
        assert!(resolve("/r", "..").is_err());
        assert!(resolve("/r", "a/../../b").is_err());
        assert!(resolve("/r", "//etc").is_ok_and(|p| p == PathBuf::from("/r/etc")));
    }

    #[test]
    fn validate_name_rejects_unsafe_names() {
        assert!(validate_name("memo.txt").is_ok());
        for name in ["", " ", ".", "..", "a/b", "a\\b", "a:b", "a?b"] {
            assert!(validate_name(name).is_err(), "{name}");
        }
    }

    fn temp_root(name: &str) -> (PathBuf, Connection) {
        let dir = std::env::temp_dir().join(format!("ari-node-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../data/migration/T004_create_node.sql"))
            .unwrap();
        conn.execute_batch(include_str!("../data/migration/T005_create_favorite.sql"))
            .unwrap();
        conn.execute_batch(include_str!(
            "../data/migration/T009_create_search_index.sql"
        ))
        .unwrap();
        (dir, conn)
    }

    fn paths(conn: &Connection) -> Vec<String> {
        let mut paths: Vec<String> = node_repo::find_all_paths(conn)
            .unwrap()
            .into_iter()
            .collect();
        paths.sort();
        paths
    }

    #[test]
    fn rename_node_keeps_node_ids() {
        let (dir, conn) = temp_root("rename");
        fs::create_dir_all(dir.join("a/b")).unwrap();
        fs::write(dir.join("a/b/memo.txt"), "").unwrap();
        fs::write(dir.join("other.txt"), "").unwrap();
        let root = dir.to_str().unwrap();
        for (id, path) in [
            ("n1", "a"),
            ("n2", "a/b"),
            ("n3", "a/b/memo.txt"),
            ("n4", "ab"),
        ] {
            node_repo::create_node(&conn, id, path).unwrap();
        }

        rename_node(&conn, root, "", "a", "z").unwrap();
        assert!(dir.join("z/b/memo.txt").exists());
        assert_eq!(paths(&conn), ["ab", "z", "z/b", "z/b/memo.txt"]);
        assert_eq!(
            node_repo::find_node_id_by_node_path(&conn, "z/b/memo.txt")
                .unwrap()
                .unwrap(),
            "n3"
        );
        let error = rename_node(&conn, root, "", "z", "other.txt").unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::AlreadyExists);
        assert!(rename_node(&conn, root, "", "z", "a/b").is_err());
        // 大文字・小文字だけの変更
        rename_node(&conn, root, "", "other.txt", "Other.txt").unwrap();
        assert!(dir.join("Other.txt").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn move_nodes_checks_all_before_moving() {
        let (dir, conn) = temp_root("move");
        fs::create_dir_all(dir.join("a/sub")).unwrap();
        fs::create_dir_all(dir.join("dest")).unwrap();
        fs::write(dir.join("x.txt"), "").unwrap();
        fs::write(dir.join("y.txt"), "").unwrap();
        fs::write(dir.join("dest/y.txt"), "").unwrap();
        let root = dir.to_str().unwrap();
        node_repo::create_node(&conn, "n1", "x.txt").unwrap();
        node_repo::create_node(&conn, "n2", "a").unwrap();
        node_repo::create_node(&conn, "n3", "a/sub").unwrap();
        // 古い行（実体の無い dest/a）は消してから移す
        node_repo::create_node(&conn, "old", "dest/a").unwrap();

        let paths_of = |list: &[&str]| list.iter().map(|p| p.to_string()).collect::<Vec<_>>();
        // y.txt は移動先にあるので、x.txt も移さない
        let error = move_nodes(&conn, root, &paths_of(&["x.txt", "y.txt"]), "dest").unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::AlreadyExists);
        assert!(dir.join("x.txt").exists());
        // 自分の中へは移せない
        assert!(move_nodes(&conn, root, &paths_of(&["a"]), "a/sub").is_err());

        assert_eq!(
            move_nodes(&conn, root, &paths_of(&["x.txt", "a"]), "dest").unwrap(),
            2
        );
        assert!(dir.join("dest/x.txt").exists() && dir.join("dest/a/sub").is_dir());
        assert_eq!(paths(&conn), ["dest/a", "dest/a/sub", "dest/x.txt"]);
        assert_eq!(
            node_repo::find_node_id_by_node_path(&conn, "dest/a")
                .unwrap()
                .unwrap(),
            "n2"
        );
        // 同じフォルダへの移動は何もしない
        assert_eq!(
            move_nodes(&conn, root, &paths_of(&["dest/x.txt"]), "dest").unwrap(),
            0
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn copy_nodes_adds_copy_suffix() {
        let (dir, _) = temp_root("copy");
        fs::create_dir_all(dir.join("a/sub")).unwrap();
        fs::write(dir.join("a/sub/memo.txt"), "keep").unwrap();
        fs::write(dir.join("memo.txt"), "1").unwrap();
        let root = dir.to_str().unwrap();
        let paths_of = |list: &[&str]| list.iter().map(|p| p.to_string()).collect::<Vec<_>>();

        assert_eq!(
            copy_nodes(root, &paths_of(&["memo.txt"]), "").unwrap(),
            ["memo - コピー.txt"]
        );
        assert_eq!(
            copy_nodes(root, &paths_of(&["memo.txt"]), "").unwrap(),
            ["memo - コピー (2).txt"]
        );
        assert_eq!(
            copy_nodes(root, &paths_of(&["a"]), "").unwrap(),
            ["a - コピー"]
        );
        assert_eq!(
            fs::read_to_string(dir.join("a - コピー/sub/memo.txt")).unwrap(),
            "keep"
        );
        assert_eq!(
            copy_nodes(root, &paths_of(&["memo.txt"]), "a").unwrap(),
            ["memo.txt"]
        );
        assert!(copy_nodes(root, &paths_of(&["a"]), "a/sub").is_err());
        assert!(copy_nodes(root, &paths_of(&["../x"]), "").is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn split_extension_keeps_dotfiles() {
        assert_eq!(split_extension("a.tar.gz"), ("a.tar", ".gz"));
        assert_eq!(split_extension(".gitignore"), (".gitignore", ""));
        assert_eq!(split_extension("README"), ("README", ""));
    }

    #[test]
    fn create_node_does_not_overwrite() {
        let dir = std::env::temp_dir().join(format!("ari-node-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let root = dir.to_str().unwrap();
        create_node(root, "", "file", "a.txt").unwrap();
        fs::write(dir.join("a.txt"), "keep").unwrap();
        let error = create_node(root, "", "file", "a.txt").unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read_to_string(dir.join("a.txt")).unwrap(), "keep");
        assert!(create_node(root, "..", "folder", "x").is_err());
        fs::remove_dir_all(&dir).unwrap();
    }
}
