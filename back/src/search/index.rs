use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant, UNIX_EPOCH};

use rusqlite::Connection;
use serde::Serialize;

use crate::repository::{node as node_repo, search as search_repo};
use crate::search::extract::{self, Extracted};
use crate::search::ocr::{self, Engine};
use crate::search::tokenizer::{self, Tokenizer};

// 取り込むファイルの大きさの上限（FN0202-BR04）
pub const MAX_FILE_BYTES: u64 = 100 * 1024 * 1024;

// 1 回の取り込みにかける時間の上限。残りは次の回に回す（バッチが重なったり、長く DB を使い続けたりしないように）
const TIME_BUDGET: Duration = Duration::from_secs(45);

// 取り出し方の版。取り出し方を変えたら値を変える（すべてのファイルを取り込み直す）。
// 2026-11-08: Excel の図形・コメント、文字認識（FN0202-BR14）を加えた。画像のある PDF のページを描いて読むようにした
const EXTRACTOR_SALT: i64 = 0x4B3E_0F21_9D6A_7C59;

static RUNNING: AtomicBool = AtomicBool::new(false);
static LAST_RUN: RwLock<Option<RunSummary>> = RwLock::new(None);

// 1 回の取り込みの結果。設定画面の取り込み状況に出す
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSummary {
    // 取り込んだ（取り込み直した）ファイルの数
    pub processed: usize,
    // 時間切れで次の回に回したファイルの数
    pub pending: usize,
    // 終わった日時（UTC の "YYYY-MM-DD HH:MM:SS"）
    pub finished_at: String,
}

pub fn last_run() -> Option<RunSummary> {
    LAST_RUN.read().unwrap().clone()
}

// 今のユーザー辞書で単語を区切るもの
pub fn current_tokenizer(conn: &Connection) -> Result<Arc<Tokenizer>, String> {
    let words = search_repo::find_dictionary_words(conn).map_err(|e| e.to_string())?;
    tokenizer::get(&words)
}

// 取り込みバッチ（BAT0302）。node に登録済みのファイルのうち、新しい・更新された・辞書が変わったものを取り込む。
// 消えたファイル・対象外になったファイルの単語は消す。前の回が終わっていなければ何もしない
pub fn execute(conn: &Connection, folder_root: &str) -> Result<RunSummary, String> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("前回の取り込みが終わっていません".to_string());
    }
    let result = run(conn, folder_root, TIME_BUDGET);
    RUNNING.store(false, Ordering::SeqCst);
    if let Ok(summary) = &result {
        *LAST_RUN.write().unwrap() = Some(summary.clone());
    }
    result
}

struct Target {
    node_id: String,
    // folder/ からのパス（文字認識の進み具合に出す）
    relative_path: String,
    path: std::path::PathBuf,
    modified_at: i64,
    size: i64,
}

fn run(conn: &Connection, folder_root: &str, budget: Duration) -> Result<RunSummary, String> {
    let started = Instant::now();
    let tokenizer = current_tokenizer(conn)?;
    let version = tokenizer.version;
    let nodes = node_repo::find_all(conn).map_err(|e| e.to_string())?;
    let states = search_repo::find_all_content_states(conn).map_err(|e| e.to_string())?;

    // node に無いノードの状態・単語の対応を消す（毎回すべてを見る。FN0202-BR08）
    let mut removed = search_repo::delete_orphans(conn).map_err(|e| e.to_string())?;
    let mut targets = Vec::new();
    for (node_id, relative_path) in nodes {
        let path = Path::new(folder_root).join(&relative_path);
        let metadata = std::fs::metadata(&path).ok().filter(|m| m.is_file());
        let Some(metadata) = metadata.filter(|_| extract::is_supported(&path)) else {
            // 消えた・フォルダ・対象外の形式
            if states.contains_key(&node_id) {
                search_repo::delete_node_index(conn, &node_id).map_err(|e| e.to_string())?;
                removed += 1;
            }
            continue;
        };
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs() as i64)
            .unwrap_or(0);
        let size = metadata.len() as i64;
        let unchanged = states.get(&node_id).is_some_and(|state| {
            state.modified_at == modified_at
                && state.size == size
                // 大きすぎるファイルは辞書が変わっても取り込まないので、版は見ない
                && (state.dictionary_version == file_version(&path, version)
                    || state.status == "too_large")
        });
        if !unchanged {
            targets.push(Target {
                node_id,
                relative_path,
                path,
                modified_at,
                size,
            });
        }
    }

    // 文字認識の要るファイル（PDF・画像・Office）は時間がかかるので後に回す（ほかのファイルを待たせないように）
    // それぞれの中では小さい順にし、大きなファイル（200 ページの PDF など）が小さなファイルを待たせないようにする
    targets.sort_by_key(|target| (extract::uses_ocr(&target.path), target.size));
    // 文字認識はこの回の間だけ使う（モデルは最初に使うときに読み込み、回が終わったら捨ててメモリを返す）
    let mut engine = Engine::new();
    let mut processed = 0;
    for target in &targets {
        // 1 つのファイルは途中で止めない（200 ページの PDF は数分かかる）。時間を超えたら次のファイルからは次の回へ
        if started.elapsed() > budget {
            break;
        }
        ocr::begin_file(&target.relative_path);
        let result = index_file(conn, &tokenizer, &mut engine, target);
        ocr::end_file();
        result.map_err(|e| e.to_string())?;
        processed += 1;
    }

    if removed > 0 || processed > 0 {
        search_repo::delete_unused_keywords(conn).map_err(|e| e.to_string())?;
    }

    let finished_at = conn
        .query_row("SELECT CURRENT_TIMESTAMP", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(RunSummary {
        processed,
        pending: targets.len() - processed,
        finished_at,
    })
}

// ファイルに記録する版。辞書の版と取り出し方の版から決める。文字認識した PDF・画像・Office は別の版にし、
// モデルを置いたら取り込み直す（FN0202-BR15）
fn file_version(path: &Path, dictionary_version: i64) -> i64 {
    let version = dictionary_version ^ EXTRACTOR_SALT;
    if extract::uses_ocr(path) {
        ocr::index_version(version)
    } else {
        version
    }
}

// 今の辞書で取り込み済みとみなす版（文字認識なし・あり）。取り込み状況を数えるのに使う
pub fn current_versions(dictionary_version: i64) -> [i64; 2] {
    let version = dictionary_version ^ EXTRACTOR_SALT;
    [version, ocr::index_version(version)]
}

fn index_file(
    conn: &Connection,
    tokenizer: &Tokenizer,
    engine: &mut Engine,
    target: &Target,
) -> rusqlite::Result<()> {
    let version = file_version(&target.path, tokenizer.version);
    let skip = |status: &str, message: &str| {
        search_repo::mark_node_skipped(
            conn,
            &target.node_id,
            target.modified_at,
            target.size,
            status,
            message,
            version,
        )
    };
    if target.size as u64 > MAX_FILE_BYTES {
        return skip("too_large", "");
    }
    match extract::extract(&target.path, engine) {
        Ok(Extracted::Text(text)) => {
            let words = tokenizer.index_words(&text);
            search_repo::replace_node_words(
                conn,
                &target.node_id,
                &words,
                target.modified_at,
                target.size,
                version,
            )
        }
        Ok(Extracted::Unsupported) => search_repo::delete_node_index(conn, &target.node_id),
        Err(message) => {
            eprintln!("content index error: {} {message}", target.path.display());
            skip("error", &message)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn connect() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        for sql in [
            include_str!("../data/migration/T002_create_user.sql"),
            include_str!("../data/migration/T004_create_node.sql"),
            include_str!("../data/migration/T009_create_search_index.sql"),
        ] {
            conn.execute_batch(sql).unwrap();
        }
        conn
    }

    fn search(conn: &Connection, keyword: &str) -> Vec<String> {
        let words = current_tokenizer(conn).unwrap().query_words(keyword);
        search_repo::find_nodes_by_words(conn, &words, 100)
            .unwrap()
            .into_iter()
            .map(|(_, path)| path)
            .collect()
    }

    fn keyword_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM keyword", [], |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn run_indexes_changed_files_and_removes_deleted() {
        let dir = std::env::temp_dir().join(format!("ari-index-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("a")).unwrap();
        fs::write(dir.join("a/memo.txt"), "関西国際空港の議事録").unwrap();
        fs::write(dir.join("b.md"), "空港の見積書").unwrap();
        // 対象外の形式（.png はモデルがあると文字認識の対象になるので、ここでは使わない）
        fs::write(dir.join("c.exe"), "空港").unwrap();
        let root = dir.to_str().unwrap();
        let conn = connect();
        for (id, path) in [
            ("n1", "a"),
            ("n2", "a/memo.txt"),
            ("n3", "b.md"),
            ("n4", "c.exe"),
        ] {
            node_repo::create_node(&conn, id, path).unwrap();
        }

        let summary = run(&conn, root, TIME_BUDGET).unwrap();
        assert_eq!(summary.processed, 2);
        assert_eq!(search(&conn, "空港"), ["a/memo.txt", "b.md"]);
        assert_eq!(search(&conn, "関西国際空港　議事録"), ["a/memo.txt"]);
        assert!(search(&conn, "見積書 議事録").is_empty());
        // 変わっていなければ取り込み直さない
        assert_eq!(run(&conn, root, TIME_BUDGET).unwrap().processed, 0);

        // 同じ単語は 1 行にまとめる
        let before = keyword_count(&conn);
        fs::write(dir.join("b.md"), "議事録").unwrap();
        // 更新日時が同じ秒でもサイズで気づく
        assert_eq!(run(&conn, root, TIME_BUDGET).unwrap().processed, 1);
        assert_eq!(search(&conn, "見積書"), Vec::<String>::new());
        assert!(keyword_count(&conn) < before);

        // 消えたファイルの単語は消す
        fs::remove_file(dir.join("a/memo.txt")).unwrap();
        run(&conn, root, TIME_BUDGET).unwrap();
        assert!(search(&conn, "関西国際空港").is_empty());
        let states: i64 = conn
            .query_row("SELECT COUNT(*) FROM node_content", [], |row| row.get(0))
            .unwrap();
        assert_eq!(states, 1);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn dictionary_change_reindexes_files() {
        let dir = std::env::temp_dir().join(format!("ari-index-dic-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.txt"), "ありドックス連携基盤の設計").unwrap();
        let root = dir.to_str().unwrap();
        let conn = connect();
        node_repo::create_node(&conn, "n1", "a.txt").unwrap();

        run(&conn, root, TIME_BUDGET).unwrap();
        let words = |conn: &Connection| -> Vec<String> {
            let mut stmt = conn
                .prepare("SELECT word FROM keyword ORDER BY word")
                .unwrap();
            stmt.query_map([], |row| row.get(0))
                .unwrap()
                .map(|w| w.unwrap())
                .collect()
        };
        assert!(!words(&conn).contains(&"ありドックス連携基盤".to_string()));

        search_repo::create_dictionary_word(&conn, "ありドックス連携基盤", "local").unwrap();
        assert_eq!(run(&conn, root, TIME_BUDGET).unwrap().processed, 1);
        assert!(words(&conn).contains(&"ありドックス連携基盤".to_string()));
        assert_eq!(search(&conn, "ありドックス連携基盤"), ["a.txt"]);
        // 時間切れのときは次の回に回す
        search_repo::delete_dictionary_word(&conn, "ありドックス連携基盤").unwrap();
        let summary = run(&conn, root, Duration::ZERO).unwrap();
        assert_eq!((summary.processed, summary.pending), (0, 1));
        fs::remove_dir_all(&dir).unwrap();
    }

    // 以前の版で、ノードを消しても取り込みの状態・単語の対応が残っていたもの。次の取り込みで消す
    #[test]
    fn run_removes_states_of_deleted_nodes() {
        let dir = std::env::temp_dir().join(format!("ari-orphan-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("memo.txt"), "関西国際空港の議事録").unwrap();
        let root = dir.to_str().unwrap();
        let conn = connect();
        node_repo::create_node(&conn, "n1", "memo.txt").unwrap();
        run(&conn, root, TIME_BUDGET).unwrap();
        assert_eq!(search(&conn, "議事録"), ["memo.txt"]);

        // 状態を残したままノードの行だけを消す（以前の削除の動き）
        conn.execute("DELETE FROM node WHERE node_id = 'n1'", [])
            .unwrap();
        run(&conn, root, TIME_BUDGET).unwrap();
        for table in ["node_content", "node_keyword", "keyword"] {
            let count: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(count, 0, "{table}");
        }
        let _ = fs::remove_dir_all(&dir);
    }

    // 文章と検索語で単語の区切り目がずれても、部分一致で見つける（FN0202-BR06）
    #[test]
    fn search_matches_parts_of_words() {
        let dir = std::env::temp_dir().join(format!("ari-partial-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("契約.txt"), "委託料は金3,850,000円（消費税込み）").unwrap();
        fs::write(dir.join("議事録.txt"), "定例会議の議事録").unwrap();
        let root = dir.to_str().unwrap();
        let conn = connect();
        node_repo::create_node(&conn, "n1", "契約.txt").unwrap();
        node_repo::create_node(&conn, "n2", "議事録.txt").unwrap();
        run(&conn, root, TIME_BUDGET).unwrap();

        // 「消費税込み」は「消費」「税込み」、検索語「消費税」は「消費」「税」と区切られる
        assert_eq!(search(&conn, "消費税"), ["契約.txt"]);
        assert_eq!(search(&conn, "税込"), ["契約.txt"]);
        // 「定例会議」は「定例」「会議」、検索語「定例会」は「定例」「会」と区切られる
        assert_eq!(search(&conn, "定例会"), ["議事録.txt"]);
        // すべての単語を含むものだけ（AND）
        assert!(search(&conn, "消費税 議事録").is_empty());

        // 完全に一致したファイルを先に並べる（「消費税」と書いたファイルは、パスの順では後ろでも先に出る）
        fs::write(dir.join("請求.txt"), "消費税の計算").unwrap();
        node_repo::create_node(&conn, "n3", "請求.txt").unwrap();
        run(&conn, root, TIME_BUDGET).unwrap();
        assert_eq!(search(&conn, "消費税"), ["請求.txt", "契約.txt"]);
        let _ = fs::remove_dir_all(&dir);
    }
}
