use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AppMode {
    Local,
    Shared,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub mode: AppMode,
    // ノード（Folder 画面のファイル・フォルダ）のルート。back/ からの相対パスか絶対パス。
    // お気に入りなどがこのルートからの相対パスで記録されるため、アプリの初期設定でだけ決め、運用中は変えない
    #[serde(default = "default_folder_root")]
    pub folder_root: String,
    // DB ファイル。開発時は back/data/ari.db、デスクトップアプリでは <選んだフォルダ>/.ari-docs/ari.db
    #[serde(default = "default_database_path")]
    pub database_path: String,
    // Markdown ビューアの既定のフォルダ（初期フォルダが未設定のとき）。開発時はリポジトリの docs/
    #[serde(default = "default_docs_root")]
    pub docs_default_root: String,
    // 共有モードで待ち受けるアドレス（例: 0.0.0.0 で全ての NIC）。
    // ローカルモードでは使わず、常に 127.0.0.1 で待ち受ける（他の PC から接続させない）
    #[serde(default = "default_bind_address")]
    pub bind_address: String,
    // 待ち受けるポート（cargo run・サーバーとして起動するときに使う）
    #[serde(default = "default_port")]
    pub port: u16,
    // 共有モードの HTTPS の証明書・秘密鍵（PEM 形式のファイル）。両方あれば HTTPS で待ち受ける（FN0101-BR14）
    #[serde(default)]
    pub tls_cert: String,
    #[serde(default)]
    pub tls_key: String,
    // 文字認識のモデル（PaddleOCR）のフォルダ。相対パスは設定ファイルのフォルダから（開発時は back/models。FN0202-BR15）
    #[serde(default = "default_ocr_models_dir")]
    pub ocr_models_dir: String,
}

fn default_bind_address() -> String {
    "0.0.0.0".to_string()
}

fn default_port() -> u16 {
    8080
}

fn default_folder_root() -> String {
    "../folder".to_string()
}

fn default_database_path() -> String {
    "data/ari.db".to_string()
}

fn default_ocr_models_dir() -> String {
    "models".to_string()
}

fn default_docs_root() -> String {
    "../docs".to_string()
}

impl AppMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            AppMode::Local => "local",
            AppMode::Shared => "shared",
        }
    }

    pub fn is_local(&self) -> bool {
        matches!(self, AppMode::Local)
    }
}

impl AppConfig {
    // HTTPS の証明書と秘密鍵。ローカルモードと、片方だけのときは使わない
    pub fn tls_files(&self) -> Option<(&str, &str)> {
        if self.mode.is_local() || self.tls_cert.is_empty() || self.tls_key.is_empty() {
            None
        } else {
            Some((&self.tls_cert, &self.tls_key))
        }
    }

    // DB のあるフォルダ。ゴミ箱（trash/）・バックアップ（backups/）・作業用（tmp/）を置く
    pub fn data_dir(&self) -> std::path::PathBuf {
        std::path::Path::new(&self.database_path)
            .parent()
            .map(|dir| dir.to_path_buf())
            .unwrap_or_else(|| std::path::PathBuf::from("."))
    }

    // 待ち受けるアドレス。ローカルモードは自分の PC からだけ使えるようにする
    pub fn listen_address(&self) -> &str {
        if self.mode.is_local() {
            "127.0.0.1"
        } else {
            &self.bind_address
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_root_defaults_to_repository_folder() {
        let config: AppConfig = toml::from_str("mode = \"local\"").unwrap();
        assert_eq!(config.folder_root, "../folder");
    }

    #[test]
    fn local_mode_listens_only_on_loopback() {
        let config: AppConfig =
            toml::from_str("mode = \"local\"\nbind_address = \"0.0.0.0\"").unwrap();
        assert_eq!(config.listen_address(), "127.0.0.1");
        let config: AppConfig = toml::from_str("mode = \"shared\"").unwrap();
        assert_eq!(config.listen_address(), "0.0.0.0");
        assert_eq!(config.port, 8080);
        let config: AppConfig =
            toml::from_str("mode = \"shared\"\nbind_address = \"192.168.0.10\"").unwrap();
        assert_eq!(config.listen_address(), "192.168.0.10");
    }

    #[test]
    fn folder_root_can_be_set() {
        let config: AppConfig =
            toml::from_str("mode = \"local\"\nfolder_root = \"/data/ari\"").unwrap();
        assert_eq!(config.folder_root, "/data/ari");
    }
}
