use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::{Datelike, Local, Timelike};
use rusqlite::{Connection, MAIN_DB};
use serde::{Deserialize, Serialize};
use zip::ZipWriter;

use crate::{
    common::{fs_util::move_path, id::generate_backup_id},
    config::app::AppConfig,
    database::migration,
    repository::{backup as backup_repo, system_setting},
    service::archive,
};

// バックアップ・復元は同時に 1 つだけ。復元中は定期のバッチも止める（is_busy）
static BUSY: Mutex<()> = Mutex::new(());

pub fn is_busy() -> bool {
    BUSY.try_lock().is_err()
}

// 管理者が決める設定（FN0901-BR02）
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupSettings {
    // off（しない）/ daily（毎日）/ weekly（毎週月曜）/ monthly（毎月 1 日）
    pub interval: String,
    // 実行する時刻（0〜23 時。その時刻を過ぎて最初の確認で取る）
    pub hour: u32,
    // 定期のバックアップを残す日数
    pub retention_days: i64,
    // 保存先のフォルダ（絶対パス）。空文字なら <データのフォルダ>/backups
    pub dir: String,
    // ゴミ箱に残す日数（FN0302-BR05）
    pub trash_retention_days: i64,
}

impl Default for BackupSettings {
    fn default() -> Self {
        Self {
            interval: "off".to_string(),
            hour: 3,
            retention_days: 30,
            dir: String::new(),
            trash_retention_days: 30,
        }
    }
}

const SETTINGS_KEY: &str = "backup_settings";

pub fn settings(conn: &Connection) -> rusqlite::Result<BackupSettings> {
    Ok(system_setting::find(conn, SETTINGS_KEY)?
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default())
}

pub fn save_settings(conn: &Connection, settings: &BackupSettings) -> Result<(), String> {
    if !matches!(
        settings.interval.as_str(),
        "off" | "daily" | "weekly" | "monthly"
    ) {
        return Err("間隔が正しくありません".to_string());
    }
    if settings.hour > 23 {
        return Err("時刻は 0〜23 時で指定してください".to_string());
    }
    if !(1..=3650).contains(&settings.retention_days)
        || !(1..=3650).contains(&settings.trash_retention_days)
    {
        return Err("保存期間は 1〜3650 日で指定してください".to_string());
    }
    let dir = settings.dir.trim();
    if !dir.is_empty() {
        let path = Path::new(dir);
        if !path.is_absolute() || !path.is_dir() {
            return Err(format!(
                "保存先のフォルダが見つかりません（絶対パスで指定してください）: {dir}"
            ));
        }
    }
    let mut saved = settings.clone();
    saved.dir = dir.to_string();
    system_setting::upsert(conn, SETTINGS_KEY, &serde_json::to_string(&saved).unwrap())
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn backup_dir(config: &AppConfig, settings: &BackupSettings) -> PathBuf {
    if settings.dir.is_empty() {
        config.data_dir().join("backups")
    } else {
        PathBuf::from(&settings.dir)
    }
}

fn file_path(backup: &backup_repo::Backup) -> PathBuf {
    Path::new(&backup.dir).join(&backup.file_name)
}

// バックアップを作る（FN0901-BR03）。ZIP に DB の写し（ari.db）と folder/ の中身を入れる
pub fn create_backup(
    conn: &Connection,
    config: &AppConfig,
    kind: &str,
    period: &str,
    user_id: &str,
) -> Result<backup_repo::Backup, String> {
    let _guard = BUSY.try_lock().map_err(|_| {
        "バックアップ・復元の実行中です。終わってからもう一度お試しください".to_string()
    })?;
    create_backup_locked(conn, config, kind, period, user_id)
}

fn create_backup_locked(
    conn: &Connection,
    config: &AppConfig,
    kind: &str,
    period: &str,
    user_id: &str,
) -> Result<backup_repo::Backup, String> {
    let settings = settings(conn).map_err(|e| e.to_string())?;
    let dir = backup_dir(config, &settings);
    fs::create_dir_all(&dir)
        .map_err(|e| format!("保存先のフォルダを作れません（{}）: {e}", dir.display()))?;
    let tmp = config.data_dir().join("tmp");
    fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;

    let backup_id = generate_backup_id();
    let file_name = format!(
        "ari-docs_{}_{}.zip",
        Local::now().format("%Y%m%d_%H%M%S"),
        kind
    );
    let partial = dir.join(format!(".{file_name}.partial"));
    let snapshot = tmp.join(format!("snapshot-{backup_id}.db"));

    let result = (|| -> Result<u64, String> {
        // DB は使っている途中でも壊れない写しを作る
        conn.execute("VACUUM INTO ?1", [snapshot.to_string_lossy().to_string()])
            .map_err(|e| format!("DB の写しを作れませんでした: {e}"))?;
        let file =
            fs::File::create(&partial).map_err(|e| format!("バックアップを書けません: {e}"))?;
        let mut zip = ZipWriter::new(file);
        archive::add_path(&mut zip, &snapshot, "ari.db").map_err(|e| e.to_string())?;
        zip.add_directory("folder/", zip::write::SimpleFileOptions::default())
            .map_err(|e| e.to_string())?;
        let mut entries: Vec<_> = fs::read_dir(&config.folder_root)
            .map_err(|e| format!("folder を読めません: {e}"))?
            .flatten()
            .collect();
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let name = format!("folder/{}", entry.file_name().to_string_lossy());
            archive::add_path(&mut zip, &entry.path(), &name)
                .map_err(|e| format!("{} を入れられませんでした: {e}", entry.path().display()))?;
        }
        zip.finish().map_err(|e| e.to_string())?;
        fs::rename(&partial, dir.join(&file_name)).map_err(|e| e.to_string())?;
        Ok(fs::metadata(dir.join(&file_name))
            .map(|m| m.len())
            .unwrap_or(0))
    })();
    let _ = fs::remove_file(&snapshot);
    let size = match result {
        Ok(size) => size,
        Err(e) => {
            let _ = fs::remove_file(&partial);
            return Err(e);
        }
    };
    backup_repo::create(
        conn,
        &backup_id,
        &file_name,
        &dir.to_string_lossy(),
        size as i64,
        kind,
        period,
        user_id,
    )
    .map_err(|e| e.to_string())?;
    backup_repo::find_by_id(conn, &backup_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "バックアップを記録できませんでした".to_string())
}

pub fn delete_backup(conn: &Connection, backup_id: &str) -> Result<(), String> {
    let _guard = BUSY
        .try_lock()
        .map_err(|_| "バックアップ・復元の実行中です".to_string())?;
    let backup = backup_repo::find_by_id(conn, backup_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "バックアップが見つかりません".to_string())?;
    let path = file_path(&backup);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("削除できませんでした: {e}"))?;
    }
    backup_repo::delete(conn, backup_id).map_err(|e| e.to_string())?;
    Ok(())
}

// ダウンロードするファイル。戻り値は (パス, ファイル名)
pub fn backup_file(conn: &Connection, backup_id: &str) -> Result<(PathBuf, String), String> {
    let backup = backup_repo::find_by_id(conn, backup_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "バックアップが見つかりません".to_string())?;
    let path = file_path(&backup);
    if !path.is_file() {
        return Err(
            "バックアップのファイルが見つかりません（移動・削除された可能性があります）"
                .to_string(),
        );
    }
    Ok((path, backup.file_name))
}

// 復元しても今のものを残す表（バックアップの記録・設定・ゴミ箱はバックアップの外にある実体と結びつくため。
// セッションは復元した人がログインしたままでいられるように）
const KEEP_TABLES: [&str; 4] = ["backup", "system_setting", "trash", "session"];

// 復元（FN0901-BR05）。先に今の状態をバックアップし（before_restore）、folder/ の中身と DB を入れ替える
pub fn restore_backup(
    conn: &mut Connection,
    config: &AppConfig,
    backup_id: &str,
    user_id: &str,
) -> Result<(), String> {
    let _guard = BUSY
        .try_lock()
        .map_err(|_| "バックアップ・復元の実行中です".to_string())?;
    let backup = backup_repo::find_by_id(conn, backup_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "バックアップが見つかりません".to_string())?;
    let source = file_path(&backup);
    let file = fs::File::open(&source)
        .map_err(|_| "バックアップのファイルが見つかりません".to_string())?;
    let mut zip =
        zip::ZipArchive::new(file).map_err(|e| format!("バックアップを読めません: {e}"))?;

    // 1. 一時フォルダに展開して確かめる
    let work = config
        .data_dir()
        .join("tmp")
        .join(format!("restore-{backup_id}"));
    let _ = fs::remove_dir_all(&work);
    fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let cleanup = |work: &Path| {
        let _ = fs::remove_dir_all(work);
    };
    for index in 0..zip.len() {
        if let Err(e) = archive::extract_entry(&mut zip, index, &work) {
            cleanup(&work);
            return Err(format!("バックアップを展開できません: {e}"));
        }
    }
    let restored_db = work.join("ari.db");
    let valid = Connection::open(&restored_db)
        .and_then(|db| {
            db.query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE name = 'node'",
                [],
                |row| row.get::<_, i64>(0),
            )
        })
        .map(|count| count == 1)
        .unwrap_or(false);
    if !valid {
        cleanup(&work);
        return Err("ari-docs のバックアップではありません".to_string());
    }

    // 2. 今の状態をバックアップする（戻せるように）
    if let Err(e) = create_backup_locked(conn, config, "before_restore", "", user_id) {
        cleanup(&work);
        return Err(format!("復元の前のバックアップを作れませんでした: {e}"));
    }

    // 3. 残す表の今の中身を控える
    let kept = keep_tables(conn).map_err(|e| e.to_string())?;

    // 4. folder/ の中身を入れ替える（失敗したら戻す）
    let old = work.join("old");
    fs::create_dir_all(&old).map_err(|e| e.to_string())?;
    let root = Path::new(&config.folder_root);
    let swap = (|| -> io::Result<()> {
        for entry in fs::read_dir(root)?.flatten() {
            move_path(&entry.path(), &old.join(entry.file_name()))?;
        }
        let restored_folder = work.join("folder");
        if restored_folder.is_dir() {
            for entry in fs::read_dir(&restored_folder)?.flatten() {
                move_path(&entry.path(), &root.join(entry.file_name()))?;
            }
        }
        Ok(())
    })();
    if let Err(e) = swap {
        // 入れ替えの途中で失敗したら、元のものを戻す
        if let Ok(entries) = fs::read_dir(&old) {
            for entry in entries.flatten() {
                let target = root.join(entry.file_name());
                let _ = crate::common::fs_util::remove_path(&target);
                let _ = move_path(&entry.path(), &target);
            }
        }
        cleanup(&work);
        return Err(format!(
            "ファイルを入れ替えられませんでした（元に戻しました）: {e}"
        ));
    }

    // 5. DB を入れ替える（SQLite のバックアップ機能で、使っている途中の DB にも安全に書き込む）
    conn.restore(
        MAIN_DB,
        &restored_db,
        None::<fn(rusqlite::backup::Progress)>,
    )
    .map_err(|e| format!("DB を復元できませんでした: {e}"))?;
    migration::migrate(conn);
    restore_tables(conn, &kept).map_err(|e| e.to_string())?;
    // 中身の検索は、復元したファイルで取り込み直す
    let _ = conn.execute("DELETE FROM node_content", []);
    cleanup(&work);
    Ok(())
}

type TableRows = Vec<(String, Vec<Vec<rusqlite::types::Value>>)>;

fn keep_tables(conn: &Connection) -> rusqlite::Result<TableRows> {
    let mut tables = Vec::new();
    for table in KEEP_TABLES {
        let mut stmt = conn.prepare(&format!("SELECT * FROM {table}"))?;
        let columns = stmt.column_count();
        let rows = stmt
            .query_map([], |row| {
                (0..columns)
                    .map(|i| row.get(i))
                    .collect::<rusqlite::Result<Vec<_>>>()
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        tables.push((table.to_string(), rows));
    }
    Ok(tables)
}

fn restore_tables(conn: &Connection, tables: &TableRows) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    for (table, rows) in tables {
        tx.execute(&format!("DELETE FROM {table}"), [])?;
        for row in rows {
            let placeholders = vec!["?"; row.len()].join(",");
            tx.execute(
                &format!("INSERT INTO {table} VALUES ({placeholders})"),
                rusqlite::params_from_iter(row.iter()),
            )?;
        }
    }
    tx.commit()
}

// 定期の期間（同じ期間に 2 回取らないため）
fn period_key(interval: &str, now: chrono::DateTime<Local>) -> Option<String> {
    match interval {
        "daily" => Some(now.format("%Y-%m-%d").to_string()),
        "weekly" => Some(format!(
            "{}-W{:02}",
            now.iso_week().year(),
            now.iso_week().week()
        )),
        "monthly" => Some(now.format("%Y-%m").to_string()),
        _ => None,
    }
}

// 定期の処理（毎分。FN0901-BR04・FN0302-BR05）。期間の時刻を過ぎていてその期間のバックアップが無ければ取る。
// 保存期間を過ぎたバックアップとゴミ箱のものを消す
pub fn run_scheduled(config: &AppConfig) {
    if is_busy() {
        return;
    }
    let conn = crate::database::connection::connect();
    let Ok(settings) = settings(&conn) else {
        return;
    };
    let now = Local::now();
    if let Some(period) = period_key(&settings.interval, now)
        && now.hour() >= settings.hour
        && !backup_repo::exists_period(&conn, &period).unwrap_or(true)
    {
        match create_backup(&conn, config, "auto", &period, "system") {
            Ok(backup) => println!("backup: created {}", backup.file_name),
            Err(e) => eprintln!("backup: {e}"),
        }
    }
    if let Ok(expired) = backup_repo::find_expired(&conn, settings.retention_days) {
        for backup in expired {
            if let Err(e) = delete_backup(&conn, &backup.backup_id) {
                eprintln!("backup: {e}");
            }
        }
    }
    let _ = crate::repository::session::delete_expired(
        &conn,
        crate::service::server_settings::get(&conn).session_days,
    );
    if let Err(e) = crate::service::trash::purge(&conn, config, settings.trash_retention_days) {
        eprintln!("trash purge: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::app::AppMode;
    use chrono::TimeZone;

    #[test]
    fn period_key_by_interval() {
        let now = Local.with_ymd_and_hms(2026, 10, 30, 4, 0, 0).unwrap();
        assert_eq!(period_key("daily", now).unwrap(), "2026-10-30");
        assert_eq!(period_key("weekly", now).unwrap(), "2026-W44");
        assert_eq!(period_key("monthly", now).unwrap(), "2026-10");
        assert!(period_key("off", now).is_none());
    }

    #[test]
    fn save_settings_validates() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!(
            "../data/migration/T010_create_trash_backup.sql"
        ))
        .unwrap();
        assert_eq!(settings(&conn).unwrap(), BackupSettings::default());
        let mut s = BackupSettings {
            interval: "weekly".into(),
            ..Default::default()
        };
        save_settings(&conn, &s).unwrap();
        assert_eq!(settings(&conn).unwrap().interval, "weekly");
        s.interval = "hourly".into();
        assert!(save_settings(&conn, &s).is_err());
        s.interval = "daily".into();
        s.hour = 24;
        assert!(save_settings(&conn, &s).is_err());
        s.hour = 3;
        s.dir = "relative/dir".into();
        assert!(save_settings(&conn, &s).is_err());
    }

    // バックアップ → 変更 → 復元で、folder/ と DB が戻り、バックアップの記録は残る
    #[test]
    fn backup_and_restore_round_trip() {
        let dir = std::env::temp_dir().join(format!("ari-backup-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("folder/資料")).unwrap();
        fs::write(dir.join("folder/資料/議事録.txt"), "v1").unwrap();
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
        fs::create_dir_all(dir.join("data")).unwrap();
        let mut conn = Connection::open(&config.database_path).unwrap();
        migration::migrate(&conn);
        conn.execute(
            "INSERT INTO note (note_id, user_id, title) VALUES ('nt_1', 'local', 'v1')",
            [],
        )
        .unwrap();

        let backup = create_backup(&conn, &config, "manual", "", "local").unwrap();
        assert!(backup.size > 0);
        assert!(backup_file(&conn, &backup.backup_id).unwrap().0.is_file());

        fs::write(dir.join("folder/資料/議事録.txt"), "v2").unwrap();
        fs::write(dir.join("folder/new.txt"), "").unwrap();
        conn.execute("UPDATE note SET title = 'v2'", []).unwrap();

        restore_backup(&mut conn, &config, &backup.backup_id, "local").unwrap();
        assert_eq!(
            fs::read_to_string(dir.join("folder/資料/議事録.txt")).unwrap(),
            "v1"
        );
        assert!(!dir.join("folder/new.txt").exists());
        let title: String = conn
            .query_row("SELECT title FROM note", [], |row| row.get(0))
            .unwrap();
        assert_eq!(title, "v1");
        // 手動と、復元の前の自動の 2 件
        let kinds: Vec<String> = backup_repo::find_all(&conn)
            .unwrap()
            .into_iter()
            .map(|b| b.kind)
            .collect();
        assert_eq!(kinds.len(), 2);
        assert!(kinds.contains(&"before_restore".to_string()));

        delete_backup(&conn, &backup.backup_id).unwrap();
        assert_eq!(backup_repo::find_all(&conn).unwrap().len(), 1);
        // Windows は開いている DB のファイルを消せないので、閉じてから消す
        drop(conn);
        fs::remove_dir_all(&dir).unwrap();
    }
}
