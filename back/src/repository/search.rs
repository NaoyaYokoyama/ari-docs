use rusqlite::{Connection, Result, params, params_from_iter};
use std::collections::{BTreeSet, HashMap};

// ファイルごとの取り込みの状態（node_content）
pub struct ContentState {
    pub modified_at: i64,
    pub size: i64,
    pub status: String,
    pub dictionary_version: i64,
}

pub fn find_all_content_states(conn: &Connection) -> Result<HashMap<String, ContentState>> {
    let sql = "
        SELECT
          node_id,
          modified_at,
          size,
          status,
          dictionary_version
        FROM
          node_content
        ";
    let mut stmt = conn.prepare(sql)?;
    stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            ContentState {
                modified_at: row.get(1)?,
                size: row.get(2)?,
                status: row.get(3)?,
                dictionary_version: row.get(4)?,
            },
        ))
    })?
    .collect()
}

// ファイルの単語を登録し直す（前の単語は消す）。同じ単語は keyword の 1 行を使う
pub fn replace_node_words(
    conn: &Connection,
    node_id: &str,
    words: &BTreeSet<String>,
    modified_at: i64,
    size: i64,
    dictionary_version: i64,
) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM node_keyword WHERE node_id = ?1", [node_id])?;
    {
        let mut insert_word =
            tx.prepare_cached("INSERT OR IGNORE INTO keyword (word) VALUES (?1)")?;
        let mut find_word = tx.prepare_cached("SELECT keyword_id FROM keyword WHERE word = ?1")?;
        let mut insert_link = tx.prepare_cached(
            "INSERT OR IGNORE INTO node_keyword (keyword_id, node_id) VALUES (?1, ?2)",
        )?;
        for word in words {
            insert_word.execute([word])?;
            let keyword_id: i64 = find_word.query_row([word], |row| row.get(0))?;
            insert_link.execute(params![keyword_id, node_id])?;
        }
    }
    upsert_state(
        &tx,
        node_id,
        modified_at,
        size,
        "indexed",
        "",
        dictionary_version,
        words.len() as i64,
    )?;
    tx.commit()
}

// 取り込めなかったファイル（大きすぎる・読めない）。単語は消して状態だけ残す（変わるまで取り込み直さないため）
pub fn mark_node_skipped(
    conn: &Connection,
    node_id: &str,
    modified_at: i64,
    size: i64,
    status: &str,
    message: &str,
    dictionary_version: i64,
) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM node_keyword WHERE node_id = ?1", [node_id])?;
    upsert_state(
        &tx,
        node_id,
        modified_at,
        size,
        status,
        message,
        dictionary_version,
        0,
    )?;
    tx.commit()
}

#[allow(clippy::too_many_arguments)]
fn upsert_state(
    conn: &Connection,
    node_id: &str,
    modified_at: i64,
    size: i64,
    status: &str,
    message: &str,
    dictionary_version: i64,
    word_count: i64,
) -> Result<usize> {
    let sql = "
        INSERT INTO node_content (
          node_id,
          modified_at,
          size,
          status,
          message,
          dictionary_version,
          word_count
        )
        VALUES (
          ?1,
          ?2,
          ?3,
          ?4,
          ?5,
          ?6,
          ?7
        )
        ON CONFLICT(node_id) DO UPDATE SET
          modified_at = excluded.modified_at,
          size = excluded.size,
          status = excluded.status,
          message = excluded.message,
          dictionary_version = excluded.dictionary_version,
          word_count = excluded.word_count,
          indexed_at = CURRENT_TIMESTAMP
        ";
    conn.execute(
        sql,
        params![
            node_id,
            modified_at,
            size,
            status,
            message,
            dictionary_version,
            word_count
        ],
    )
}

// ファイルが消えた・対象外になったときに、そのファイルの単語と状態を消す
pub fn delete_node_index(conn: &Connection, node_id: &str) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM node_keyword WHERE node_id = ?1", [node_id])?;
    tx.execute("DELETE FROM node_content WHERE node_id = ?1", [node_id])?;
    tx.commit()
}

// node に無いノード（以前の版で消したときに残ったものなど）の取り込みの状態・単語の対応を消す。消した数
pub fn delete_orphans(conn: &Connection) -> Result<usize> {
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM node_keyword WHERE node_id NOT IN (SELECT node_id FROM node)",
        [],
    )?;
    let removed = tx.execute(
        "DELETE FROM node_content WHERE node_id NOT IN (SELECT node_id FROM node)",
        [],
    )?;
    tx.commit()?;
    Ok(removed)
}

// どのファイルからも使われなくなった単語を消す
pub fn delete_unused_keywords(conn: &Connection) -> Result<usize> {
    let sql = "
        DELETE FROM
          keyword
        WHERE NOT EXISTS (
          SELECT 1 FROM node_keyword WHERE node_keyword.keyword_id = keyword.keyword_id
        )
        ";
    conn.execute(sql, [])
}

// 中身の検索。検索語の単語ごとに、その単語を含む登録済みの単語（部分一致。LIKE '%単語%'）のあるファイルを探し、
// すべての単語で見つかったもの（AND）を返す（FN0202-BR06）。戻り値は (node_id, path)。
// 完全に一致した単語の多いファイルを先に並べ、同じならパスの順。
// 部分一致にするのは、文章と検索語で単語の区切り目がずれても見つけるため（例: 「消費税込み」は「消費」「税込み」と
// 区切られ、検索語「消費税」は「消費」「税」と区切られる。「税」は「税込み」に含まれる）
pub fn find_nodes_by_words(
    conn: &Connection,
    words: &BTreeSet<String>,
    limit: i64,
) -> Result<Vec<(String, String)>> {
    if words.is_empty() {
        return Ok(Vec::new());
    }
    let parts: Vec<String> = (1..=words.len())
        .map(|i| {
            format!(
                "SELECT node_id FROM node_keyword WHERE keyword_id IN \
                 (SELECT keyword_id FROM keyword WHERE word LIKE ?{i} ESCAPE '\\')"
            )
        })
        .collect();
    // 完全に一致した単語の数（?{n+1} 以降に単語そのものを渡す）
    let n = words.len();
    let exact = (n + 1..=n * 2)
        .map(|i| format!("?{i}"))
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "
        SELECT
          node.node_id,
          node.path
        FROM
          node
        WHERE
          node.node_id IN ({})
        ORDER BY
          (
            SELECT COUNT(*) FROM node_keyword
            WHERE node_keyword.node_id = node.node_id
              AND node_keyword.keyword_id IN (SELECT keyword_id FROM keyword WHERE word IN ({exact}))
          ) DESC,
          node.path ASC
        LIMIT {limit}
        ",
        parts.join(" INTERSECT ")
    );
    let patterns: Vec<String> = words
        .iter()
        .map(|word| format!("%{}%", escape_like(word)))
        .collect();
    let mut stmt = conn.prepare(&sql)?;
    let params = patterns.iter().chain(words.iter());
    stmt.query_map(params_from_iter(params), |row| {
        Ok((row.get(0)?, row.get(1)?))
    })?
    .collect()
}

// LIKE の % _ と、エスケープに使う \ を文字として扱う
fn escape_like(word: &str) -> String {
    word.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

pub struct IndexCounts {
    pub indexed: i64,
    pub outdated: i64,
    pub failed: i64,
    pub too_large: i64,
    pub keywords: i64,
}

// ocr_version は文字認識した PDF・画像の版（FN0202-BR15）。どちらかなら今の辞書で取り込み済み
pub fn count_index(
    conn: &Connection,
    dictionary_version: i64,
    ocr_version: i64,
) -> Result<IndexCounts> {
    let sql = "
        SELECT
          COALESCE(SUM(status = 'indexed' AND dictionary_version IN (?1, ?2)), 0),
          COALESCE(SUM(dictionary_version NOT IN (?1, ?2)), 0),
          COALESCE(SUM(status = 'error'), 0),
          COALESCE(SUM(status = 'too_large'), 0),
          (SELECT COUNT(*) FROM keyword)
        FROM
          node_content
        ";
    conn.query_row(sql, [dictionary_version, ocr_version], |row| {
        Ok(IndexCounts {
            indexed: row.get(0)?,
            outdated: row.get(1)?,
            failed: row.get(2)?,
            too_large: row.get(3)?,
            keywords: row.get(4)?,
        })
    })
}

// ユーザー辞書（search_dictionary）

pub struct DictionaryWord {
    pub word: String,
    pub created_by: String,
    pub created_at: String,
}

pub fn find_dictionary(conn: &Connection) -> Result<Vec<DictionaryWord>> {
    let sql = "
        SELECT
          search_dictionary.word,
          COALESCE(user.display_name, search_dictionary.created_by),
          search_dictionary.created_at
        FROM
          search_dictionary
          LEFT JOIN user ON user.user_id = search_dictionary.created_by
        ORDER BY
          search_dictionary.word ASC
        ";
    let mut stmt = conn.prepare(sql)?;
    stmt.query_map([], |row| {
        Ok(DictionaryWord {
            word: row.get(0)?,
            created_by: row.get(1)?,
            created_at: row.get(2)?,
        })
    })?
    .collect()
}

pub fn find_dictionary_words(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT word FROM search_dictionary ORDER BY word ASC")?;
    stmt.query_map([], |row| row.get(0))?.collect()
}

// 同じ単語があれば登録せず 0 を返す
pub fn create_dictionary_word(conn: &Connection, word: &str, user_id: &str) -> Result<usize> {
    let sql = "
        INSERT OR IGNORE INTO search_dictionary (
          word,
          created_by
        )
        VALUES (
          ?1,
          ?2
        )
        ";
    conn.execute(sql, [word, user_id])
}

pub fn delete_dictionary_word(conn: &Connection, word: &str) -> Result<usize> {
    conn.execute("DELETE FROM search_dictionary WHERE word = ?1", [word])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_like_treats_wildcards_as_text() {
        assert_eq!(escape_like("100%_a\\b"), "100\\%\\_a\\\\b");
    }
}
