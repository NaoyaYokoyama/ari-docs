use crate::{
    api::home::response::{FavoriteItem, FavoriteListResponse, SearchItem, SearchResponse},
    repository::favorite as favorite_repo,
    repository::node as node_repo,
    repository::note as note_repo,
    repository::wiki as wiki_repo,
};
use rusqlite::Connection;

pub fn search(conn: &Connection, keyword: &str) -> rusqlite::Result<SearchResponse> {
    let notes = note_repo::find_by_search(conn, keyword)?;
    let wikis = wiki_repo::find_by_search(conn, keyword)?;
    let mut search_items: Vec<SearchItem> = Vec::new();

    search_items.extend(notes.into_iter().map(|note| SearchItem {
        view_type: "note".to_string(),
        name: note.title.to_string(),
        node_id: "".to_string(),
        note_id: note.note_id.to_string(),
        wiki_id: "".to_string(),
    }));

    search_items.extend(wikis.into_iter().map(|wiki| SearchItem {
        view_type: "wiki".to_string(),
        name: wiki.title.to_string(),
        node_id: "".to_string(),
        note_id: "".to_string(),
        wiki_id: wiki.wiki_id.to_string(),
    }));

    Ok(SearchResponse { search_items })
}

pub fn get_favorite_list(
    conn: &Connection,
    user_id: &str,
) -> rusqlite::Result<FavoriteListResponse> {
    let favorites = favorite_repo::find_by_user_id(conn, user_id)?;
    let mut node_ids = Vec::new();
    let mut note_ids = Vec::new();
    let mut wiki_ids = Vec::new();
    for favorite in favorites {
        if !favorite.node_id.is_empty() {
            node_ids.push(favorite.node_id);
        }
        if !favorite.note_id.is_empty() {
            note_ids.push(favorite.note_id);
        }
        if !favorite.wiki_id.is_empty() {
            wiki_ids.push(favorite.wiki_id);
        }
    }

    let nodes = node_repo::find_by_node_ids(conn, &node_ids)?;
    let notes = note_repo::find_by_note_ids(conn, &user_id, &note_ids)?;
    let wikis = wiki_repo::find_by_wiki_ids(conn, &user_id, &wiki_ids)?;
    let mut favorite_list: Vec<FavoriteItem> = Vec::new();

    favorite_list.extend(nodes.into_iter().map(|node| FavoriteItem {
        favorite_id: "".to_string(),
        name: node.path,
        node_id: node.node_id,
        note_id: "".to_string(),
        wiki_id: "".to_string(),
    }));

    favorite_list.extend(notes.into_iter().map(|note| FavoriteItem {
        favorite_id: "".to_string(),
        name: note.title,
        node_id: "".to_string(),
        note_id: note.note_id,
        wiki_id: "".to_string(),
    }));

    favorite_list.extend(wikis.into_iter().map(|wiki| FavoriteItem {
        favorite_id: "".to_string(),
        name: wiki.title,
        node_id: "".to_string(),
        note_id: "".to_string(),
        wiki_id: wiki.wiki_id,
    }));

    Ok(FavoriteListResponse { favorite_list })
}
