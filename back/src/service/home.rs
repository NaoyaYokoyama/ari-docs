use crate::{
    api::home::response::{FavoriteItem, FavoriteListResponse, SearchItem, SearchResponse},
    repository::favorite as favorite_repo,
    repository::node as node_repo,
    repository::note as note_repo,
    repository::wiki as wiki_repo,
};
use rusqlite::Connection;
use std::collections::HashMap;

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
    // 各IDからfavorite_idを引けるようにしておく
    let mut node_favorite_ids = HashMap::new();
    let mut note_favorite_ids = HashMap::new();
    let mut wiki_favorite_ids = HashMap::new();
    for favorite in favorites {
        if !favorite.node_id.is_empty() {
            node_favorite_ids.insert(favorite.node_id, favorite.favorite_id);
        } else if !favorite.note_id.is_empty() {
            note_favorite_ids.insert(favorite.note_id, favorite.favorite_id);
        } else if !favorite.wiki_id.is_empty() {
            wiki_favorite_ids.insert(favorite.wiki_id, favorite.favorite_id);
        }
    }
    let node_ids: Vec<String> = node_favorite_ids.keys().cloned().collect();
    let note_ids: Vec<String> = note_favorite_ids.keys().cloned().collect();
    let wiki_ids: Vec<String> = wiki_favorite_ids.keys().cloned().collect();

    let nodes = node_repo::find_by_node_ids(conn, &node_ids)?;
    let notes = note_repo::find_by_note_ids(conn, &user_id, &note_ids)?;
    let wikis = wiki_repo::find_by_wiki_ids(conn, &user_id, &wiki_ids)?;
    let mut favorite_list: Vec<FavoriteItem> = Vec::new();

    favorite_list.extend(nodes.into_iter().map(|node| {
        FavoriteItem {
            favorite_id: node_favorite_ids
                .get(&node.node_id)
                .cloned()
                .unwrap_or_default(),
            name: node.path,
            node_id: node.node_id,
            note_id: "".to_string(),
            wiki_id: "".to_string(),
        }
    }));

    favorite_list.extend(notes.into_iter().map(|note| {
        FavoriteItem {
            favorite_id: note_favorite_ids
                .get(&note.note_id)
                .cloned()
                .unwrap_or_default(),
            name: note.title,
            node_id: "".to_string(),
            note_id: note.note_id,
            wiki_id: "".to_string(),
        }
    }));

    favorite_list.extend(wikis.into_iter().map(|wiki| {
        FavoriteItem {
            favorite_id: wiki_favorite_ids
                .get(&wiki.wiki_id)
                .cloned()
                .unwrap_or_default(),
            name: wiki.title,
            node_id: "".to_string(),
            note_id: "".to_string(),
            wiki_id: wiki.wiki_id,
        }
    }));

    Ok(FavoriteListResponse { favorite_list })
}
