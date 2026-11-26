use rusqlite::{Connection, OptionalExtension, params};
use std::fs;
use std::io::{Error, ErrorKind};
use std::path::{Path, PathBuf};

use crate::common::id::generate_node_id;
use crate::config::app::AppConfig;
use crate::repository::node as node_repo;
use crate::service::{node, node_lock, server_settings};

// ファイルの以前の版（FN0301-BR39）。ari-docs で上書きする（アップロード・開いて保存したものの戻し・版を戻す）前の中身を、
// データのフォルダの versions/ に残す。1 つのファイルにつき、サーバーの設定の数（既定 10）まで。0 なら残さない

#[derive(Debug, Clone, PartialEq)]
pub struct Version {
    pub version_id: String,
    pub name: String,
    pub size: i64,
    pub modified_at: i64,
    pub replaced_by: String,
    pub replaced_at: i64,
}

pub fn versions_dir(config: &AppConfig) -> PathBuf {
    config.data_dir().join("versions")
}

fn version_file(config: &AppConfig, version_id: &str) -> PathBuf {
    versions_dir(config).join(version_id)
}

fn db_error(e: rusqlite::Error) -> Error {
    Error::other(e)
}

// path の node_id（見張り・同期がまだ登録していなければ、ここで登録する）
fn ensure_node_id(conn: &Connection, path: &str) -> std::io::Result<String> {
    if let Some(id) = node_repo::find_node_id_by_node_path(conn, path).map_err(db_error)? {
        return Ok(id);
    }
    node_repo::create_node(conn, &generate_node_id(), path).map_err(db_error)?;
    node_repo::find_node_id_by_node_path(conn, path)
        .map_err(db_error)?
        .ok_or_else(|| Error::new(ErrorKind::NotFound, "ファイルが見つかりません"))
}

// 上書きする前に、今の中身を以前の版として残す（ファイルは versions/ へ移す。移せなければ写す）。
// 残せなくても上書きは止めない（ログに出す）
pub fn keep_before_overwrite(
    conn: &Connection,
    config: &AppConfig,
    user_id: &str,
    path: &str,
    full: &Path,
) {
    if let Err(e) = keep(conn, config, user_id, path, full) {
        crate::elog!("keep version error ({path}): {e:?}");
    }
}

fn keep(
    conn: &Connection,
    config: &AppConfig,
    user_id: &str,
    path: &str,
    full: &Path,
) -> std::io::Result<()> {
    let keep_count = server_settings::get(conn).file_version_keep;
    let Ok(metadata) = fs::metadata(full) else {
        return Ok(());
    };
    if keep_count <= 0 || !metadata.is_file() {
        return Ok(());
    }
    let node_id = ensure_node_id(conn, path)?;
    let version_id = uuid::Uuid::new_v4().simple().to_string();
    let dest = version_file(config, &version_id);
    fs::create_dir_all(versions_dir(config))?;
    if fs::rename(full, &dest).is_err() {
        fs::copy(full, &dest)?;
    }
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default();
    let name = full
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    conn.execute(
        "INSERT INTO node_version (version_id, node_id, name, size, modified_at, replaced_by, replaced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![version_id, node_id, name, metadata.len() as i64, modified_at, user_id, node_lock::now()],
    )
    .map_err(db_error)?;
    prune(conn, config, &node_id, keep_count)
}

// 数を超えた古い版を消す
fn prune(
    conn: &Connection,
    config: &AppConfig,
    node_id: &str,
    keep_count: i64,
) -> std::io::Result<()> {
    let old: Vec<String> = conn
        .prepare(
            "SELECT version_id FROM node_version WHERE node_id = ?1
             ORDER BY replaced_at DESC, rowid DESC LIMIT -1 OFFSET ?2",
        )
        .and_then(|mut stmt| {
            stmt.query_map(params![node_id, keep_count], |row| row.get(0))?
                .collect()
        })
        .map_err(db_error)?;
    for version_id in old {
        delete_version(conn, config, &version_id)?;
    }
    Ok(())
}

fn delete_version(conn: &Connection, config: &AppConfig, version_id: &str) -> std::io::Result<()> {
    let _ = fs::remove_file(version_file(config, version_id));
    conn.execute(
        "DELETE FROM node_version WHERE version_id = ?1",
        [version_id],
    )
    .map_err(db_error)?;
    Ok(())
}

// そのファイルの以前の版（新しい順）。上書きした人の表示名付き
pub fn list(conn: &Connection, path: &str) -> std::io::Result<Vec<(Version, String)>> {
    let Some(node_id) =
        node_repo::find_node_id_by_node_path(conn, path.trim_matches('/')).map_err(db_error)?
    else {
        return Ok(Vec::new());
    };
    conn.prepare(
        "SELECT v.version_id, v.name, v.size, v.modified_at, v.replaced_by, v.replaced_at, COALESCE(u.display_name, '')
         FROM node_version v LEFT JOIN user u ON u.user_id = v.replaced_by
         WHERE v.node_id = ?1 ORDER BY v.replaced_at DESC, v.rowid DESC",
    )
    .and_then(|mut stmt| {
        stmt.query_map([node_id], |row| {
            Ok((
                Version {
                    version_id: row.get(0)?,
                    name: row.get(1)?,
                    size: row.get(2)?,
                    modified_at: row.get(3)?,
                    replaced_by: row.get(4)?,
                    replaced_at: row.get(5)?,
                },
                row.get(6)?,
            ))
        })?
        .collect()
    })
    .map_err(db_error)
}

// path のファイルの版か確かめて、その版のファイルと名前を返す
pub fn find(
    conn: &Connection,
    config: &AppConfig,
    path: &str,
    version_id: &str,
) -> std::io::Result<(PathBuf, Version)> {
    let not_found = || Error::new(ErrorKind::NotFound, "以前の版が見つかりません");
    let node_id = node_repo::find_node_id_by_node_path(conn, path.trim_matches('/'))
        .map_err(db_error)?
        .ok_or_else(not_found)?;
    let version = conn
        .query_row(
            "SELECT version_id, name, size, modified_at, replaced_by, replaced_at FROM node_version
             WHERE version_id = ?1 AND node_id = ?2",
            [version_id, &node_id],
            |row| {
                Ok(Version {
                    version_id: row.get(0)?,
                    name: row.get(1)?,
                    size: row.get(2)?,
                    modified_at: row.get(3)?,
                    replaced_by: row.get(4)?,
                    replaced_at: row.get(5)?,
                })
            },
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(not_found)?;
    let file = version_file(config, version_id);
    if !file.is_file() {
        return Err(not_found());
    }
    Ok((file, version))
}

// 以前の版に戻す。今の中身も以前の版として残す（戻したあとでも、戻す前に戻れる）
pub fn restore(
    conn: &Connection,
    config: &AppConfig,
    user_id: &str,
    path: &str,
    version_id: &str,
) -> std::io::Result<()> {
    let path = path.trim_matches('/');
    node_lock::ensure_unlocked(conn, user_id, &[path.to_string()])?;
    let (file, _) = find(conn, config, path, version_id)?;
    let full = node::resolve(&config.folder_root, path)?;
    if !full.is_file() {
        return Err(Error::new(ErrorKind::NotFound, "ファイルが見つかりません"));
    }
    // 戻す版を先に写しておく（今の中身を残すときに、数を超えて消えることがあるため）
    let temp = versions_dir(config).join(format!("restore-{}", uuid::Uuid::new_v4().simple()));
    fs::copy(&file, &temp)?;
    keep_before_overwrite(conn, config, user_id, path, &full);
    let result = fs::rename(&temp, &full).or_else(|_| fs::copy(&temp, &full).map(|_| ()));
    let _ = fs::remove_file(&temp);
    result
}

// 行き場の無くなった版を片付ける（毎時。FN0301-BR39）。
// - ファイルが ari-docs の外で消された・名前を変えられた（ノードの同期が行を消した）
// - ゴミ箱の中のものとして控えたが、ゴミ箱にもう無い
// - 行の無いファイル・ファイルの無い行（バックアップから戻したときなど）。戻すときの一時ファイル（1 日より前）も消す
pub fn cleanup(conn: &Connection, config: &AppConfig) -> usize {
    let stale: Vec<String> = conn
        .prepare(
            "SELECT version_id FROM node_version
             WHERE (substr(node_id, 1, 6) <> 'trash:' AND node_id NOT IN (SELECT node_id FROM node))
                OR (substr(node_id, 1, 6) = 'trash:'
                    AND substr(node_id, 7, instr(substr(node_id, 7), ':') - 1) NOT IN (SELECT trash_id FROM trash))",
        )
        .and_then(|mut stmt| stmt.query_map([], |row| row.get(0))?.collect())
        .unwrap_or_else(|e| {
            crate::elog!("version cleanup error: {e:?}");
            Vec::new()
        });
    let mut removed = 0;
    for version_id in stale {
        if delete_version(conn, config, &version_id).is_ok() {
            removed += 1;
        }
    }
    let known: std::collections::HashSet<String> = conn
        .prepare("SELECT version_id FROM node_version")
        .and_then(|mut stmt| stmt.query_map([], |row| row.get(0))?.collect())
        .unwrap_or_default();
    // ファイルの無い行
    for version_id in &known {
        if !version_file(config, version_id).is_file()
            && delete_version(conn, config, version_id).is_ok()
        {
            removed += 1;
        }
    }
    // 行の無いファイル
    let day_ago = std::time::SystemTime::now() - std::time::Duration::from_secs(86_400);
    for entry in fs::read_dir(versions_dir(config))
        .into_iter()
        .flatten()
        .flatten()
    {
        let name = entry.file_name().to_string_lossy().to_string();
        let temp_old = name.starts_with("restore-")
            && entry
                .metadata()
                .and_then(|m| m.modified())
                .is_ok_and(|time| time < day_ago);
        if (!name.starts_with("restore-") && !known.contains(&name)) || temp_old {
            if fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
    }
    removed
}

// ゴミ箱へ移すとき: 中のファイルの版を、ゴミ箱の中のものとして控える（元に戻したら付け直す）
pub fn to_trash(conn: &Connection, trash_id: &str, path: &str) {
    let result = conn.execute(
        "UPDATE node_version SET node_id = 'trash:' || ?2 || ':' ||
           CASE WHEN node.path = ?1 THEN '' ELSE substr(node.path, length(?1) + 2) END
         FROM node
         WHERE node.node_id = node_version.node_id
           AND (node.path = ?1 OR substr(node.path, 1, length(?1) + 1) = ?1 || '/')",
        params![path, trash_id],
    );
    if let Err(e) = result {
        crate::elog!("version to trash error: {e:?}");
    }
}

// ゴミ箱から戻したとき: 戻した場所のファイルに付け直す
pub fn from_trash(conn: &Connection, trash_id: &str, restored: &str) {
    let prefix = format!("trash:{trash_id}:");
    let keys: Vec<String> = conn
        .prepare(
            "SELECT DISTINCT node_id FROM node_version WHERE substr(node_id, 1, length(?1)) = ?1",
        )
        .and_then(|mut stmt| stmt.query_map([&prefix], |row| row.get(0))?.collect())
        .unwrap_or_default();
    for key in keys {
        let sub = &key[prefix.len()..];
        let target = if sub.is_empty() {
            restored.to_string()
        } else {
            format!("{restored}/{sub}")
        };
        let result = ensure_node_id(conn, &target).and_then(|node_id| {
            conn.execute(
                "UPDATE node_version SET node_id = ?1 WHERE node_id = ?2",
                [&node_id, &key],
            )
            .map_err(db_error)
        });
        if let Err(e) = result {
            crate::elog!("version from trash error: {e:?}");
        }
    }
}

// ゴミ箱から完全に消したとき: その版も消す
pub fn delete_trashed(conn: &Connection, config: &AppConfig, trash_id: &str) {
    let prefix = format!("trash:{trash_id}:");
    let ids: Vec<String> = conn
        .prepare("SELECT version_id FROM node_version WHERE substr(node_id, 1, length(?1)) = ?1")
        .and_then(|mut stmt| stmt.query_map([&prefix], |row| row.get(0))?.collect())
        .unwrap_or_default();
    for version_id in ids {
        if let Err(e) = delete_version(conn, config, &version_id) {
            crate::elog!("delete trashed version error: {e:?}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::app::AppMode;
    use crate::database::migration::migrate;

    fn setup(name: &str) -> (PathBuf, AppConfig, Connection) {
        let dir = std::env::temp_dir().join(format!("ari-version-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("folder/a")).unwrap();
        let config = AppConfig {
            mode: AppMode::Shared,
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
        migrate(&conn);
        (dir, config, conn)
    }

    // 上書きのたびに前の中身を残し、数を超えたら古いものから消す。戻すと、戻す前の中身も残る
    #[test]
    fn keeps_prunes_and_restores() {
        let (dir, config, conn) = setup("keep");
        let file = dir.join("folder/a/memo.txt");
        let mut settings = server_settings::get(&conn);
        settings.file_version_keep = 2;
        server_settings::save(&conn, &settings).unwrap();
        for text in ["v1", "v2", "v3"] {
            fs::write(&file, text).unwrap();
            keep_before_overwrite(&conn, &config, "u1", "a/memo.txt", &file);
        }
        fs::write(&file, "v4").unwrap();
        let versions = list(&conn, "a/memo.txt").unwrap();
        assert_eq!(versions.len(), 2);
        let (newest, _) = &versions[0];
        let (path, _) = find(&conn, &config, "a/memo.txt", &newest.version_id).unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "v3");
        restore(
            &conn,
            &config,
            "u1",
            "a/memo.txt",
            &versions[1].0.version_id,
        )
        .unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "v2");
        let (latest, _) = &list(&conn, "a/memo.txt").unwrap()[0];
        let (path, _) = find(&conn, &config, "a/memo.txt", &latest.version_id).unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "v4");
        fs::remove_dir_all(&dir).unwrap();
    }

    // ari-docs の外で消された（行が無くなった）ファイルの版と、行の無いファイルは片付ける。ゴミ箱の中のものは残す
    #[test]
    fn cleanup_removes_orphans() {
        let (dir, config, conn) = setup("cleanup");
        for name in ["gone.txt", "kept.txt", "trashed.txt"] {
            let file = dir.join("folder/a").join(name);
            fs::write(&file, "old").unwrap();
            keep_before_overwrite(&conn, &config, "u1", &format!("a/{name}"), &file);
        }
        node_repo::delete_with_descendants(&conn, "a/gone.txt").unwrap();
        conn.execute(
            "INSERT INTO trash (trash_id, original_path, name, node_type, size, deleted_by) VALUES ('t1', 'a/trashed.txt', 'trashed.txt', 'file', 0, 'u1')",
            [],
        )
        .unwrap();
        to_trash(&conn, "t1", "a/trashed.txt");
        fs::write(versions_dir(&config).join("stray"), "x").unwrap();
        assert_eq!(cleanup(&conn, &config), 2);
        assert_eq!(list(&conn, "a/kept.txt").unwrap().len(), 1);
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM node_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 2);
        fs::remove_dir_all(&dir).unwrap();
    }

    // ゴミ箱へ移して戻すと、版も付いてくる。完全に消すと版も消える
    #[test]
    fn follows_trash() {
        let (dir, config, conn) = setup("trash");
        let file = dir.join("folder/a/memo.txt");
        fs::write(&file, "old").unwrap();
        keep_before_overwrite(&conn, &config, "u1", "a/memo.txt", &file);
        fs::write(&file, "new").unwrap();
        to_trash(&conn, "t1", "a");
        node_repo::delete_with_descendants(&conn, "a").unwrap();
        assert!(list(&conn, "a/memo.txt").unwrap().is_empty());
        from_trash(&conn, "t1", "a (2)");
        assert_eq!(list(&conn, "a (2)/memo.txt").unwrap().len(), 1);
        to_trash(&conn, "t2", "a (2)/memo.txt");
        delete_trashed(&conn, &config, "t2");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM node_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
        assert_eq!(fs::read_dir(versions_dir(&config)).unwrap().count(), 0);
        fs::remove_dir_all(&dir).unwrap();
    }
}
