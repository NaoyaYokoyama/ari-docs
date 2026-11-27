// SQL インジェクションを防ぐ決まりの見張り（テストだけ）。
// 利用者から来る値（タイトル・本文・ファイル名・パス・検索語など）は、必ず「?」で別に渡し、SQL の文字に混ぜない。
// SQL の文字を組み立ててよいのは、下の ALLOWED の名前だけ（中身はプログラムの中で決まった値か数）。
// src の中の format! で SQL を作っているところを全部読み、ほかの名前や位置（{}）で埋めていれば落とす
use std::fs;
use std::path::{Path, PathBuf};

// 組み立てに使ってよい名前と、入れてよいもの
const ALLOWED: [&str; 11] = [
    "SELECT",       // 各 repository の決まった SELECT の文（const）
    "OWNER",        // repository/content_folder.rs の決まった条件（const）
    "LOCKED",       // repository/session.rs の決まった条件（const）
    "target",       // repository/node.rs の決まった副問い合わせ（文字の定数）
    "table",        // 決まった表の名前（const の一覧から回す）
    "column",       // 決まった列の名前（const の一覧から回す）
    "placeholders", // 「?」を数だけ並べたもの
    "conditions",   // 「?番号」を使う決まった条件を並べたもの
    "exact",        // 「?番号」を並べたもの
    "limit",        // 数（i64）
    "i",            // 「?番号」の番号（数）
];

const SQL_WORDS: [&str; 10] = [
    "SELECT", "INSERT", "UPDATE", "DELETE", "WHERE", "FROM", "VALUES", "PRAGMA", "ATTACH", "VACUUM",
];

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).unwrap().flatten() {
        let path = entry.path();
        if path.is_dir() {
            rust_files(&path, out);
        } else if path.extension().is_some_and(|ext| ext == "rs") {
            out.push(path);
        }
    }
}

// text の先頭の文字列リテラル（"…" か r"…"・r#"…"#）の中身。無ければ None
fn string_literal(text: &str) -> Option<&str> {
    let text = text.trim_start();
    if let Some(rest) = text.strip_prefix('r') {
        let hashes = rest.chars().take_while(|&c| c == '#').count();
        let body = rest[hashes..].strip_prefix('"')?;
        let end = format!("\"{}", "#".repeat(hashes));
        return body.find(&end).map(|i| &body[..i]);
    }
    let body = text.strip_prefix('"')?;
    let bytes = body.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 2,
            b'"' => return Some(&body[..i]),
            _ => i += 1,
        }
    }
    None
}

fn looks_like_sql(literal: &str) -> bool {
    literal
        .split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
        .any(|word| SQL_WORDS.contains(&word))
}

// 埋めるところ（{名前} や {名前:書式}）の名前。{{ }} は文字の { }
fn holes(literal: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut chars = literal.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '{' {
            if chars.peek() == Some(&'{') {
                chars.next();
                continue;
            }
            let mut name = String::new();
            for c in chars.by_ref() {
                if c == '}' {
                    break;
                }
                name.push(c);
            }
            names.push(name.split(':').next().unwrap_or("").trim().to_string());
        }
    }
    names
}

#[test]
fn sql_is_built_only_from_fixed_parts() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    rust_files(&root, &mut files);
    let marker = concat!("format", "!(");
    let mut problems = Vec::new();
    let mut checked = 0;
    for file in files {
        if file.ends_with("database/sql_guard.rs") {
            continue;
        }
        let source = fs::read_to_string(&file).unwrap();
        for (at, _) in source.match_indices(marker) {
            let Some(literal) = string_literal(&source[at + marker.len()..]) else {
                continue;
            };
            if !looks_like_sql(literal) {
                continue;
            }
            checked += 1;
            let line = source[..at].lines().count();
            for name in holes(literal) {
                if !ALLOWED.contains(&name.as_str()) {
                    let shown = if name.is_empty() {
                        "{}（位置で埋める）".to_string()
                    } else {
                        format!("{{{name}}}")
                    };
                    problems.push(format!(
                        "{}:{line} {shown}",
                        file.strip_prefix(&root).unwrap().display()
                    ));
                }
            }
        }
    }
    assert!(
        checked > 10,
        "SQL の組み立てが見つからない（見張りが壊れている）"
    );
    assert!(
        problems.is_empty(),
        "SQL に決まった部品以外を埋めている。利用者から来る値は「?」で渡す（database/sql_guard.rs）:\n{}",
        problems.join("\n")
    );
}

#[test]
fn guard_finds_unsafe_holes() {
    assert_eq!(
        holes("SELECT * FROM {table} WHERE a = '{title}' AND b = {}"),
        ["table", "title", ""]
    );
    assert_eq!(holes("{{ {SELECT} }}"), ["SELECT"]);
    assert!(looks_like_sql("\n SELECT a FROM b"));
    assert!(!looks_like_sql("DB の写しを作れませんでした: {e}"));
    assert_eq!(string_literal(r##" r#"a"b"# , x"##), Some("a\"b"));
    assert_eq!(string_literal(r#" "a\"b", x"#), Some("a\\\"b"));
}
