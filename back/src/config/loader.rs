use std::fs;
use std::path::Path;

use crate::config::app::AppConfig;

// 開発用の設定（back/config.toml）を読む。
// 相対パスは back/ から解決する（cargo run のほか、デスクトップアプリのデバッグビルドからも使うため）
pub fn load() -> AppConfig {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("config.toml");
    load_file(&path).unwrap_or_else(|e| panic!("{e}"))
}

// 指定した設定ファイルを読む（共有サーバーとして起動するとき）。相対パスは設定ファイルのフォルダから解決する
pub fn load_file(path: &Path) -> Result<AppConfig, String> {
    println!("config path = {}", path.display());

    let content = fs::read_to_string(path)
        .map_err(|e| format!("設定ファイルを読めません（{}）: {e}", path.display()))?;
    let mut config: AppConfig = toml::from_str(&content).map_err(|e| {
        format!(
            "設定ファイルの書き方が正しくありません（{}）: {e}",
            path.display()
        )
    })?;
    let dir = path.parent().unwrap_or(Path::new("."));
    config.folder_root = resolve(dir, &config.folder_root);
    config.database_path = resolve(dir, &config.database_path);
    config.docs_default_root = resolve(dir, &config.docs_default_root);
    config.ocr_models_dir = resolve(dir, &config.ocr_models_dir);
    for path in [&mut config.tls_cert, &mut config.tls_key] {
        if !path.is_empty() {
            *path = resolve(dir, path);
        }
    }
    Ok(config)
}

fn resolve(base: &Path, value: &str) -> String {
    let path = base.join(value);
    fs::canonicalize(&path)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_resolves_relative_paths_from_back_dir() {
        let config = load();
        let back = fs::canonicalize(env!("CARGO_MANIFEST_DIR")).unwrap();
        assert!(Path::new(&config.folder_root).is_absolute());
        assert!(Path::new(&config.database_path).starts_with(&back));
        assert_eq!(
            Path::new(&config.docs_default_root),
            back.parent().unwrap().join("docs")
        );
    }
}
