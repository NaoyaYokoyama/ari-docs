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
