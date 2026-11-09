use std::borrow::Cow;
use std::collections::BTreeSet;
use std::sync::{Arc, RwLock};

use lindera::dictionary::{DictionaryBuilder, load_dictionary};
use lindera::mode::{Mode, Penalty};
use lindera::segmenter::Segmenter;
use unicode_normalization::UnicodeNormalization;

// 単語の区切り（形態素解析）。辞書は IPADIC を組み込み、利用者が登録した単語（search_dictionary）をユーザー辞書として足す。
// 辞書を作るのに時間がかかるため、作ったものを使い回し、ユーザー辞書が変わったときだけ作り直す
pub struct Tokenizer {
    // 作ったときのユーザー辞書の版（dictionary_version）
    pub version: i64,
    // 普通の区切り（「関西国際空港」のように辞書にある長い語はそのまま）
    normal: Segmenter,
    // 長い漢字の語を細かく区切る（「関西国際空港」→「関西」「国際」「空港」）
    decompose: Segmenter,
}

// 登録しない品詞（IPADIC の品詞の先頭）。単独では検索に使わないため
const SKIP_POS: [&str; 4] = ["助詞", "助動詞", "記号", "フィラー"];

// 1 つの語の最大の文字数。長すぎるものは文字化けや区切りの失敗のため登録しない
const MAX_WORD_CHARS: usize = 50;

static TOKENIZER: RwLock<Option<Arc<Tokenizer>>> = RwLock::new(None);

// ユーザー辞書の版。単語の一覧から計算する（変わったらすべてのファイルを取り込み直す）。
// 版は DB に保存するため、Rust の版で変わらない FNV-1a で計算する
pub fn dictionary_version(words: &[String]) -> i64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for word in words {
        for byte in word.bytes().chain(std::iter::once(b'\n')) {
            hash ^= byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
    }
    hash as i64
}

impl Tokenizer {
    // words: ユーザー辞書の単語（表記）
    pub fn new(words: &[String]) -> Result<Self, String> {
        Ok(Self {
            version: dictionary_version(words),
            normal: build_segmenter(Mode::Normal, words)?,
            decompose: build_segmenter(Mode::Decompose(Penalty::default()), words)?,
        })
    }

    // ファイルの中身の単語（索引に登録するもの）。普通の区切りと細かい区切りの両方を集め、重複をまとめる
    pub fn index_words(&self, text: &str) -> BTreeSet<String> {
        let text = normalize(text);
        let mut words = BTreeSet::new();
        // 長い文章を一度に区切ると時間とメモリがかかるため、行ごとに区切る
        for line in text.lines() {
            collect(&self.normal, line, &mut words);
            collect(&self.decompose, line, &mut words);
        }
        words
    }

    // 検索のキーワードの単語。すべてを含むファイルを探す（AND）
    pub fn query_words(&self, keyword: &str) -> BTreeSet<String> {
        let text = normalize(keyword);
        let mut words = BTreeSet::new();
        for part in text.split_whitespace() {
            collect(&self.normal, part, &mut words);
        }
        words
    }
}

fn build_segmenter(mode: Mode, words: &[String]) -> Result<Segmenter, String> {
    let dictionary =
        load_dictionary("embedded://ipadic").map_err(|e| format!("辞書を読めません: {e}"))?;
    let user_dictionary = if words.is_empty() {
        None
    } else {
        // 簡易形式（表記,品詞,読み）。読みは検索に使わないため表記を入れる
        let csv: String = words
            .iter()
            .map(|word| format!("{},カスタム名詞,{}\n", csv_field(word), csv_field(word)))
            .collect();
        let builder = DictionaryBuilder::new((*dictionary.metadata).clone());
        Some(
            builder
                .build_user_dict_from_reader(csv.as_bytes())
                .map_err(|e| format!("ユーザー辞書を作れません: {e}"))?,
        )
    };
    Ok(Segmenter::new(mode, dictionary, user_dictionary))
}

// CSV の区切りの , と " を含む語は登録時に弾く（validate_dictionary_word）が、念のため取り除く
fn csv_field(word: &str) -> String {
    word.replace([',', '"', '\n', '\r'], "")
}

fn collect(segmenter: &Segmenter, text: &str, words: &mut BTreeSet<String>) {
    let Ok(mut tokens) = segmenter.segment(Cow::Borrowed(text)) else {
        return;
    };
    for token in tokens.iter_mut() {
        let surface = token.surface.trim().to_string();
        if surface.is_empty() || surface.chars().count() > MAX_WORD_CHARS {
            continue;
        }
        let pos = token
            .details()
            .first()
            .map(|pos| pos.to_string())
            .unwrap_or_default();
        if SKIP_POS.contains(&pos.as_str()) {
            continue;
        }
        // 区切りの失敗で記号だけになったもの、ひらがな 1 文字（活用の「し」など）は登録しない
        if !surface.chars().any(char::is_alphanumeric) || is_single_hiragana(&surface) {
            continue;
        }
        words.insert(surface);
    }
}

fn is_single_hiragana(word: &str) -> bool {
    let mut chars = word.chars();
    matches!((chars.next(), chars.next()), (Some('ぁ'..='ゖ'), None))
}

// 表記のゆれをそろえる（全角英数字と半角カナを NFKC で直し、英字は小文字にする）
pub fn normalize(text: &str) -> String {
    text.nfkc().collect::<String>().to_lowercase()
}

// 作ってある区切りを返す。ユーザー辞書の単語（words）が変わっていれば作り直す
pub fn get(words: &[String]) -> Result<Arc<Tokenizer>, String> {
    let version = dictionary_version(words);
    if let Some(tokenizer) = TOKENIZER.read().unwrap().as_ref()
        && tokenizer.version == version
    {
        return Ok(tokenizer.clone());
    }
    let tokenizer = Arc::new(Tokenizer::new(words)?);
    *TOKENIZER.write().unwrap() = Some(tokenizer.clone());
    Ok(tokenizer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn index_words_split_japanese() {
        let tokenizer = Tokenizer::new(&[]).unwrap();
        let words = tokenizer.index_words("関西国際空港の議事録を作成しました。Excel２０２４");
        println!("{words:?}");
        // IPADIC では「議事録」は「議事」「録」に分かれる（検索のキーワードも同じく分かれるので見つかる）
        for word in [
            "関西国際空港",
            "空港",
            "議事",
            "録",
            "作成",
            "excel",
            "2024",
        ] {
            assert!(words.contains(word), "{word}: {words:?}");
        }
        for word in ["の", "を", "。", "し"] {
            assert!(!words.contains(word), "{word}");
        }
    }

    #[test]
    fn user_dictionary_keeps_custom_terms() {
        let text = "ありドックス連携基盤の設計";
        let plain = Tokenizer::new(&[]).unwrap();
        println!("{:?}", plain.index_words(text));
        let custom = Tokenizer::new(&["ありドックス連携基盤".to_string()]).unwrap();
        let words = custom.index_words(text);
        println!("{words:?}");
        assert!(words.contains("ありドックス連携基盤"));
        assert_eq!(
            custom.query_words("ありドックス連携基盤"),
            BTreeSet::from(["ありドックス連携基盤".to_string()])
        );
    }

    #[test]
    fn dictionary_version_changes_with_words() {
        let a = dictionary_version(&["ab".to_string(), "c".to_string()]);
        let b = dictionary_version(&["a".to_string(), "bc".to_string()]);
        assert_ne!(a, b);
        assert_eq!(a, dictionary_version(&["ab".to_string(), "c".to_string()]));
        assert_eq!(get(&[]).unwrap().version, dictionary_version(&[]));
    }

    #[test]
    fn query_words_normalize_width_and_case() {
        let tokenizer = Tokenizer::new(&[]).unwrap();
        assert_eq!(
            tokenizer.query_words("ＥＸＣＥＬ　関西国際空港"),
            BTreeSet::from(["excel".to_string(), "関西国際空港".to_string()])
        );
    }
}
