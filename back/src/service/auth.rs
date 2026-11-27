use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};

use axum::http::{
    HeaderMap,
    header::{AUTHORIZATION, HOST},
};
use rusqlite::Connection;

use crate::{
    api::auth::LoginResponse,
    config::app::AppMode,
    config::app_state::AppState,
    model::user::User,
    repository::{session as session_repo, user, user_permission},
    service::server_settings,
};

pub fn hash_password(password: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);

    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .unwrap()
        .to_string()
}

pub fn verify_password(password: &str, password_hash: &str) -> bool {
    let parsed_hash = match PasswordHash::new(password_hash) {
        Ok(hash) => hash,
        Err(_) => return false,
    };

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok()
}

pub enum LoginError {
    // ユーザー ID かパスワードが違う
    Invalid,
    // 続けて失敗したためロック中（FN0101-BR12）
    Locked,
}

// ログイン。続けて失敗したらしばらくロックする（FN0101-BR12）
pub fn login(
    conn: &Connection,
    state: &AppState,
    user_id: &str,
    password: &str,
) -> Result<LoginResponse, LoginError> {
    let settings = server_settings::get(conn);
    if session_repo::locked_until(conn, user_id, settings.lock_minutes)
        .ok()
        .flatten()
        .is_some()
    {
        return Err(LoginError::Locked);
    }
    let user = user::find_by_user_id(conn, user_id).ok();
    let ok = user
        .as_ref()
        .is_some_and(|user| verify_password(password, &user.passwd));
    if !ok {
        let _ = session_repo::record_failure(
            conn,
            user_id,
            settings.max_failures,
            settings.lock_minutes,
        );
        return Err(
            if session_repo::locked_until(conn, user_id, settings.lock_minutes)
                .ok()
                .flatten()
                .is_some()
            {
                LoginError::Locked
            } else {
                LoginError::Invalid
            },
        );
    }
    let _ = session_repo::clear_failures(conn, user_id);
    Ok(LoginResponse::new(
        conn,
        user.as_ref().unwrap(),
        &state.config.mode,
    ))
}

pub fn get_login_user(conn: &Connection, state: &AppState, headers: &HeaderMap) -> Option<User> {
    match state.config.mode {
        // ローカルモードはログインが無いので、この PC の中（127.0.0.1・localhost）宛ての要求だけを受ける。
        // ほかのサイトが自分の名前をこの PC に向けて読ませる手口（DNS リバインディング）を防ぐ
        AppMode::Local if !is_loopback_host(headers) => None,
        AppMode::Local => user::find_by_user_id(conn, "local").ok(),
        AppMode::Shared => {
            let session_id = get_session_id(headers)?;
            let user_id = session_repo::find_user_id(
                conn,
                &session_id,
                server_settings::get(conn).session_days,
            )
            .ok()??;
            let mut user = user::find_by_user_id(conn, &user_id).ok()?;
            // 管理者でも、登録していない PC からは利用者として扱う（FN0102-BR12）
            crate::service::admin_device::apply(conn, &mut user, headers);
            Some(user)
        }
    }
}

// 要求の宛先（Host）がこの PC の中か。Host が無ければ（HTTP/1.0 など）通す
pub fn is_loopback_host(headers: &HeaderMap) -> bool {
    let Some(host) = headers.get(HOST).and_then(|value| value.to_str().ok()) else {
        return headers.get(HOST).is_none();
    };
    let name = if let Some(rest) = host.strip_prefix('[') {
        rest.split(']').next().unwrap_or("")
    } else {
        host.rsplit_once(':').map_or(host, |(name, _)| name)
    };
    matches!(
        name.to_ascii_lowercase().as_str(),
        "127.0.0.1" | "localhost" | "::1"
    )
}

// セッション ID。デスクトップアプリは Authorization: Bearer で送る（画面とサーバーのオリジンが違い Cookie が届かないため）。
// ブラウザ（開発時）は Cookie で送る
pub fn get_session_id(headers: &HeaderMap) -> Option<String> {
    if let Some(token) = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|token| !token.is_empty())
    {
        return Some(token.to_string());
    }

    let cookie = headers.get("cookie")?.to_str().ok()?;

    cookie
        .split(';')
        .map(str::trim)
        .find_map(|value| value.strip_prefix("session_id=").map(str::to_string))
}

// 管理者か（共有モードでユーザーを管理できる）
pub fn is_admin(user: &User) -> bool {
    user.role_id == ROLE_ADMIN
}

// 全員に効く管理の操作（ゴミ箱を空にする・バックアップなど）をしてよいか。ローカルモードは 1 人なので常に可
pub fn can_manage(mode: &AppMode, user: &User) -> bool {
    mode.is_local() || is_admin(user)
}

pub const ROLE_ADMIN: &str = "admin";
pub const ROLE_USER: &str = "user";

// 管理者が利用者に付けられる許可（FN0102-BR11）
pub const PERMISSION_DICTIONARY: &str = "dictionary";
pub const PERMISSION_EXCLUSION: &str = "exclusion";
pub const PERMISSION_BACKUP: &str = "backup";
pub const PERMISSIONS: [&str; 3] = [
    PERMISSION_DICTIONARY,
    PERMISSION_EXCLUSION,
    PERMISSION_BACKUP,
];

// 許可の要る操作をしてよいか。ローカルモード・管理者はいつも可、利用者は許可を付けられていれば可
pub fn has_permission(conn: &Connection, mode: &AppMode, user: &User, permission: &str) -> bool {
    can_manage(mode, user)
        || user_permission::exists(conn, &user.user_id, permission).unwrap_or(false)
}

// 使える許可（画面がボタンを出すかを決める）。ローカルモード・管理者はすべて
pub fn permissions(conn: &Connection, mode: &AppMode, user: &User) -> Vec<String> {
    if can_manage(mode, user) {
        return PERMISSIONS.iter().map(|p| p.to_string()).collect();
    }
    user_permission::find_by_user(conn, &user.user_id).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    #[test]
    fn local_mode_accepts_only_this_pc() {
        let host = |value: &str| {
            let mut headers = HeaderMap::new();
            headers.insert(HOST, value.parse().unwrap());
            headers
        };
        assert!(is_loopback_host(&host("127.0.0.1:8080")));
        assert!(is_loopback_host(&host("localhost:8081")));
        assert!(is_loopback_host(&host("[::1]:8080")));
        assert!(is_loopback_host(&host("LOCALHOST")));
        assert!(is_loopback_host(&HeaderMap::new()));
        assert!(!is_loopback_host(&host("evil.example:8080")));
        assert!(!is_loopback_host(&host("localhost.evil.example")));
        assert!(!is_loopback_host(&host("192.168.0.5:8080")));
    }

    use super::*;

    #[test]
    fn get_session_id_prefers_bearer_token() {
        let mut headers = HeaderMap::new();
        headers.insert("cookie", "a=1; session_id=from-cookie".parse().unwrap());
        assert_eq!(get_session_id(&headers).unwrap(), "from-cookie");
        headers.insert(AUTHORIZATION, "Bearer from-header".parse().unwrap());
        assert_eq!(get_session_id(&headers).unwrap(), "from-header");
        headers.insert(AUTHORIZATION, "Bearer ".parse().unwrap());
        assert_eq!(get_session_id(&headers).unwrap(), "from-cookie");
    }

    #[test]
    fn verify_password_matches_hash() {
        let hash = hash_password("secret-pass");
        assert!(verify_password("secret-pass", &hash));
        assert!(!verify_password("other", &hash));
        assert!(!verify_password("-", "-"));
    }
}
