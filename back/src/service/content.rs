use rusqlite::Connection;

use crate::{repository::history as history_repo, service::server_settings};

// Note・Wiki の保存の共通の流れ（FN0402・FN0501-BR10）

pub enum SaveError {
    NotFound,
    // 開いたあとにほかの人（ほかの PC）が更新した。文言を画面に出す
    Conflict(String),
    Db(rusqlite::Error),
}

impl From<rusqlite::Error> for SaveError {
    fn from(error: rusqlite::Error) -> Self {
        match error {
            rusqlite::Error::QueryReturnedNoRows => SaveError::NotFound,
            e => SaveError::Db(e),
        }
    }
}

// 今の版（保存する前）
pub struct Current {
    pub title: String,
    pub content: String,
    pub updated_at: String,
    // 最後に更新した人の ID
    pub updated_by: String,
    // 食い違ったときの文言の主語（例: 「山田さんが」「ほかの画面（PC）で」）
    pub who: String,
}

// DB の UTC の日時を、サーバーの時刻（現地時刻）の "YYYY/MM/DD HH:MM" にする
pub fn local_time(utc: &str) -> String {
    chrono::NaiveDateTime::parse_from_str(utc, "%Y-%m-%d %H:%M:%S")
        .map(|time| {
            chrono::DateTime::<chrono::Local>::from(time.and_utc())
                .format("%Y/%m/%d %H:%M")
                .to_string()
        })
        .unwrap_or_else(|_| utc.to_string())
}

// 保存する。base_updated_at（開いたときの更新日時）と今の更新日時が違えば、force でなければ保存しない（FN0501-BR10）。
// 履歴が無ければ今の版を先に残し、保存したあとの版も残す（FN0402-BR01）。保存したあとの更新日時を返す
#[allow(clippy::too_many_arguments)]
pub fn save(
    conn: &Connection,
    kind: &str,
    content_id: &str,
    user_id: &str,
    current: Current,
    base_updated_at: Option<&str>,
    force: bool,
    update: impl FnOnce() -> rusqlite::Result<usize>,
    fetch_updated_at: impl FnOnce() -> rusqlite::Result<String>,
    title: &str,
    content: &str,
) -> Result<String, SaveError> {
    if let Some(base) = base_updated_at
        && !force
        && base != current.updated_at
    {
        return Err(SaveError::Conflict(format!(
            "{} {} に更新しています。上書きすると、その変更は消えます（履歴からは戻せます）",
            current.who,
            local_time(&current.updated_at)
        )));
    }
    let keep = server_settings::get(conn).history_keep;
    let tx = conn.unchecked_transaction()?;
    if !history_repo::exists(&tx, kind, content_id)? {
        history_repo::add(
            &tx,
            kind,
            content_id,
            &current.title,
            &current.content,
            &current.updated_by,
            &current.updated_at,
            keep,
        )?;
    }
    if update()? == 0 {
        return Err(SaveError::NotFound);
    }
    let updated_at = fetch_updated_at()?;
    history_repo::add(
        &tx,
        kind,
        content_id,
        title,
        content,
        user_id,
        &updated_at,
        keep,
    )?;
    tx.commit()?;
    Ok(updated_at)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_time_formats_utc() {
        assert!(local_time("2026-10-30 01:02:03").starts_with("2026/10/30"));
        assert_eq!(local_time("bad"), "bad");
    }
}
