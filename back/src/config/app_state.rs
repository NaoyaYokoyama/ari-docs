use crate::config::app::AppConfig;

#[derive(Clone)]
pub struct AppState {
    pub config: AppConfig,
}
