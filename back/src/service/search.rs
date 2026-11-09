use rusqlite::Connection;

use crate::{
    api::search::response::{DictionaryResponse, DictionaryWordItem, IndexStatusResponse},
    repository::search as search_repo,
    search::{index, tokenizer},
};

pub enum DictionaryError {
    Invalid(String),
    Conflict(String),
    NotFound,
    Db(rusqlite::Error),
}

impl From<rusqlite::Error> for DictionaryError {
    fn from(error: rusqlite::Error) -> Self {
        DictionaryError::Db(error)
    }
}

// 1 つの単語の最大の文字数
const MAX_WORD_CHARS: usize = 50;

// 登録する単語。ファイルの中身と同じく正規化し（全角英数字・半角カナ・英字の大小をそろえる）、
// 空白と CSV の区切りになる文字（, "）を含むものは弾く（FN0202-BR09）
pub fn normalize_dictionary_word(word: &str) -> Result<String, DictionaryError> {
    let word = tokenizer::normalize(word.trim());
    let length = word.chars().count();
    if length == 0 || length > MAX_WORD_CHARS {
        return Err(DictionaryError::Invalid(format!(
            "単語は1文字以上{MAX_WORD_CHARS}文字以内で入力してください"
        )));
    }
    if word
        .chars()
        .any(|c| c.is_whitespace() || c == ',' || c == '"')
    {
        return Err(DictionaryError::Invalid(
            "単語に空白・カンマ（,）・ダブルクォート（\"）は使えません".to_string(),
        ));
    }
    if !word.chars().any(char::is_alphanumeric) {
        return Err(DictionaryError::Invalid(
            "記号だけの単語は登録できません".to_string(),
        ));
    }
    Ok(word)
}

pub fn get_dictionary(conn: &Connection, can_edit: bool) -> rusqlite::Result<DictionaryResponse> {
    let words = search_repo::find_dictionary(conn)?
        .into_iter()
        .map(|word| DictionaryWordItem {
            word: word.word,
            created_by: word.created_by,
            created_at: word.created_at,
        })
        .collect();
    Ok(DictionaryResponse { words, can_edit })
}

// 登録した単語は、次の取り込み（BAT0302）からすべてのファイルに使う（FN0202-BR11）
pub fn create_dictionary_word(
    conn: &Connection,
    word: &str,
    user_id: &str,
) -> Result<String, DictionaryError> {
    let word = normalize_dictionary_word(word)?;
    if search_repo::create_dictionary_word(conn, &word, user_id)? == 0 {
        return Err(DictionaryError::Conflict(format!(
            "「{word}」は登録済みです"
        )));
    }
    Ok(word)
}

pub fn delete_dictionary_word(conn: &Connection, word: &str) -> Result<(), DictionaryError> {
    if search_repo::delete_dictionary_word(conn, word)? == 0 {
        return Err(DictionaryError::NotFound);
    }
    Ok(())
}

pub fn get_index_status(conn: &Connection) -> rusqlite::Result<IndexStatusResponse> {
    let words = search_repo::find_dictionary_words(conn)?;
    let [version, ocr_version] = index::current_versions(tokenizer::dictionary_version(&words));
    let counts = search_repo::count_index(conn, version, ocr_version)?;
    Ok(IndexStatusResponse {
        indexed: counts.indexed,
        outdated: counts.outdated,
        failed: counts.failed,
        too_large: counts.too_large,
        keywords: counts.keywords,
        last_run: index::last_run(),
        ocr_progress: crate::search::ocr::progress(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_dictionary_word_rejects_invalid_words() {
        assert_eq!(
            normalize_dictionary_word(" ＡＢＣ基盤 ").ok().unwrap(),
            "abc基盤"
        );
        assert_eq!(normalize_dictionary_word("ｶﾀｶﾅ").ok().unwrap(), "カタカナ");
        for word in ["", " ", "a b", "a,b", "a\"b", "!!", &"あ".repeat(51)] {
            assert!(normalize_dictionary_word(word).is_err(), "{word}");
        }
    }
}
