//! 検索の対象外（FN0202-BR16・BR17）。パス（そのフォルダ・ファイルと中のもの）と、
//! 名前の型（`*` と `?` を使える。どこにあっても）で決める

pub const KIND_PATH: &str = "path";
pub const KIND_NAME: &str = "name";

// 登録できる長さ
const VALUE_MAX: usize = 200;

#[derive(Default)]
pub struct Exclusions {
    // folder/ からのパス（先頭・末尾に / を付けない）
    paths: Vec<String>,
    // 名前の型（小文字にしたもの）
    names: Vec<Vec<char>>,
}

impl Exclusions {
    // (kind, value) の並びから作る。知らない kind は無視する
    pub fn new<'a>(rules: impl IntoIterator<Item = (&'a str, &'a str)>) -> Self {
        let mut exclusions = Self::default();
        for (kind, value) in rules {
            match kind {
                KIND_PATH => exclusions.paths.push(value.to_string()),
                KIND_NAME => exclusions
                    .names
                    .push(value.to_lowercase().chars().collect()),
                _ => {}
            }
        }
        exclusions
    }

    pub fn is_empty(&self) -> bool {
        self.paths.is_empty() && self.names.is_empty()
    }

    // folder/ からのパス（例: a/b/memo.txt）が対象外か。パスは同じフォルダか、その中なら一致とする。
    // 名前の型は、パスのどこかの名前（フォルダ名・ファイル名）が一致すれば対象外（大文字と小文字は区別しない）
    pub fn excludes(&self, path: &str) -> bool {
        if path.is_empty() {
            return false;
        }
        let in_path = self.paths.iter().any(|excluded| {
            path == excluded
                || path
                    .strip_prefix(excluded.as_str())
                    .is_some_and(|rest| rest.starts_with('/'))
        });
        in_path
            || (!self.names.is_empty()
                && path.split('/').any(|part| {
                    let part: Vec<char> = part.to_lowercase().chars().collect();
                    self.names.iter().any(|pattern| glob_match(pattern, &part))
                }))
    }
}

// 登録する値をそろえて確かめる。パスは \ を / にし、前後の / と空白を除く
pub fn normalize(kind: &str, value: &str) -> Result<String, String> {
    let value = value.trim();
    let value = match kind {
        KIND_PATH => {
            let path = value.replace('\\', "/");
            let path = path.trim_matches('/').to_string();
            if path.is_empty() {
                return Err(
                    "パスを入力してください（一番上のフォルダは指定できません）".to_string()
                );
            }
            if path.contains(':')
                || path
                    .split('/')
                    .any(|part| part.is_empty() || part == "." || part == "..")
            {
                return Err(
                    "パスは Folder の一番上からの場所で指定してください（例: 共有/古い資料）"
                        .to_string(),
                );
            }
            path
        }
        KIND_NAME => {
            if value.is_empty() {
                return Err("名前の型を入力してください".to_string());
            }
            if value.contains('/') || value.contains('\\') {
                return Err(
                    "名前の型に / は使えません。場所で指定するときはパスにしてください".to_string(),
                );
            }
            if value.chars().all(|c| c == '*' || c == '?') {
                return Err("すべての名前に一致する型は指定できません".to_string());
            }
            value.to_string()
        }
        _ => return Err("種類は path か name で指定してください".to_string()),
    };
    if value.chars().count() > VALUE_MAX {
        return Err(format!("{VALUE_MAX} 文字までで指定してください"));
    }
    Ok(value)
}

// * は 0 文字以上、? は 1 文字に一致する
fn glob_match(pattern: &[char], text: &[char]) -> bool {
    let (mut p, mut t) = (0, 0);
    // 最後に見た * の位置と、そのときの text の位置（一致しなければ * を 1 文字ずつ伸ばして試し直す）
    let mut star: Option<(usize, usize)> = None;
    while t < text.len() {
        if p < pattern.len() && (pattern[p] == '?' || pattern[p] == text[t]) {
            p += 1;
            t += 1;
        } else if p < pattern.len() && pattern[p] == '*' {
            star = Some((p, t));
            p += 1;
        } else if let Some((star_p, star_t)) = star {
            p = star_p + 1;
            t = star_t + 1;
            star = Some((star_p, star_t + 1));
        } else {
            return false;
        }
    }
    pattern[p..].iter().all(|&c| c == '*')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_excludes_itself_and_descendants_only() {
        let exclusions = Exclusions::new([(KIND_PATH, "a/backup")]);
        assert!(exclusions.excludes("a/backup"));
        assert!(exclusions.excludes("a/backup/x/memo.txt"));
        assert!(!exclusions.excludes("a/backup2/memo.txt"));
        assert!(!exclusions.excludes("a"));
        assert!(!exclusions.excludes("b/a/backup"));
        assert!(!exclusions.excludes(""));
    }

    #[test]
    fn name_pattern_matches_any_part_ignoring_case() {
        let exclusions = Exclusions::new([(KIND_NAME, "backup*"), (KIND_NAME, "*.bak")]);
        assert!(exclusions.excludes("Backup_20261122/仕様書.xlsx"));
        assert!(exclusions.excludes("a/b/backup/memo.txt"));
        assert!(exclusions.excludes("a/memo.BAK"));
        assert!(!exclusions.excludes("a/mybackup/memo.txt"));
        assert!(!exclusions.excludes("a/memo.bak.txt"));
    }

    #[test]
    fn glob_handles_question_and_multiple_stars() {
        let pattern: Vec<char> = "*_old*".chars().collect();
        assert!(glob_match(
            &pattern,
            &"仕様_old_v2".chars().collect::<Vec<_>>()
        ));
        assert!(glob_match(&pattern, &"_old".chars().collect::<Vec<_>>()));
        assert!(!glob_match(
            &pattern,
            &"仕様old".chars().collect::<Vec<_>>()
        ));
        let pattern: Vec<char> = "v?".chars().collect();
        assert!(glob_match(&pattern, &"v1".chars().collect::<Vec<_>>()));
        assert!(!glob_match(&pattern, &"v10".chars().collect::<Vec<_>>()));
    }

    #[test]
    fn normalize_cleans_and_rejects_values() {
        assert_eq!(normalize(KIND_PATH, " /a\\b/ ").unwrap(), "a/b");
        assert!(normalize(KIND_PATH, "/").is_err());
        assert!(normalize(KIND_PATH, "a/../b").is_err());
        assert!(normalize(KIND_PATH, "C:/a").is_err());
        assert_eq!(normalize(KIND_NAME, " backup* ").unwrap(), "backup*");
        assert!(normalize(KIND_NAME, "a/b").is_err());
        assert!(normalize(KIND_NAME, "**").is_err());
        assert!(normalize("other", "a").is_err());
    }
}
