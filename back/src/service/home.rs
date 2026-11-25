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
    service::search_exclusion,
};

// 中身で見つかったファイルを返す最大の件数（FN0202-BR07）
const CONTENT_LIMIT: i64 = 200;
// 種類で絞り込むときに、中身の検索から取り出す件数（絞り込んだあとに 200 件を残すため、多めに取る）
const FILTERED_CONTENT_LIMIT: i64 = 20_000;
// 最近の更新に出すファイルの件数と、検索の対象外があるときに取り出す件数（FN0201-BR07）
const RECENT_FILES: i64 = 10;
const RECENT_FILES_FILTERED: i64 = 500;
use rusqlite::Connection;
use std::collections::{HashMap, HashSet};
use std::path::Path;

// Note・Wiki・ノード（名前・中身の順）の順に並べる（FN0201-BR03）。
// ノードは同期バッチで登録したものを使うが、消えたファイルも残るため、実体があるものだけを返す。
// types は探す種類（空ならすべて。FN0201-BR09）。
// name_only はファイル名・フォルダ名だけで探す（パスの最後の名前に合うものだけ。説明・中身・Note・Wiki は探さない。FN0201-BR10）
pub fn search(
    conn: &Connection,
    user_id: &str,
    keyword: &str,
    types: &[String],
    name_only: bool,
    folder_root: &str,
) -> rusqlite::Result<SearchResponse> {
    let filter = Filter(types);
    let notes = if !name_only && filter.allows(kind::NOTE) {
        note_repo::find_by_search(conn, user_id, keyword)?
    } else {
        Vec::new()
    };
    let wikis = if !name_only && filter.allows(kind::WIKI) {
        wiki_repo::find_by_search(conn, keyword)?
    } else {
        Vec::new()
    };
    // 検索の対象外（全員の分と本人の分。FN0202-BR16・BR17）
    let exclusions = search_exclusion::load(conn, Some(user_id))?;
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
        if exclusions.excludes(&path) || (name_only && !name_matches(&path, keyword)) {
            continue;
        }
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

    if name_only {
        return Ok(SearchResponse { search_items });
    }

    // ファイルの中身（FN0202）。名前で見つかったものは除く。単語の区切りに失敗しても、名前の検索の結果は返す
    match index::current_tokenizer(conn) {
        Ok(tokenizer) => {
            let words = tokenizer.query_words(keyword);
            // 絞り込むとき（種類・本人の対象外）は多めに取る
            let limit = if filter.is_all() && exclusions.is_empty() {
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
                    || exclusions.excludes(&path)
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
        Err(e) => crate::elog!("search tokenizer error: {e}"),
    }

    Ok(SearchResponse { search_items })
}

// パスの最後の名前（ファイル名・フォルダ名）に検索語が入っているか。
// 名前の検索の SQL（LIKE）に合わせて、英字の大文字と小文字は区別しない
fn name_matches(path: &str, keyword: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.to_ascii_lowercase()
        .contains(&keyword.to_ascii_lowercase())
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
    // 検索の対象外（全員の分と本人の分）は出さない（FN0202-BR16・BR17）。
    // バックアップを丸ごと写すと新しいファイルが並ぶので、対象外があるときは多めに取る
    let exclusions = search_exclusion::load(conn, Some(user_id))?;
    let fetch = if exclusions.is_empty() {
        RECENT_FILES
    } else {
        RECENT_FILES_FILTERED
    };
    let files = node_repo::find_recent_files(conn, fetch)?
        .into_iter()
        .filter(|(path, _)| !exclusions.excludes(path))
        .filter(|(path, _)| Path::new(folder_root).join(path).is_file())
        .take(RECENT_FILES as usize)
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

// お気に入りの一覧（FN0601）。種類によらず、登録の新しいものから並べる（FN0601-BR08）。参照先が消えたものは出さない
pub fn get_favorite_list(
    conn: &Connection,
    user_id: &str,
) -> rusqlite::Result<FavoriteListResponse> {
    let favorites = favorite_repo::find_by_user_id(conn, user_id)?;
    let ids = |pick: fn(&crate::model::favorite::Favorite) -> &String| -> Vec<String> {
        favorites
            .iter()
            .map(pick)
            .filter(|id| !id.is_empty())
            .cloned()
            .collect()
    };
    let nodes: HashMap<String, String> = node_repo::find_by_node_ids(conn, &ids(|f| &f.node_id))?
        .into_iter()
        .map(|node| (node.node_id, node.path))
        .collect();
    let notes: HashMap<String, String> =
        note_repo::find_by_note_ids(conn, user_id, &ids(|f| &f.note_id))?
            .into_iter()
            .map(|note| (note.note_id, note.title))
            .collect();
    let wikis: HashMap<String, String> = wiki_repo::find_by_wiki_ids(conn, &ids(|f| &f.wiki_id))?
        .into_iter()
        .map(|wiki| (wiki.wiki_id, wiki.title))
        .collect();

    // 参照先が消えたお気に入りは出さず、行も消す（API0601）
    let mut missing = Vec::new();
    let favorite_list = favorites
        .into_iter()
        .filter_map(|favorite| {
            let found = if !favorite.node_id.is_empty() {
                nodes.get(&favorite.node_id)
            } else if !favorite.note_id.is_empty() {
                notes.get(&favorite.note_id)
            } else {
                wikis.get(&favorite.wiki_id)
            };
            let Some(name) = found.cloned() else {
                missing.push(favorite.favorite_id);
                return None;
            };
            Some(FavoriteItem {
                favorite_id: favorite.favorite_id,
                name,
                node_id: favorite.node_id,
                note_id: favorite.note_id,
                wiki_id: favorite.wiki_id,
            })
        })
        .collect();
    for favorite_id in missing {
        let _ = favorite_repo::delete_favorite(conn, user_id, &favorite_id);
    }

    Ok(FavoriteListResponse { favorite_list })
}

#[cfg(test)]
mod tests {
    use super::*;

    // 名前だけで探すときは、パスの最後の名前だけを見る（親のフォルダの名前では当たらない）
    #[test]
    fn name_matches_only_the_last_name() {
        assert!(name_matches("営業/見積/Report_2026.xlsx", "report"));
        assert!(name_matches("営業/見積", "見積"));
        assert!(!name_matches("営業/見積/a.xlsx", "見積"));
        assert!(!name_matches("営業/見積/a.xlsx", "営業"));
    }
}
