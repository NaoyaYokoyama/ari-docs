use crate::api::docs::response::{DocEntry, DocFileResponse, DocsIndexResponse};
use crate::common::fs_util::relative_slash_path;
use crate::config::app::AppMode;
use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

#[cfg(test)]
const DEFAULT_ROOT: &str = "../docs";

// 指定フォルダ以下の .md をすべて返す（パス順）
pub fn get_docs(
    mode: &AppMode,
    root: Option<&str>,
    saved_root: &str,
    default_root: &str,
) -> io::Result<DocsIndexResponse> {
    let (root, notice) = resolve_root(mode, root, saved_root, default_root)?;
    let root = root.as_path();
    let mut files = Vec::new();
    collect_markdown(root, &mut files)?;
    files.sort();

    let mut docs = Vec::new();
    for file in files {
        let content = fs::read_to_string(&file)?;
        let (front_matter, _) = parse_front_matter(&content);
        let path = relative_slash_path(root, &file)
            .ok_or_else(|| io::Error::other("Docs のフォルダの外のファイルです"))?;
        let name = file
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();
        docs.push(DocEntry {
            path,
            name,
            has_front_matter: front_matter.is_some(),
            front_matter: front_matter.unwrap_or_default(),
        });
    }

    Ok(DocsIndexResponse {
        root: root.to_string_lossy().to_string(),
        notice: notice.unwrap_or_default(),
        docs,
    })
}

// 指定フォルダ以下の .md を1件返す
pub fn get_doc(
    mode: &AppMode,
    root: Option<&str>,
    saved_root: &str,
    default_root: &str,
    path: &str,
) -> io::Result<DocFileResponse> {
    let (root, _) = resolve_root(mode, root, saved_root, default_root)?;
    let full_path = resolve_doc_path(&root, path)?;
    let content = fs::read_to_string(full_path)?;
    Ok(DocFileResponse {
        path: path.to_string(),
        content,
    })
}

// 未設定のときに表示するフォルダ（設定の docs_default_root）の絶対パス
pub fn absolute_default_root(default_root: &str) -> String {
    fs::canonicalize(default_root)
        .map(|root| root.to_string_lossy().to_string())
        .unwrap_or_else(|_| default_root.to_string())
}

// パスを、存在するフォルダの絶対パスにする
pub fn canonical_dir(path: &str) -> io::Result<PathBuf> {
    let dir = fs::canonicalize(path)?;
    if !dir.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("not a directory: {}", dir.display()),
        ));
    }
    Ok(dir)
}

// 表示するフォルダを決める。優先順位は URL の指定 > 設定の初期フォルダ > リポジトリの docs/。
// 任意のフォルダを読めるのはローカルモードのみ（共有モードでは他人に PC 内のファイルを見せてしまうため）。
// 設定の初期フォルダが使えないときは docs/ を表示し、その説明を返す
fn resolve_root(
    mode: &AppMode,
    root: Option<&str>,
    saved_root: &str,
    default_root: &str,
) -> io::Result<(PathBuf, Option<String>)> {
    if let Some(root) = root.map(str::trim).filter(|root| !root.is_empty()) {
        if !mode.is_local() {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "folder can be specified only in local mode",
            ));
        }
        return Ok((canonical_dir(root)?, None));
    }

    let saved_root = saved_root.trim();
    if mode.is_local() && !saved_root.is_empty() {
        match canonical_dir(saved_root) {
            Ok(dir) => return Ok((dir, None)),
            Err(_) => {
                let notice = format!(
                    "設定の初期フォルダ（{}）が見つからないため、既定のフォルダを表示しています",
                    saved_root
                );
                return Ok((canonical_dir(default_root)?, Some(notice)));
            }
        }
    }

    Ok((canonical_dir(default_root)?, None))
}

// root の外を読めないよう、相対パスで ".." などを含まない .md のみ許可する。
// シンボリックリンクで外に出る場合も弾く
fn resolve_doc_path(root: &Path, path: &str) -> io::Result<PathBuf> {
    let relative = Path::new(path);
    let is_safe = !path.is_empty()
        && relative
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
        && relative.extension().is_some_and(|ext| ext == "md");
    if !is_safe {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("invalid doc path: {}", path),
        ));
    }
    let full_path = fs::canonicalize(root.join(relative))?;
    if !full_path.starts_with(root) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("outside of root: {}", path),
        ));
    }
    Ok(full_path)
}

fn collect_markdown(dir: &Path, files: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            collect_markdown(&path, files)?;
        } else if path.extension().is_some_and(|ext| ext == "md") {
            files.push(path);
        }
    }
    Ok(())
}

// 先頭の "---" で囲まれた部分を key: value として読む（" #" 以降はコメント）
pub fn parse_front_matter(content: &str) -> (Option<BTreeMap<String, String>>, &str) {
    let Some(rest) = content.strip_prefix("---\n") else {
        return (None, content);
    };
    let Some(end) = rest.find("\n---") else {
        return (None, content);
    };

    let mut map = BTreeMap::new();
    for line in rest[..end].lines() {
        let line = match line.find(" #") {
            Some(index) => &line[..index],
            None => line,
        };
        if let Some((key, value)) = line.split_once(':') {
            map.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    let body = rest[end + 4..].trim_start_matches('\n');
    (Some(map), body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_front_matter_reads_values_and_strips_comments() {
        let content = "---\nid: 900_APIテンプレート  # コピーしたら書き換える\nrelated: [FN001, API002]\n---\n\n# 本文\n";
        let (front_matter, body) = parse_front_matter(content);
        let front_matter = front_matter.unwrap();
        assert_eq!(front_matter["id"], "900_APIテンプレート");
        assert_eq!(front_matter["related"], "[FN001, API002]");
        assert_eq!(body, "# 本文\n");
    }

    #[test]
    fn parse_front_matter_returns_none_without_header() {
        let (front_matter, body) = parse_front_matter("# 本文\n");
        assert!(front_matter.is_none());
        assert_eq!(body, "# 本文\n");
    }

    #[test]
    fn resolve_doc_path_rejects_outside_root() {
        let root = fs::canonicalize(DEFAULT_ROOT).unwrap();
        assert!(resolve_doc_path(&root, "../back/config.toml").is_err());
        assert!(resolve_doc_path(&root, "/etc/passwd").is_err());
        assert!(resolve_doc_path(&root, "00_概要/../../secret.md").is_err());
        assert!(resolve_doc_path(&root, "00_概要/a.txt").is_err());
        assert!(resolve_doc_path(&root, "").is_err());
        assert!(resolve_doc_path(&root, "00_概要/0090_ドキュメントルール.md").is_ok());
    }

    #[test]
    fn resolve_root_allows_any_folder_only_in_local_mode() {
        assert!(resolve_root(&AppMode::Local, Some("../front"), "", DEFAULT_ROOT).is_ok());
        assert!(resolve_root(&AppMode::Shared, Some("../front"), "", DEFAULT_ROOT).is_err());
        assert!(resolve_root(&AppMode::Shared, None, "", DEFAULT_ROOT).is_ok());
        assert!(
            resolve_root(
                &AppMode::Local,
                Some("../back/Cargo.toml"),
                "",
                DEFAULT_ROOT
            )
            .is_err()
        );
    }

    #[test]
    fn resolve_root_prefers_url_then_saved_then_default() {
        let front = fs::canonicalize("../front").unwrap();
        let back = fs::canonicalize("../back").unwrap();
        let docs = fs::canonicalize(DEFAULT_ROOT).unwrap();
        // URL の指定が最優先
        let (dir, notice) =
            resolve_root(&AppMode::Local, Some("../front"), "../back", DEFAULT_ROOT).unwrap();
        assert_eq!((dir, notice), (front, None));
        // URL の指定が無ければ設定の初期フォルダ
        let (dir, notice) = resolve_root(&AppMode::Local, None, "../back", DEFAULT_ROOT).unwrap();
        assert_eq!((dir, notice), (back, None));
        // どちらも無ければ docs/
        let (dir, notice) = resolve_root(&AppMode::Local, None, "", DEFAULT_ROOT).unwrap();
        assert_eq!((dir, notice), (docs.clone(), None));
        // 共有モードでは設定の初期フォルダを使わない
        let (dir, _) = resolve_root(&AppMode::Shared, None, "../back", DEFAULT_ROOT).unwrap();
        assert_eq!(dir, docs);
    }

    #[test]
    fn resolve_root_falls_back_to_default_when_saved_root_is_missing() {
        let docs = fs::canonicalize(DEFAULT_ROOT).unwrap();
        let (dir, notice) =
            resolve_root(&AppMode::Local, None, "/no/such/folder", DEFAULT_ROOT).unwrap();
        assert_eq!(dir, docs);
        assert!(notice.unwrap().contains("/no/such/folder"));
    }
}
