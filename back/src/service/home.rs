use crate::{
    api::home::response::{SearchItem, SearchResponse},
    repository::note as note_repository,
    repository::wiki as wiki_repository,
};
use rusqlite::Connection;

pub fn search(conn: &Connection, keyword: &str) -> rusqlite::Result<SearchResponse> {
    let notes = note_repository::find_by_search(conn, keyword)?;
    let wikis = wiki_repository::find_by_search(conn, keyword)?;
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
