//! あいまい検索（探して開く。FN0003）。打った文字が順に含まれていれば一致とし（fzf と同じ考え方）、
//! 名前（パスの最後・タイトル）での一致・単語の始まり・続いた文字を高くする。
//! 画面（front/src/quickOpen/fuzzy.ts）でも同じ点数の付け方で並べ直す
use super::tokenizer::normalize;

// 点数（fzf と同じ大きさ）。名前の中での一致と、名前の始まりからの一致を足す
const MATCH: i64 = 16;
const BOUNDARY: i64 = 8;
const CONSECUTIVE: i64 = 4;
const GAP_START: i64 = 3;
const GAP_EXTENSION: i64 = 1;
const NAME: i64 = 40;
const PREFIX: i64 = 16;

// 単語の区切りとみなす文字（この次の文字を単語の始まりとする）
const SEPARATORS: &[char] = &[
    '/', ' ', '_', '-', '.', '(', ')', '[', ']', '【', '】', '「', '」', '・',
];

// 全角・半角、大文字・小文字、カタカナ・ひらがなの違いをそろえる
pub fn fold(text: &str) -> Vec<char> {
    normalize(text)
        .chars()
        .map(|c| match c {
            'ァ'..='ヶ' => char::from_u32(c as u32 - 0x60).unwrap_or(c),
            _ => c,
        })
        .collect()
}

pub struct Query {
    terms: Vec<Vec<char>>,
}

impl Query {
    // 空白で区切った語。語が無ければ None
    pub fn parse(keyword: &str) -> Option<Query> {
        let folded: String = fold(keyword).into_iter().collect();
        let terms: Vec<Vec<char>> = folded
            .split_whitespace()
            .map(|term| term.chars().collect())
            .collect();
        (!terms.is_empty()).then_some(Query { terms })
    }

    // 場所（親のフォルダのパスなど。一番上は空文字）と名前に、すべての語が含まれていれば点数を返す
    pub fn score(&self, location: &str, name: &str) -> Option<i64> {
        let prefix = if location.is_empty() {
            Vec::new()
        } else {
            fold(&format!("{location}/"))
        };
        let name_start = prefix.len();
        let target: Vec<char> = prefix.into_iter().chain(fold(name)).collect();
        let mut total = 0;
        for term in &self.terms {
            // 名前の中で見つかればそちらを使う（場所だけで一致したものより上にする）
            let positions = find(&target, term, name_start).or_else(|| find(&target, term, 0))?;
            total += term_score(&target, &positions, name_start);
        }
        Some(total)
    }
}

// term の文字が from 以降に順に含まれる位置。なるべく短い範囲にする（前から探して終わりを決め、後ろから始まりを詰める）
fn find(target: &[char], term: &[char], from: usize) -> Option<Vec<usize>> {
    let mut index = 0;
    let mut end = None;
    for (position, c) in target.iter().enumerate().skip(from) {
        if *c == term[index] {
            index += 1;
            if index == term.len() {
                end = Some(position);
                break;
            }
        }
    }
    let end = end?;
    let mut start = end;
    let mut index = term.len();
    for position in (from..=end).rev() {
        if target[position] == term[index - 1] {
            index -= 1;
            if index == 0 {
                start = position;
                break;
            }
        }
    }
    let mut positions = Vec::with_capacity(term.len());
    for (position, c) in target.iter().enumerate().take(end + 1).skip(start) {
        if positions.len() < term.len() && *c == term[positions.len()] {
            positions.push(position);
        }
    }
    Some(positions)
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric()
}

fn is_boundary(target: &[char], position: usize, name_start: usize) -> bool {
    if position == 0 || position == name_start {
        return true;
    }
    let previous = target[position - 1];
    SEPARATORS.contains(&previous) || is_word(previous) != is_word(target[position])
}

fn term_score(target: &[char], positions: &[usize], name_start: usize) -> i64 {
    let mut score = 0;
    // 続いた文字は、続きの始まりの文字の点数（単語の始まりなど）を引き継ぐ
    let mut chunk = 0;
    for (index, &position) in positions.iter().enumerate() {
        let boundary = if is_boundary(target, position, name_start) {
            BOUNDARY
        } else {
            0
        };
        let bonus = if index > 0 && position == positions[index - 1] + 1 {
            boundary.max(chunk).max(CONSECUTIVE)
        } else {
            if index > 0 {
                let gap = (position - positions[index - 1] - 1) as i64;
                score -= GAP_START + (gap - 1) * GAP_EXTENSION;
            }
            chunk = boundary;
            boundary
        };
        // 最初の文字の点数は 2 倍にする
        score += MATCH + if index == 0 { bonus * 2 } else { bonus };
    }
    if positions[0] >= name_start {
        score += NAME;
        if positions[0] == name_start {
            score += PREFIX;
        }
    }
    score
}

#[cfg(test)]
mod tests {
    use super::*;

    fn score(keyword: &str, location: &str, name: &str) -> Option<i64> {
        Query::parse(keyword).unwrap().score(location, name)
    }

    #[test]
    fn matches_characters_in_order() {
        assert!(score("gjr", "", "議事録.txt").is_none());
        assert!(score("議録", "", "議事録.txt").is_some());
        assert!(score("録議", "", "議事録.txt").is_none());
        assert!(Query::parse("  　").is_none());
    }

    #[test]
    fn folds_width_case_and_kana() {
        assert!(score("readme", "", "README.md").is_some());
        assert!(score("ＲＥＡＤ", "", "readme.md").is_some());
        assert!(score("めも", "", "メモ.txt").is_some());
        assert!(score("ガイド", "", "ｶﾞｲﾄﾞ.pdf").is_some());
    }

    #[test]
    fn every_term_must_match_anywhere_in_path() {
        assert!(score("2026 議事録", "議事録", "2026-10.md").is_some());
        assert!(score("議事録 2025", "議事録", "2026-10.md").is_none());
    }

    #[test]
    fn prefers_name_word_start_and_consecutive_matches() {
        // 名前での一致 > 場所だけでの一致
        assert!(score("memo", "", "memo.txt") > score("memo", "memo", "a.txt"));
        // 続いた文字 > 離れた文字
        assert!(score("abc", "", "abc.txt") > score("abc", "", "a-b-c.txt"));
        // 名前の始まり > 途中
        assert!(score("doc", "", "doc.txt") > score("doc", "", "mydoc.txt"));
    }
}
