use crate::{api::setting::response::SettingResponse, repository::setting as setting_repository};
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
    confirm_password: &str,
) -> rusqlite::Result<SettingResponse> {
    let result = setting_repository::update_password(conn, user_id, new_password)?;
    if result == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(SettingResponse {})
}
