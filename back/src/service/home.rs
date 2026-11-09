use crate::{
    api::home::response::{
        FavoriteItem, FavoriteListResponse, RecentContent, RecentFile, RecentResponse, SearchItem,
        SearchResponse,
    },
    repository::favorite as favorite_repo,
    repository::node as node_repo,
    repository::note as note_repo,
    repository::search as search_repo,
    repository::wiki as wiki_repo,
    search::{
        index,
        kind::{self, Filter},
    },
};

// 中身で見つかったファイルを返す最大の件数（FN0202-BR07）
const CONTENT_LIMIT: i64 = 200;
// 種類で絞り込むときに、中身の検索から取り出す件数（絞り込んだあとに 200 件を残すため、多めに取る）
const FILTERED_CONTENT_LIMIT: i64 = 20_000;
use rusqlite::Connection;
use std::collections::{HashMap, HashSet};
use std::path::Path;

// Note・Wiki・ノード（名前・中身の順）の順に並べる（FN0201-BR03）。
// ノードは同期バッチで登録したものを使うが、消えたファイルも残るため、実体があるものだけを返す。
// types は探す種類（空ならすべて。FN0201-BR09）
pub fn search(
    conn: &Connection,
    user_id: &str,
    keyword: &str,
    types: &[String],
    folder_root: &str,
) -> rusqlite::Result<SearchResponse> {
    let filter = Filter(types);
    let notes = if filter.allows(kind::NOTE) {
        note_repo::find_by_search(conn, user_id, keyword)?
    } else {
        Vec::new()
    };
    let wikis = if filter.allows(kind::WIKI) {
        wiki_repo::find_by_search(conn, keyword)?
    } else {
        Vec::new()
    };
    let nodes = node_repo::find_by_search(conn, keyword)?;
    let mut search_items: Vec<SearchItem> = Vec::new();

    search_items.extend(notes.into_iter().map(|note| SearchItem {
        view_type: "note".to_string(),
        name: note.title.to_string(),
        node_id: "".to_string(),
        note_id: note.note_id.to_string(),
        wiki_id: "".to_string(),
        node_type: "".to_string(),
        match_type: "".to_string(),
    }));

    search_items.extend(wikis.into_iter().map(|wiki| SearchItem {
        view_type: "wiki".to_string(),
        name: wiki.title.to_string(),
        node_id: "".to_string(),
        note_id: "".to_string(),
        wiki_id: wiki.wiki_id.to_string(),
        node_type: "".to_string(),
        match_type: "".to_string(),
    }));

    let mut found = HashSet::new();
    for (node_id, path) in nodes {
        let full_path = Path::new(folder_root).join(&path);
        if !full_path.exists() {
            continue;
        }
        let is_dir = full_path.is_dir();
        if !filter.allows(if is_dir {
            kind::FOLDER
        } else {
            kind::file_kind(&path)
        }) {
            continue;
        }
        found.insert(node_id.clone());
        search_items.push(SearchItem {
            view_type: "node".to_string(),
            name: path,
            node_id,
            note_id: "".to_string(),
            wiki_id: "".to_string(),
            node_type: if is_dir { "folder" } else { "file" }.to_string(),
            match_type: "name".to_string(),
        });
    }

    // ファイルの中身（FN0202）。名前で見つかったものは除く。単語の区切りに失敗しても、名前の検索の結果は返す
    match index::current_tokenizer(conn) {
        Ok(tokenizer) => {
            let words = tokenizer.query_words(keyword);
            let limit = if filter.is_all() {
                CONTENT_LIMIT
            } else {
                FILTERED_CONTENT_LIMIT
            };
            let mut count = 0;
            for (node_id, path) in search_repo::find_nodes_by_words(conn, &words, limit)? {
                if count >= CONTENT_LIMIT {
                    break;
                }
                if found.contains(&node_id)
                    || !filter.allows(kind::file_kind(&path))
                    || !Path::new(folder_root).join(&path).is_file()
                {
                    continue;
                }
                count += 1;
                search_items.push(SearchItem {
                    view_type: "node".to_string(),
                    name: path,
                    node_id,
                    note_id: "".to_string(),
                    wiki_id: "".to_string(),
                    node_type: "file".to_string(),
                    match_type: "content".to_string(),
                });
            }
        }
        Err(e) => eprintln!("search tokenizer error: {e}"),
    }

    Ok(SearchResponse { search_items })
}

// 最近更新されたもの（FN0201-BR07）。ファイルは消えていないものだけ
pub fn get_recent(
    conn: &Connection,
    user_id: &str,
    folder_root: &str,
) -> rusqlite::Result<RecentResponse> {
    let wikis = wiki_repo::find_recent(conn, 8)?
        .into_iter()
        .map(|(id, title, updated_at, updated_by)| RecentContent {
            id,
            title,
            updated_at,
            updated_by,
        })
        .collect();
    let notes = note_repo::find_recent(conn, user_id, 5)?
        .into_iter()
        .map(|(id, title, updated_at)| RecentContent {
            id,
            title,
            updated_at,
            updated_by: String::new(),
        })
        .collect();
    let files = node_repo::find_recent_files(conn, 10)?
        .into_iter()
        .filter(|(path, _)| Path::new(folder_root).join(path).is_file())
        .take(10)
        .map(|(path, modified_at)| RecentFile {
            path,
            updated_at: chrono::DateTime::from_timestamp(modified_at, 0)
                .map(|time| {
                    time.with_timezone(&chrono::Local)
                        .format("%Y/%m/%d %H:%M")
                        .to_string()
                })
                .unwrap_or_default(),
        })
        .collect();
    Ok(RecentResponse {
        wikis,
        notes,
        files,
    })
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
    let wikis = wiki_repo::find_by_wiki_ids(conn, &wiki_ids)?;
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
