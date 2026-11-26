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

// 検索語が空で期間だけのときに出すファイル・フォルダの最大の件数（FN0201-BR11）
const PERIOD_ONLY_LIMIT: i64 = 300;

/// 更新日の期間（UNIX 秒。from 以上・to 未満。FN0201-BR11）
#[derive(Default)]
pub struct Period {
    from: Option<i64>,
    to: Option<i64>,
}

impl Period {
    /// この PC の日付（YYYY-MM-DD。両端を含む。空なら区切らない）から作る。読めない日付は None
    pub fn parse(from: &str, to: &str) -> Option<Self> {
        let start = |text: &str, add_days: u64| -> Option<Option<i64>> {
            if text.is_empty() {
                return Some(None);
            }
            let date = chrono::NaiveDate::parse_from_str(text, "%Y-%m-%d").ok()?;
            let date = date.checked_add_days(chrono::Days::new(add_days))?;
            let time = date
                .and_hms_opt(0, 0, 0)?
                .and_local_timezone(chrono::Local)
                .earliest()?;
            Some(Some(time.timestamp()))
        };
        Some(Period {
            from: start(from, 0)?,
            to: start(to, 1)?,
        })
    }

    fn is_all(&self) -> bool {
        self.from.is_none() && self.to.is_none()
    }

    fn contains(&self, time: Option<i64>) -> bool {
        if self.is_all() {
            return true;
        }
        let Some(time) = time else {
            return false;
        };
        self.from.is_none_or(|from| time >= from) && self.to.is_none_or(|to| time < to)
    }
}

// Note・Wiki の updated_at（UTC の "YYYY-MM-DD HH:MM:SS"）を UNIX 秒に
fn utc_text_seconds(text: &str) -> Option<i64> {
    chrono::NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S")
        .ok()
        .map(|time| time.and_utc().timestamp())
}

fn local_text(seconds: Option<i64>) -> String {
    seconds
        .and_then(|seconds| chrono::DateTime::from_timestamp(seconds, 0))
        .map(|time| {
            time.with_timezone(&chrono::Local)
                .format("%Y/%m/%d %H:%M")
                .to_string()
        })
        .unwrap_or_default()
}

fn file_seconds(metadata: &std::fs::Metadata) -> Option<i64> {
    let modified = metadata.modified().ok()?;
    Some(chrono::DateTime::<chrono::Utc>::from(modified).timestamp())
}

// Note・Wiki・ノード（名前・中身の順）の順に並べる（FN0201-BR03）。
// ノードは同期バッチで登録したものを使うが、消えたファイルも残るため、実体があるものだけを返す。
// types は探す種類（空ならすべて。FN0201-BR09）。
// name_only はファイル名・フォルダ名だけで探す（パスの最後の名前に合うものだけ。説明・中身・Note・Wiki は探さない。FN0201-BR10）。
// period は更新日の期間。期間があれば検索語は空でもよい（その期間に更新したものを新しい順に出す。BR11）
pub fn search(
    conn: &Connection,
    user_id: &str,
    keyword: &str,
    types: &[String],
    name_only: bool,
    period: &Period,
    folder_root: &str,
) -> rusqlite::Result<SearchResponse> {
    let period_only = keyword.is_empty();
    if period_only && period.is_all() {
        return Ok(SearchResponse {
            search_items: Vec::new(),
        });
    }
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
    let nodes = if period_only {
        node_repo::find_modified_between(
            conn,
            period.from.unwrap_or(0),
            period.to.unwrap_or(i64::MAX),
            PERIOD_ONLY_LIMIT * 3,
        )?
    } else {
        node_repo::find_by_search(conn, keyword)?
    };
    let mut search_items: Vec<SearchItem> = Vec::new();

    for note in notes {
        let seconds = utc_text_seconds(&note.updated_at);
        if period.contains(seconds) {
            search_items.push(SearchItem {
                view_type: "note".to_string(),
                name: note.title.to_string(),
                node_id: "".to_string(),
                note_id: note.note_id.to_string(),
                wiki_id: "".to_string(),
                node_type: "".to_string(),
                match_type: "".to_string(),
                updated_at: local_text(seconds),
            });
        }
    }

    for wiki in wikis {
        let seconds = utc_text_seconds(&wiki.updated_at);
        if period.contains(seconds) {
            search_items.push(SearchItem {
                view_type: "wiki".to_string(),
                name: wiki.title.to_string(),
                node_id: "".to_string(),
                note_id: "".to_string(),
                wiki_id: wiki.wiki_id.to_string(),
                node_type: "".to_string(),
                match_type: "".to_string(),
                updated_at: local_text(seconds),
            });
        }
    }

    let mut found = HashSet::new();
    let mut node_count = 0;
    for (node_id, path) in nodes {
        if period_only && node_count >= PERIOD_ONLY_LIMIT {
            break;
        }
        if exclusions.excludes(&path) || (name_only && !name_matches(&path, keyword)) {
            continue;
        }
        let full_path = Path::new(folder_root).join(&path);
        let Ok(metadata) = std::fs::metadata(&full_path) else {
            continue;
        };
        let seconds = file_seconds(&metadata);
        if !period.contains(seconds) {
            continue;
        }
        let is_dir = metadata.is_dir();
        if !filter.allows(if is_dir {
            kind::FOLDER
        } else {
            kind::file_kind(&path)
        }) {
            continue;
        }
        node_count += 1;
        found.insert(node_id.clone());
        search_items.push(SearchItem {
            view_type: "node".to_string(),
            name: path,
            node_id,
            note_id: "".to_string(),
            wiki_id: "".to_string(),
            node_type: if is_dir { "folder" } else { "file" }.to_string(),
            match_type: if period_only { "" } else { "name" }.to_string(),
            updated_at: local_text(seconds),
        });
    }

    if name_only || period_only {
        return Ok(SearchResponse { search_items });
    }

    // ファイルの中身（FN0202）。名前で見つかったものは除く。単語の区切りに失敗しても、名前の検索の結果は返す
    match index::current_tokenizer(conn) {
        Ok(tokenizer) => {
            let words = tokenizer.query_words(keyword);
            // 絞り込むとき（種類・本人の対象外・期間）は多めに取る
            let limit = if filter.is_all() && exclusions.is_empty() && period.is_all() {
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
                {
                    continue;
                }
                let Ok(metadata) = std::fs::metadata(Path::new(folder_root).join(&path)) else {
                    continue;
                };
                let seconds = file_seconds(&metadata);
                if !metadata.is_file() || !period.contains(seconds) {
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
                    updated_at: local_text(seconds),
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
    fn period_includes_both_ends() {
        let period = Period::parse("2026-11-01", "2026-11-30").unwrap();
        let at = |text: &str| {
            chrono::NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S")
                .unwrap()
                .and_local_timezone(chrono::Local)
                .unwrap()
                .timestamp()
        };
        assert!(period.contains(Some(at("2026-11-01 00:00:00"))));
        assert!(period.contains(Some(at("2026-11-30 23:59:59"))));
        assert!(!period.contains(Some(at("2026-10-31 23:59:59"))));
        assert!(!period.contains(Some(at("2026-12-01 00:00:00"))));
        assert!(!period.contains(None));
        // 片方だけ・指定なし
        let since = Period::parse("2026-11-01", "").unwrap();
        assert!(since.contains(Some(at("2030-01-01 00:00:00"))));
        assert!(Period::parse("", "").unwrap().contains(None));
        assert!(Period::parse("11/1", "").is_none());
    }

    #[test]
    fn name_matches_only_the_last_name() {
        assert!(name_matches("営業/見積/Report_2026.xlsx", "report"));
        assert!(name_matches("営業/見積", "見積"));
        assert!(!name_matches("営業/見積/a.xlsx", "見積"));
        assert!(!name_matches("営業/見積/a.xlsx", "営業"));
    }
}
