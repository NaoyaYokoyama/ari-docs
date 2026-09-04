use crate::{
    api::favorite::response::FavoriteIdResponse, common::id::generate_favorite_id,
    repository::favorite as favorite_repo,
};
use rusqlite::Connection;

pub fn create_favorite(
    conn: &Connection,
    user_id: &str,
    node_path: &str,
    note_id: &str,
    wiki_id: &str,
) -> rusqlite::Result<String> {
    let favorite_id = generate_favorite_id();
    favorite_repo::create_favorite(conn, user_id, &favorite_id, &node_path, &note_id, &wiki_id)?;
    Ok(favorite_id)
}

pub fn delete_favorite(
    conn: &Connection,
    user_id: &str,
    favorite_id: &str,
) -> rusqlite::Result<usize> {
    let result = favorite_repo::delete_favorite(conn, user_id, favorite_id)?;
    Ok(result)
}
