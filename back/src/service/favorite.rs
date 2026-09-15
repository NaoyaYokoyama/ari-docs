use crate::{
    api::favorite::response::FavoriteIdResponse,
    common::id::{generate_favorite_id, generate_node_id},
    repository::favorite as favorite_repo,
    repository::node as node_repo,
};
use rusqlite::Connection;

pub fn create_favorite(
    conn: &Connection,
    user_id: &str,
    node_path: &str,
    note_id: &str,
    wiki_id: &str,
) -> rusqlite::Result<String> {
    let mut node_id = String::new();
    if !node_path.is_empty() {
        node_id = match node_repo::find_node_id_by_node_path(conn, node_path)? {
            Some(node_id) => node_id,
            None => {
                let node_id = generate_node_id();
                node_repo::create_node(conn, &node_id, node_path)?;
                node_id
            }
        };
    }
    let favorite_id = generate_favorite_id();
    favorite_repo::create_favorite(conn, user_id, &favorite_id, &node_id, note_id, wiki_id)?;
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
