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
}

impl Default for ServerSettings {
    fn default() -> Self {
        Self {
            session_days: 30,
            max_failures: 5,
            lock_minutes: 15,
            history_keep: 100,
            docs_enabled: false,
        }
    }
}

const SETTINGS_KEY: &str = "server_settings";

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
