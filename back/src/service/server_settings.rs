use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::repository::system_setting;

// 管理者が決める、ログインと保存の設定（FN0902）。system_setting の server_settings に JSON で保存する
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ServerSettings {
    // セッションの有効期限（最後に使ってからの日数。FN0101-BR09）
    pub session_days: i64,
    // 続けて失敗したらロックする回数と、ロックする分数（FN0101-BR12）
    pub max_failures: i64,
    pub lock_minutes: i64,
    // Note・Wiki 1 つにつき残す版の数（FN0402-BR02）
    pub history_keep: i64,
    // Docs（Markdown ビューア）を使う。既定は使わない（メイン機能とは別の、設計書を見るための機能）
    pub docs_enabled: bool,
    // 1 回にアップロードできる合計の大きさ（MB。FN0301-BR29・FN0902-BR07）。既定 1 GB、10 GB まで
    pub upload_max_mb: i64,
    // ファイルのロック（FN0301-BR38）の期限の上限（日）。既定 7 日、365 日まで
    pub file_lock_max_days: i64,
    // ファイルの以前の版（FN0301-BR39）を 1 つのファイルにつき残す数。既定 10、0 なら残さない、100 まで
    pub file_version_keep: i64,
    // 共有モードで、Wiki を書いている人のほかは保存できないようにする（FN0501-BR12）。既定はロックする
    pub wiki_edit_lock: bool,
    // Note・Wiki に貼る画像と Docs で送る画像を縮める（FN0902-BR09）。画質（%）と長い辺の上限（画素）
    pub image_compress: bool,
    pub image_quality: i64,
    pub image_max_side: i64,
}

impl Default for ServerSettings {
    fn default() -> Self {
        Self {
            session_days: 30,
            max_failures: 5,
            lock_minutes: 15,
            history_keep: 100,
            docs_enabled: false,
            upload_max_mb: DEFAULT_UPLOAD_MAX_MB,
            file_lock_max_days: 7,
            file_version_keep: 10,
            wiki_edit_lock: true,
            image_compress: true,
            image_quality: 85,
            image_max_side: 1920,
        }
    }
}

const SETTINGS_KEY: &str = "server_settings";
pub const DEFAULT_UPLOAD_MAX_MB: i64 = 1024;
pub const MAX_UPLOAD_MAX_MB: i64 = 10 * 1024;

// 読めなければ既定の値
pub fn get(conn: &Connection) -> ServerSettings {
    system_setting::find(conn, SETTINGS_KEY)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default()
}

pub fn save(conn: &Connection, settings: &ServerSettings) -> Result<(), String> {
    let ranges = [
        (
            settings.session_days,
            1,
            365,
            "セッションの有効期限は 1〜365 日",
        ),
        (
            settings.max_failures,
            3,
            20,
            "ロックするまでの回数は 3〜20 回",
        ),
        (
            settings.lock_minutes,
            1,
            1440,
            "ロックする時間は 1〜1440 分",
        ),
        (settings.history_keep, 1, 1000, "残す版の数は 1〜1000 件"),
        (
            settings.upload_max_mb,
            1,
            MAX_UPLOAD_MAX_MB,
            "アップロードの上限は 1〜10240 MB",
        ),
        (
            settings.file_lock_max_days,
            1,
            365,
            "ファイルのロックの期限の上限は 1〜365 日",
        ),
        (
            settings.file_version_keep,
            0,
            100,
            "ファイルの以前の版を残す数は 0〜100 件",
        ),
        (settings.image_quality, 10, 100, "画像の画質は 10〜100 %"),
        (
            settings.image_max_side,
            800,
            4096,
            "画像の長い辺の上限は 800〜4096 画素",
        ),
    ];
    for (value, min, max, label) in ranges {
        if !(min..=max).contains(&value) {
            return Err(format!("{label}で指定してください"));
        }
    }
    system_setting::upsert(
        conn,
        SETTINGS_KEY,
        &serde_json::to_string(settings).unwrap(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// このサーバーの ID（FN0004-BR07）。ari:// のリンクに入れて、どの共有サーバーのものかを見分ける。
// 初めて使ったときに作り、変えない（バックアップから戻しても・別の PC へ移しても残る）
const SERVER_ID_KEY: &str = "server_id";

pub fn server_id(conn: &Connection) -> rusqlite::Result<String> {
    system_setting::insert_if_missing(
        conn,
        SERVER_ID_KEY,
        &uuid::Uuid::new_v4().simple().to_string(),
    )?;
    Ok(system_setting::find(conn, SERVER_ID_KEY)?.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connect() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!(
            "../data/migration/T010_create_trash_backup.sql"
        ))
        .unwrap();
        conn
    }

    #[test]
    fn get_returns_default_then_saved_value() {
        let conn = connect();
        assert_eq!(get(&conn), ServerSettings::default());
        let settings = ServerSettings {
            session_days: 7,
            ..ServerSettings::default()
        };
        save(&conn, &settings).unwrap();
        assert_eq!(get(&conn), settings);
    }

    #[test]
    fn docs_disabled_when_saved_before_the_setting_existed() {
        let conn = connect();
        system_setting::upsert(
            &conn,
            SETTINGS_KEY,
            r#"{"sessionDays":7,"maxFailures":5,"lockMinutes":15,"historyKeep":100}"#,
        )
        .unwrap();
        let settings = get(&conn);
        assert_eq!(settings.session_days, 7);
        assert!(!settings.docs_enabled);
    }

    #[test]
    fn save_rejects_out_of_range() {
        let conn = connect();
        let settings = ServerSettings {
            max_failures: 0,
            ..ServerSettings::default()
        };
        assert!(save(&conn, &settings).is_err());
        assert_eq!(get(&conn), ServerSettings::default());
    }
}
