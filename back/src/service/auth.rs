use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};

use axum::http::HeaderMap;
use rusqlite::Connection;

use crate::{
    api::auth::LoginResponse,
    model::{session::Sessions, user::User},
    repository::user,
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

pub fn login(conn: &Connection, user_id: &str, password: &str) -> Option<LoginResponse> {
    let user = user::find_by_user_id(conn, user_id).ok()?;

    if !verify_password(password, &user.passwd) {
        return None;
    }

    Some(LoginResponse {
        user_id: user.user_id,
        display_name: user.display_name,
    })
}

pub fn get_login_user(conn: &Connection, sessions: &Sessions, headers: &HeaderMap) -> Option<User> {
    let session_id = get_session_id(headers)?;

    let user_id = {
        let sessions = sessions.read().ok()?;
        sessions.get(&session_id)?.clone()
    };

    user::find_by_user_id(conn, &user_id).ok()
}

pub fn get_session_id(headers: &HeaderMap) -> Option<String> {
    let cookie = headers.get("cookie")?.to_str().ok()?;

    cookie
        .split(';')
        .map(str::trim)
        .find_map(|value| value.strip_prefix("session_id=").map(str::to_string))
}
