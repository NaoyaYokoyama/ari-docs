use crate::{
    api::setting::response::SettingResponse, repository::setting as setting_repository,
    service::auth::hash_password,
};
use rusqlite::Connection;

pub fn update_display_name(
    conn: &Connection,
    user_id: &str,
    display_name: &str,
) -> rusqlite::Result<SettingResponse> {
    let result = setting_repository::update_display_name(conn, user_id, display_name)?;
    if result == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(SettingResponse {})
}

pub fn update_password(
    conn: &Connection,
    user_id: &str,
    current_password: &str,
    new_password: &str,
    new_password_confirm: &str,
) -> rusqlite::Result<SettingResponse> {
    println!("{}", current_password);
    println!("{}", new_password_confirm);
    let password = hash_password(&new_password);
    let result = setting_repository::update_password(conn, user_id, &password)?;
    if result == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(SettingResponse {})
}
