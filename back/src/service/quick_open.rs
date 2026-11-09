use std::collections::HashMap;
use std::path::Path;

use rusqlite::Connection;

use crate::{
    api::home::response::{QuickOpenItem, QuickOpenResponse},
    repository::{
        content_folder as folder_repo, node as node_repo, note as note_repo, wiki as wiki_repo,
    },
    search::fuzzy::Query,
};

// 返す最大の件数（画面は最近開いたもの・画面の操作と合わせて並べ直す）
const LIMIT: usize = 50;
// 打った文字のうち使う長さ（長すぎる入力で時間がかからないように）
const KEYWORD_MAX: usize = 100;

struct Candidate {
    kind: &'static str,
    id: String,
    name: String,
    location: String,
    path: String,
    score: i64,
}

// 探して開く（FN0003）。本人の Note・全員の Wiki・ノードの名前をあいまい検索し、点数の高い順に返す。
// ノードは同期バッチで登録したものを使い、実体があるものだけを返す（ホームの検索と同じ）
pub fn search(
    conn: &Connection,
    user_id: &str,
    keyword: &str,
    folder_root: &str,
    show_hidden: bool,
) -> rusqlite::Result<QuickOpenResponse> {
    let keyword: String = keyword.chars().take(KEYWORD_MAX).collect();
    let Some(query) = Query::parse(&keyword) else {
        return Ok(QuickOpenResponse { items: Vec::new() });
    };
    let mut candidates = Vec::new();

    let note_places = places(conn, "note", Some(user_id))?;
    for note in note_repo::find_by_user_id(conn, user_id)? {
        let location = note_places.get(&note.note_id).cloned().unwrap_or_default();
        if let Some(score) = query.score(&location, &note.title) {
            candidates.push(Candidate {
                kind: "note",
                id: note.note_id,
                name: note.title,
                location,
                path: String::new(),
                score,
            });
        }
    }

    let wiki_places = places(conn, "wiki", None)?;
    for wiki in wiki_repo::find_all(conn)? {
        let location = wiki_places.get(&wiki.wiki_id).cloned().unwrap_or_default();
        if let Some(score) = query.score(&location, &wiki.title) {
            candidates.push(Candidate {
                kind: "wiki",
                id: wiki.wiki_id,
                name: wiki.title,
                location,
                path: String::new(),
                score,
            });
        }
    }

    for (node_id, path) in node_repo::find_all(conn)? {
        // 隠しファイル（「.」で始まる名前）と、その中のものは、出す設定のときだけ（FN0701）
        if path.is_empty() || (!show_hidden && path.split('/').any(|part| part.starts_with('.'))) {
            continue;
        }
        let (location, name) = path.rsplit_once('/').unwrap_or(("", &path));
        if let Some(score) = query.score(location, name) {
            candidates.push(Candidate {
                kind: "file",
                id: node_id,
                name: name.to_string(),
                location: location.to_string(),
                path: path.clone(),
                score,
            });
        }
    }

    // 点数の高い順。同じなら名前・場所の短い順（打った文字に近いもの）
    candidates.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| a.name.chars().count().cmp(&b.name.chars().count()))
            .then_with(|| a.location.chars().count().cmp(&b.location.chars().count()))
            .then_with(|| a.name.cmp(&b.name))
    });

    let mut items = Vec::new();
    for candidate in candidates {
        let kind = if candidate.kind == "file" {
            // 消えたもの（同期の前）は出さない。フォルダかどうかは実体で決める
            match Path::new(folder_root).join(&candidate.path).metadata() {
                Ok(metadata) if metadata.is_dir() => "folder",
                Ok(_) => "file",
                Err(_) => continue,
            }
        } else {
            candidate.kind
        };
        items.push(QuickOpenItem {
            kind: kind.to_string(),
            id: candidate.id,
            name: candidate.name,
            location: candidate.location,
            path: candidate.path,
            score: candidate.score,
        });
        if items.len() >= LIMIT {
            break;
        }
    }
    Ok(QuickOpenResponse { items })
}

// Note・Wiki の ID -> 入っているフォルダの場所（フォルダの名前を "/" でつないだもの。FN0403）
fn places(
    conn: &Connection,
    kind: &str,
    owner: Option<&str>,
) -> rusqlite::Result<HashMap<String, String>> {
    let folders: HashMap<String, (String, String)> = folder_repo::find_all(conn, kind, owner)?
        .into_iter()
        .map(|folder| (folder.folder_id, (folder.parent_id, folder.name)))
        .collect();
    let path_of = |folder_id: &str| {
        let mut names = Vec::new();
        let mut current = folder_id;
        // 壊れたデータで親をたどり続けないよう、深さに上限を置く
        while let Some((parent_id, name)) = folders.get(current) {
            names.push(name.as_str());
            if names.len() > 64 {
                break;
            }
            current = parent_id;
        }
        names.reverse();
        names.join("/")
    };
    Ok(folder_repo::find_items(conn, kind, owner)?
        .into_iter()
        .map(|(item_id, folder_id)| (item_id, path_of(&folder_id)))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connect() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        for sql in [
            include_str!("../data/migration/T004_create_node.sql"),
            include_str!("../data/migration/T006_create_note.sql"),
            include_str!("../data/migration/T007_create_wiki.sql"),
            include_str!("../data/migration/T013_add_wiki_updated_by.sql"),
            include_str!("../data/migration/T016_create_content_folder.sql"),
        ] {
            conn.execute_batch(sql).unwrap();
        }
        conn
    }

    fn names(response: &QuickOpenResponse) -> Vec<(&str, &str, &str)> {
        response
            .items
            .iter()
            .map(|item| {
                (
                    item.kind.as_str(),
                    item.name.as_str(),
                    item.location.as_str(),
                )
            })
            .collect()
    }

    #[test]
    fn finds_notes_wikis_and_nodes_by_name() {
        let conn = connect();
        let root = std::env::temp_dir().join(format!("ari-quick-open-{}", std::process::id()));
        std::fs::create_dir_all(root.join("議事録/.git")).unwrap();
        std::fs::write(root.join("議事録/定例.txt"), "").unwrap();
        std::fs::write(root.join("議事録/.git/定例"), "").unwrap();
        for (id, path) in [
            ("n1", "議事録"),
            ("n2", "議事録/定例.txt"),
            ("n3", "議事録/.git/定例"),
            ("n4", "消えた定例.txt"),
        ] {
            node_repo::create_node(&conn, id, path).unwrap();
        }
        note_repo::create_note(&conn, "taro", "nt_1", "定例メモ").unwrap();
        note_repo::create_note(&conn, "hanako", "nt_2", "花子の定例").unwrap();
        wiki_repo::create_wiki(&conn, "hanako", "wk_1", "定例の進め方").unwrap();
        folder_repo::create(&conn, "wiki", "hanako", "cf_1", "", "手順書").unwrap();
        folder_repo::create(&conn, "wiki", "hanako", "cf_2", "cf_1", "会議").unwrap();
        folder_repo::place_item(&conn, "wiki", "wk_1", "cf_2").unwrap();
        let folder_root = root.to_str().unwrap();

        let found = search(&conn, "taro", "定例", folder_root, false).unwrap();
        let mut list = names(&found);
        list.sort();
        // ほかの人の Note・隠しフォルダの中・消えたファイルは出ない。Wiki はフォルダの場所を付ける
        assert_eq!(
            list,
            vec![
                ("file", "定例.txt", "議事録"),
                ("note", "定例メモ", ""),
                ("wiki", "定例の進め方", "手順書/会議"),
            ]
        );

        let found = search(&conn, "taro", "定例", folder_root, true).unwrap();
        assert!(names(&found).contains(&("file", "定例", "議事録/.git")));

        // フォルダの名前でも探せ、フォルダは folder になる
        let found = search(&conn, "taro", "議事録", folder_root, false).unwrap();
        assert_eq!(names(&found)[0], ("folder", "議事録", ""));

        assert!(
            search(&conn, "taro", "  ", folder_root, false)
                .unwrap()
                .items
                .is_empty()
        );
        std::fs::remove_dir_all(&root).unwrap();
    }
}
