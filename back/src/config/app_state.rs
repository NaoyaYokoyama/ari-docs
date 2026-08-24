use crate::config::app::AppConfig;
use crate::model::session::Sessions;

#[derive(Clone)]
pub struct AppState {
    pub sessions: Sessions,
    pub config: AppConfig,
}
