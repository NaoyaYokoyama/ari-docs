use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::http::HeaderMap;
use rusqlite::Connection;
use sha2::{Digest, Sha256};

use crate::{
    common::id::generate_admin_device_id,
    config::app::AppConfig,
    model::user::User,
    repository::admin_device as device_repo,
    service::{auth, setup_code},
};

// 管理者の PC（FN0102-BR12）。管理者の操作（ユーザーの管理・サーバーの設定・バックアップの復元など）は、
// 登録した PC のデスクトップアプリからだけできる。ほかの PC では利用者として扱う（パスワードが漏れても管理者の操作はさせない）

// アプリが場所ごとに作る鍵を送るヘッダー
pub const DEVICE_HEADER: &str = "x-ari-device";
// ほかの PC を登録するコードの有効な時間
const PAIRING_TTL: Duration = Duration::from_secs(10 * 60);

// コード → (ユーザー ID, 発行した時刻)。サーバーを止めると消える（そのときは発行し直す）
static PAIRINGS: Mutex<Option<HashMap<String, (String, Instant)>>> = Mutex::new(None);

fn device_key(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(DEVICE_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|key| (32..=128).contains(&key.len()))
}

fn key_hash(key: &str) -> String {
    Sha256::digest(key.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

// 管理者が登録していない PC から使っていれば、利用者として扱う（get_login_user から呼ぶ）
pub fn apply(conn: &Connection, user: &mut User, headers: &HeaderMap) {
    if !auth::is_admin(user) {
        return;
    }
    let registered = device_key(headers)
        .map(|key| device_repo::touch(conn, &user.user_id, &key_hash(key)).unwrap_or(false))
        .unwrap_or(false);
    if !registered {
        user.role_id = auth::ROLE_USER.to_string();
        user.admin_elsewhere = true;
    }
}

pub enum DeviceError {
    Invalid(String),
    Forbidden(String),
    Db(rusqlite::Error),
}

impl From<rusqlite::Error> for DeviceError {
    fn from(error: rusqlite::Error) -> Self {
        DeviceError::Db(error)
    }
}

// この PC を管理者の PC として登録する
pub fn register(
    conn: &Connection,
    user_id: &str,
    headers: &HeaderMap,
    name: &str,
) -> Result<(), DeviceError> {
    let Some(key) = device_key(headers) else {
        return Err(DeviceError::Invalid(
            "この PC の鍵がありません。デスクトップアプリから登録してください".to_string(),
        ));
    };
    let name: String = name.trim().chars().take(200).collect();
    device_repo::insert(
        conn,
        &generate_admin_device_id(),
        user_id,
        &key_hash(key),
        &name,
    )?;
    Ok(())
}

// サーバーの PC の中から使い、管理者の PC を 1 台も登録していなければ、この PC を登録する
// （最初の管理者の登録・この PC の公開 FN0005 のあと、そのまま管理できるように）
pub fn register_if_first_on_server(
    conn: &Connection,
    config: &AppConfig,
    user: &User,
    headers: &HeaderMap,
    addr: &SocketAddr,
    name: &str,
) {
    if auth::is_admin(user)
        && !setup_code::required(addr)
        && device_repo::count_by_user(conn, &user.user_id).unwrap_or(1) == 0
        && register(conn, &user.user_id, headers, name).is_ok()
    {
        // 起動したときに作った登録用のコードは要らなくなったので消す（ファイルに残さない）
        setup_code::clear(config);
    }
}

// コードを入れてこの PC を登録する。コードは、登録した PC で発行したもの（その人あて）か、
// サーバーの登録用のコード（PC をすべて失ったとき。サーバーの起動画面・setup-code.txt）。サーバーの PC の中からはコード不要
pub fn register_with_code(
    conn: &Connection,
    config: &AppConfig,
    user_id: &str,
    headers: &HeaderMap,
    addr: &SocketAddr,
    code: &str,
    name: &str,
) -> Result<(), DeviceError> {
    let paired = take_pairing(user_id, code);
    if !paired && !setup_code::verify(config, addr, code) {
        return Err(DeviceError::Forbidden(
            "コードが違うか、有効な時間（10 分）を過ぎています".to_string(),
        ));
    }
    register(conn, user_id, headers, name)?;
    // 登録用のコードは、使ったら（ほかの方法で登録できたときも）消す。また要るときは作り直す
    setup_code::clear(config);
    Ok(())
}

// ほかの PC を登録するコードを発行する（登録した PC の管理者だけ。相手はその人か、ほかの管理者）
pub fn issue_pairing(user_id: &str) -> String {
    let code = setup_code::generate();
    let mut pairings = PAIRINGS.lock().unwrap_or_else(|e| e.into_inner());
    let pairings = pairings.get_or_insert_with(HashMap::new);
    pairings.retain(|_, (_, at)| at.elapsed() < PAIRING_TTL);
    pairings.insert(
        setup_code::normalize(&code),
        (user_id.to_string(), Instant::now()),
    );
    code
}

fn take_pairing(user_id: &str, code: &str) -> bool {
    let mut pairings = PAIRINGS.lock().unwrap_or_else(|e| e.into_inner());
    let Some(pairings) = pairings.as_mut() else {
        return false;
    };
    pairings.retain(|_, (_, at)| at.elapsed() < PAIRING_TTL);
    let key = setup_code::normalize(code);
    if pairings
        .get(&key)
        .is_some_and(|(owner, _)| owner == user_id)
    {
        pairings.remove(&key);
        return true;
    }
    false
}

// この PC の鍵の SHA-256（一覧で「この PC」を示すため）
pub fn current_hash(headers: &HeaderMap) -> Option<String> {
    device_key(headers).map(key_hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairing_code_is_for_one_user_and_used_once() {
        let code = issue_pairing("alice");
        assert!(!take_pairing("bob", &code));
        assert!(take_pairing("alice", &code.to_lowercase()));
        assert!(!take_pairing("alice", &code));
    }

    #[test]
    fn short_keys_are_ignored() {
        let mut headers = HeaderMap::new();
        headers.insert(DEVICE_HEADER, "short".parse().unwrap());
        assert!(device_key(&headers).is_none());
        headers.insert(DEVICE_HEADER, "a".repeat(64).parse().unwrap());
        assert_eq!(device_key(&headers).map(str::len), Some(64));
    }
}
