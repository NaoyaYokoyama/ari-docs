// デスクトップアプリの更新ファイル（docs の FN0904）。共有サーバーの管理者が
// <データのフォルダ>/app-update/ に GitHub Releases の配布物（インストーラーと .sig）を置き、
// デスクトップアプリはここから新しい版を取ってくる
use std::path::{Path, PathBuf};

use semver::Version;

use crate::config::app::AppConfig;

// 配布物の名前の頭（tauri.conf.json の productName）
const PREFIX: &str = "ari-docs_";

// 更新できる OS と、配布物の名前の終わり（FN0904-BR11）
const PLATFORMS: [(&str, &str); 2] = [
    ("windows-x86_64", "_x64-setup.exe"),
    ("linux-x86_64", "_amd64.AppImage"),
];

pub fn update_dir(config: &AppConfig) -> PathBuf {
    config.data_dir().join("app-update")
}

#[derive(Debug, PartialEq)]
pub struct Release {
    pub version: Version,
    pub file_name: String,
    pub signature: String,
    // 変更点（FN0904-BR13）。<配布物>.notes.md、無ければ notes.md。どちらも無ければ空
    pub notes: String,
}

// 変更点のファイルの大きさの上限（画面に出すだけなので、大きすぎるものは読まない）
const MAX_NOTES_BYTES: u64 = 64 * 1024;

fn read_notes(dir: &Path, file_name: &str) -> String {
    [format!("{file_name}.notes.md"), "notes.md".to_string()]
        .iter()
        .map(|name| dir.join(name))
        .find(|path| {
            std::fs::metadata(path).is_ok_and(|m| m.is_file() && m.len() <= MAX_NOTES_BYTES)
        })
        .and_then(|path| std::fs::read_to_string(path).ok())
        .map(|text| text.trim().to_string())
        .unwrap_or_default()
}

// 配布物の名前から、OS（target-arch）と版を読む
fn parse_name(name: &str) -> Option<(&'static str, Version)> {
    let rest = name.strip_prefix(PREFIX)?;
    PLATFORMS.iter().find_map(|(platform, suffix)| {
        let version = rest.strip_suffix(suffix)?;
        Version::parse(version)
            .ok()
            .map(|version| (*platform, version))
    })
}

// その OS の一番新しい版。同じ名前の .sig があるものだけを数える
pub fn latest(dir: &Path, target: &str, arch: &str) -> Option<Release> {
    let platform = format!("{target}-{arch}");
    let entries = std::fs::read_dir(dir).ok()?;
    entries
        .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
        .filter_map(|name| {
            let (found, version) = parse_name(&name)?;
            if found != platform {
                return None;
            }
            let signature = std::fs::read_to_string(dir.join(format!("{name}.sig"))).ok()?;
            Some(Release {
                notes: read_notes(dir, &name),
                version,
                file_name: name,
                signature: signature.trim().to_string(),
            })
        })
        .max_by(|a, b| a.version.cmp(&b.version))
}

// ダウンロードさせてよい更新ファイルのパス。配布物の名前の形で、フォルダの中にあるものだけ
pub fn file_path(dir: &Path, name: &str) -> Option<PathBuf> {
    parse_name(name)?;
    let path = dir.join(name);
    path.is_file().then_some(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("ari-app-update-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn put(dir: &Path, name: &str, signature: Option<&str>) {
        std::fs::write(dir.join(name), b"x").unwrap();
        if let Some(signature) = signature {
            std::fs::write(dir.join(format!("{name}.sig")), signature).unwrap();
        }
    }

    #[test]
    fn parse_name_reads_platform_and_version() {
        assert_eq!(
            parse_name("ari-docs_0.2.0_x64-setup.exe"),
            Some(("windows-x86_64", Version::new(0, 2, 0)))
        );
        assert_eq!(
            parse_name("ari-docs_1.10.3_amd64.AppImage"),
            Some(("linux-x86_64", Version::new(1, 10, 3)))
        );
        assert_eq!(parse_name("ari-docs_0.2.0_x64-setup.exe.sig"), None);
        assert_eq!(parse_name("ari-docs_abc_x64-setup.exe"), None);
        assert_eq!(parse_name("other_0.2.0_x64-setup.exe"), None);
        assert_eq!(parse_name("ari-docs_0.2.0_x64_en-US.msi"), None);
    }

    #[test]
    fn latest_picks_newest_signed_file_for_platform() {
        let dir = temp_dir("latest");
        put(&dir, "ari-docs_0.2.0_x64-setup.exe", Some("sig-0.2.0\n"));
        put(&dir, "ari-docs_0.10.0_x64-setup.exe", Some("sig-0.10.0"));
        // 署名の無いものは数えない
        put(&dir, "ari-docs_0.11.0_x64-setup.exe", None);
        put(&dir, "ari-docs_0.12.0_amd64.AppImage", Some("sig-linux"));

        let release = latest(&dir, "windows", "x86_64").unwrap();
        assert_eq!(release.version, Version::new(0, 10, 0));
        assert_eq!(release.file_name, "ari-docs_0.10.0_x64-setup.exe");
        assert_eq!(release.signature, "sig-0.10.0");
        assert_eq!(release.notes, "");

        // 変更点: 配布物ごとのものを先に、無ければ notes.md
        std::fs::write(dir.join("notes.md"), "共通の変更点\n").unwrap();
        assert_eq!(
            latest(&dir, "windows", "x86_64").unwrap().notes,
            "共通の変更点"
        );
        std::fs::write(
            dir.join("ari-docs_0.10.0_x64-setup.exe.notes.md"),
            "0.10.0 の変更点",
        )
        .unwrap();
        assert_eq!(
            latest(&dir, "windows", "x86_64").unwrap().notes,
            "0.10.0 の変更点"
        );

        let linux = latest(&dir, "linux", "x86_64").unwrap();
        assert_eq!(linux.version, Version::new(0, 12, 0));
        assert!(latest(&dir, "darwin", "aarch64").is_none());
        assert!(latest(&dir.join("missing"), "windows", "x86_64").is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn file_path_allows_only_update_files_in_dir() {
        let dir = temp_dir("file");
        put(&dir, "ari-docs_0.2.0_x64-setup.exe", Some("sig"));
        std::fs::write(dir.join("memo.txt"), b"x").unwrap();

        assert!(file_path(&dir, "ari-docs_0.2.0_x64-setup.exe").is_some());
        assert!(file_path(&dir, "ari-docs_0.3.0_x64-setup.exe").is_none());
        assert!(file_path(&dir, "memo.txt").is_none());
        assert!(file_path(&dir, "../ari-docs_0.2.0_x64-setup.exe").is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
